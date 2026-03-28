import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  type AttackTrajectory,
  createIncidentId,
  type Incident,
  type IncidentCategory,
  type IncidentPoint,
  type IncidentSeverity,
  type IncidentVerification,
} from "@/lib/incidents";

export type ImportSourceFormat = "rss" | "json" | "ais" | "osint" | "aisstream" | "oref";

export type AisFieldMap = {
  vesselName?: string;
  lat: string;
  lng: string;
  mmsi?: string;
  speed?: string;
  heading?: string;
  shipType?: string;
  destination?: string;
  timestamp?: string;
};

export type OsintFieldMap = {
  title?: string;
  description?: string;
  lat: string;
  lng: string;
  label?: string;
  date?: string;
  unitType?: string;
};

export type ImportSource = {
  id: string;
  label: string;
  enabled: boolean;
  url: string;
  format: ImportSourceFormat;
  description: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  verification: IncidentVerification;
  tagSeed: string[];
  apiKey?: string;
  itemPath?: string;
  fieldMap?: {
    title: string;
    summary?: string;
    body?: string;
    location?: string;
    link?: string;
    publishedAt?: string;
  };
  aisFieldMap?: AisFieldMap;
  osintFieldMap?: OsintFieldMap;
};

type ImportSourceDataset = {
  sources: ImportSource[];
};

const IMPORT_SOURCES_PATH = path.join(
  process.cwd(),
  "data",
  "import-sources.json",
);

const FETCH_TIMEOUT_MS = 12_000;

// Default item limit for scheduled runs. Backfill mode uses a higher cap
// (RSS feeds typically only carry the last 20–50 items regardless of limit).
const DEFAULT_ITEM_LIMIT = 15;
const BACKFILL_ITEM_LIMIT = 500;

type ParsedFeedItem = {
  title: string;
  summary: string;
  body?: string;
  location?: string;
  link?: string;
  publishedAt: string;
  mapPoint?: IncidentPoint;
  trajectories?: AttackTrajectory[];
};

export type ImportSourceError = {
  sourceId: string;
  label: string;
  error: string;
};

export async function readImportSources() {
  const raw = await fs.readFile(IMPORT_SOURCES_PATH, "utf8");
  const parsed = JSON.parse(raw) as ImportSourceDataset;
  return parsed.sources;
}

export async function importFromSourceId(
  sourceId: string,
  itemLimit = DEFAULT_ITEM_LIMIT,
) {
  const sources = await readImportSources();
  const source = sources.find((item) => item.id === sourceId);

  if (!source) {
    throw new Error(`Import source "${sourceId}" neexistuje.`);
  }

  if (!source.enabled) {
    throw new Error(`Import source "${source.label}" je vypnutý.`);
  }

  // AIS stream uses WebSocket — skip the HTTP fetch path entirely.
  if (source.format === "aisstream") {
    const wsItems = await importAisStream(source, itemLimit);
    return wsItems.map((item) => toImportedIncident(source, item));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(source.url, {
      headers: {
        "User-Agent": "IranWarDeskImporter/1.0",
        Accept:
          "application/rss+xml, application/atom+xml, application/json, text/xml, */*",
      },
      next: { revalidate: 0 },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Import selhal: ${source.label} – timeout po ${FETCH_TIMEOUT_MS / 1000}s.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(
      `Import selhal: ${source.label} vrátil ${response.status} ${response.statusText}.`,
    );
  }

  const payload = await response.text();
  let items: ParsedFeedItem[];

  switch (source.format) {
    case "rss":
      items = parseRssLikeFeed(payload, itemLimit);
      break;
    case "json":
      items = parseJsonFeed(payload, source, itemLimit);
      break;
    case "ais":
      items = parseAisFeed(payload, source, itemLimit);
      break;
    case "osint":
      items = parseOsintFeed(payload, source, itemLimit);
      break;
    case "oref":
      items = parseOrefAlerts(payload, itemLimit);
      break;
    default:
      throw new Error(`Neznámý formát zdroje: ${(source as ImportSource).format}`);
  }

  return items.map((item) => toImportedIncident(source, item));
}

export async function importAllEnabledSources(
  backfill = false,
): Promise<{
  sourceCount: number;
  items: Incident[];
  errors: ImportSourceError[];
}> {
  const sources = await readImportSources();
  const enabledSources = sources.filter((source) => source.enabled);
  const imported: Incident[] = [];
  const errors: ImportSourceError[] = [];
  const limit = backfill ? BACKFILL_ITEM_LIMIT : DEFAULT_ITEM_LIMIT;

  for (const source of enabledSources) {
    try {
      const items = await importFromSourceId(source.id, limit);
      imported.push(...items);
    } catch (err) {
      errors.push({
        sourceId: source.id,
        label: source.label,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    sourceCount: enabledSources.length,
    items: imported,
    errors,
  };
}

function toImportedIncident(source: ImportSource, item: ParsedFeedItem): Incident {
  const fingerprint = createHash("sha1")
    .update(`${source.id}:${item.link ?? item.title}:${item.publishedAt}`)
    .digest("hex")
    .slice(0, 10);

  return {
    id: createIncidentId(`${source.id}-${fingerprint}-${item.title}`, item.publishedAt),
    title: item.title,
    summary: item.summary,
    body: item.body,
    location: item.location || "Lokalita čeká na doplnění",
    publishedAt: item.publishedAt,
    category: source.category,
    severity: source.severity,
    verification: source.verification,
    featured: false,
    isTemplate: false,
    origin: "imported",
    importSourceId: source.id,
    tags: source.tagSeed,
    sourceCount: item.link ? 1 : 0,
    mapPoint: item.mapPoint,
    trajectories: item.trajectories,
    sources: item.link
      ? [
          {
            label: source.label,
            url: item.link,
            type: "media",
            publishedAt: item.publishedAt,
          },
        ]
      : [],
  };
}

// ---------------------------------------------------------------------------
// RSS / Atom parser
// ---------------------------------------------------------------------------

function parseRssLikeFeed(xml: string, limit: number): ParsedFeedItem[] {
  const itemBlocks = matchBlocks(xml, "item");
  const entryBlocks = matchBlocks(xml, "entry");
  const blocks = itemBlocks.length > 0 ? itemBlocks : entryBlocks;

  return blocks.slice(0, limit).map((block) => {
    const title = decodeXml(
      getTagContent(block, "title") ?? "Bez názvu z importu",
    );
    const description = decodeXml(
      getTagContent(block, "description") ??
        getTagContent(block, "summary") ??
        getTagContent(block, "content") ??
        "",
    );
    const link =
      getAtomLink(block) ?? decodeXml(getTagContent(block, "link") ?? "");
    const publishedAt =
      getTagContent(block, "pubDate") ??
      getTagContent(block, "published") ??
      getTagContent(block, "updated") ??
      new Date().toISOString();

    return {
      title,
      summary:
        stripHtml(description).slice(0, 320) || "Importovaný záznam bez shrnutí.",
      body: stripHtml(description),
      link: link || undefined,
      publishedAt: normalizeDate(publishedAt),
    };
  });
}

// ---------------------------------------------------------------------------
// Generic JSON feed parser
// ---------------------------------------------------------------------------

function parseJsonFeed(
  payload: string,
  source: ImportSource,
  limit: number,
): ParsedFeedItem[] {
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  const items = readPath(parsed, source.itemPath ?? "items");

  if (!Array.isArray(items)) {
    throw new Error(`JSON source "${source.label}" nemá pole položek.`);
  }

  return items.slice(0, limit).map((rawItem) => {
    const item = rawItem as Record<string, unknown>;

    return {
      title:
        asString(readPath(item, source.fieldMap?.title ?? "title")) ||
        "Bez názvu z JSON importu",
      summary:
        asString(readPath(item, source.fieldMap?.summary ?? "summary")) ||
        asString(readPath(item, source.fieldMap?.body ?? "body")) ||
        "Importovaný záznam bez shrnutí.",
      body: asString(readPath(item, source.fieldMap?.body ?? "body")) || undefined,
      location:
        asString(readPath(item, source.fieldMap?.location ?? "location")) ||
        undefined,
      link:
        asString(readPath(item, source.fieldMap?.link ?? "url")) || undefined,
      publishedAt: normalizeDate(
        asString(
          readPath(item, source.fieldMap?.publishedAt ?? "publishedAt"),
        ) || new Date().toISOString(),
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// AIS vessel position parser
//
// Supports MarineTraffic / VesselFinder JSON responses.
// Each vessel becomes one incident with a mapPoint set to the vessel's
// current position. The title includes vessel name + speed + destination.
//
// Note: the URL must already include the API key (or it can be substituted
// server-side using the `apiKey` field; replace PLACEHOLDER_API_KEY in the
// URL with the actual key before enabling the source).
// ---------------------------------------------------------------------------

function parseAisFeed(
  payload: string,
  source: ImportSource,
  limit: number,
): ParsedFeedItem[] {
  const fm: AisFieldMap = source.aisFieldMap ?? { lat: "LAT", lng: "LON" };
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  const items = readPath(parsed, source.itemPath ?? "DATA");

  if (!Array.isArray(items)) {
    throw new Error(`AIS source "${source.label}" nemá pole lodí (itemPath="${source.itemPath ?? "DATA"}").`);
  }

  const now = new Date().toISOString();

  return items.slice(0, limit).map((rawItem) => {
    const v = rawItem as Record<string, unknown>;

    const lat = asNumber(readPath(v, fm.lat));
    const lng = asNumber(readPath(v, fm.lng));
    const name = asString(readPath(v, fm.vesselName ?? "SHIPNAME")) || "Neznámá loď";
    const mmsi = asString(readPath(v, fm.mmsi ?? "MMSI"));
    const speed = asNumber(readPath(v, fm.speed ?? "SPEED"));
    const heading = asNumber(readPath(v, fm.heading ?? "HEADING"));
    const shipType = asString(readPath(v, fm.shipType ?? "SHIP_TYPE"));
    const destination = asString(readPath(v, fm.destination ?? "DESTINATION"));
    const timestamp = normalizeDate(
      asString(readPath(v, fm.timestamp ?? "TIMESTAMP")) || now,
    );

    const titleParts = [name];
    if (destination) titleParts.push(`→ ${destination}`);
    if (speed > 0) titleParts.push(`${speed.toFixed(1)} kn`);

    const summaryParts: string[] = [];
    if (mmsi) summaryParts.push(`MMSI: ${mmsi}`);
    if (shipType) summaryParts.push(`Typ: ${shipType}`);
    if (heading > 0) summaryParts.push(`Kurz: ${heading}°`);
    if (destination) summaryParts.push(`Cíl: ${destination}`);

    return {
      title: titleParts.join(" – "),
      summary: summaryParts.join(" | ") || `AIS poloha lodi ${name}`,
      publishedAt: timestamp,
      mapPoint:
        isValidLatLng(lat, lng)
          ? { lat, lng, label: name }
          : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// OSINT unit position parser
//
// Compatible with Liveuamap-style JSON exports and custom OSINT feeds.
// Each event/unit becomes one incident with a mapPoint.
// ---------------------------------------------------------------------------

function parseOsintFeed(
  payload: string,
  source: ImportSource,
  limit: number,
): ParsedFeedItem[] {
  const fm: OsintFieldMap = source.osintFieldMap ?? { lat: "lat", lng: "lng" };
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  const items = readPath(parsed, source.itemPath ?? "events");

  if (!Array.isArray(items)) {
    throw new Error(`OSINT source "${source.label}" nemá pole událostí (itemPath="${source.itemPath ?? "events"}").`);
  }

  const now = new Date().toISOString();

  return items.slice(0, limit).map((rawItem) => {
    const v = rawItem as Record<string, unknown>;

    const lat = asNumber(readPath(v, fm.lat));
    const lng = asNumber(readPath(v, fm.lng));
    const title =
      asString(readPath(v, fm.title ?? "title")) || "OSINT hlášení";
    const description =
      asString(readPath(v, fm.description ?? "description")) || "";
    const locationLabel =
      asString(readPath(v, fm.label ?? "location")) || undefined;
    const unitType =
      asString(readPath(v, fm.unitType ?? "type")) || undefined;
    const date = normalizeDate(
      asString(readPath(v, fm.date ?? "date")) || now,
    );

    const fullTitle = unitType ? `[${unitType}] ${title}` : title;

    return {
      title: fullTitle,
      summary:
        description.slice(0, 320) ||
        `OSINT: ${fullTitle}${locationLabel ? ` – ${locationLabel}` : ""}`,
      body: description || undefined,
      location: locationLabel,
      publishedAt: date,
      mapPoint:
        isValidLatLng(lat, lng)
          ? { lat, lng, label: locationLabel ?? title }
          : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// aisstream.io WebSocket importer
//
// Opens a short-lived WebSocket connection (Node.js 21+ native WebSocket),
// collects PositionReport messages for COLLECT_MS milliseconds, then closes.
// The bounding box covers the Persian Gulf, Red Sea, and eastern Mediterranean.
// ---------------------------------------------------------------------------

const AIS_COLLECT_MS = 8_000;

async function importAisStream(
  source: ImportSource,
  limit: number,
): Promise<ParsedFeedItem[]> {
  return new Promise<ParsedFeedItem[]>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ws = new (globalThis as any).WebSocket(source.url);
    const collected: ParsedFeedItem[] = [];
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(collected);
    };

    const timer = setTimeout(() => finish(), AIS_COLLECT_MS);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          Apikey: source.apiKey ?? "",
          BoundingBoxes: [[12, 32], [30, 60]],
          FilterMessageTypes: ["PositionReport"],
        }),
      );
    };

    ws.onmessage = (event: { data: unknown }) => {
      if (collected.length >= limit) { finish(); return; }
      try {
        const raw = typeof event.data === "string" ? event.data : String(event.data);
        const msg = JSON.parse(raw) as Record<string, unknown>;
        const meta = msg.MetaData as Record<string, unknown> | undefined;
        const pos = (msg.Message as Record<string, unknown> | undefined)
          ?.PositionReport as Record<string, unknown> | undefined;

        if (!meta || !pos) return;

        const lat = asNumber(pos.Latitude ?? meta.latitude);
        const lng = asNumber(pos.Longitude ?? meta.longitude);
        if (!isValidLatLng(lat, lng)) return;

        const name = asString(meta.ShipName).trim() || "Unknown vessel";
        const mmsi = String(meta.MMSI ?? "");
        const speed = asNumber(pos.Sog);
        const course = asNumber(pos.Cog);

        collected.push({
          title: `${name} – ${speed.toFixed(1)} kn`,
          summary: `MMSI: ${mmsi} | Kurs: ${course.toFixed(0)}° | ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          publishedAt: new Date().toISOString(),
          mapPoint: { lat, lng, label: name },
        });
      } catch { /* skip malformed messages */ }
    };

    ws.onerror = () => finish(new Error(`AIS WebSocket error pro ${source.label}`));
    ws.onclose = () => finish();
  });
}

// ---------------------------------------------------------------------------
// OREF (Pikud HaOref) alert parser
//
// Fetches https://www.oref.org.il/WarningMessages/alert/alerts.json
// The response is either "" (no alerts) or:
//   { "id": "...", "cat": "1", "title": "ירי רקטות", "data": ["city1", "city2"], "desc": "..." }
//
// Each city in `data` becomes one incident/mapPoint.
// Deduplication is handled downstream via incident ID (hash of seed + publishedAt).
// ---------------------------------------------------------------------------

const OREF_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "תל אביב": { lat: 32.0853, lng: 34.7818 },
  "ירושלים": { lat: 31.7683, lng: 35.2137 },
  "חיפה": { lat: 32.7940, lng: 34.9896 },
  "באר שבע": { lat: 31.2518, lng: 34.7913 },
  "אשדוד": { lat: 31.8044, lng: 34.6553 },
  "אשקלון": { lat: 31.6693, lng: 34.5714 },
  "נתניה": { lat: 32.3215, lng: 34.8532 },
  "ראשון לציון": { lat: 31.9730, lng: 34.7925 },
  "פתח תקווה": { lat: 32.0840, lng: 34.8878 },
  "חולון": { lat: 32.0109, lng: 34.7737 },
  "בת ים": { lat: 32.0184, lng: 34.7506 },
  "אילת": { lat: 29.5577, lng: 34.9519 },
  "נהריה": { lat: 33.0061, lng: 35.0978 },
  "קריית שמונה": { lat: 33.2072, lng: 35.5715 },
  "שדרות": { lat: 31.5250, lng: 34.5969 },
  "טבריה": { lat: 32.7942, lng: 35.5313 },
  "רמת גן": { lat: 32.0693, lng: 34.8239 },
  "גבעתיים": { lat: 32.0713, lng: 34.8117 },
  "בני ברק": { lat: 32.0813, lng: 34.8337 },
  "רחובות": { lat: 31.8928, lng: 34.8113 },
  "מודיעין": { lat: 31.8979, lng: 35.0101 },
  "לוד": { lat: 31.9516, lng: 34.8952 },
  "רמלה": { lat: 31.9274, lng: 34.8743 },
  "קריית גת": { lat: 31.6100, lng: 34.7725 },
  "אופקים": { lat: 31.3127, lng: 34.6162 },
  "נתיבות": { lat: 31.4196, lng: 34.5876 },
  "קריית מלאכי": { lat: 31.7332, lng: 34.7398 },
  "גן יבנה": { lat: 31.7893, lng: 34.7068 },
  "יבנה": { lat: 31.8766, lng: 34.7441 },
  "רעננה": { lat: 32.1840, lng: 34.8706 },
  "כפר סבא": { lat: 32.1787, lng: 34.9073 },
  "הרצליה": { lat: 32.1657, lng: 34.8437 },
  "רמת השרון": { lat: 32.1461, lng: 34.8378 },
  "גדרה": { lat: 31.8133, lng: 34.7744 },
  "קרית ביאליק": { lat: 32.8350, lng: 35.0857 },
  "קרית מוצקין": { lat: 32.8348, lng: 35.0752 },
  "קרית אתא": { lat: 32.8063, lng: 35.1062 },
  "עפולה": { lat: 32.6068, lng: 35.2901 },
  "נצרת": { lat: 32.6996, lng: 35.3035 },
  "צפת": { lat: 32.9641, lng: 35.4960 },
  "בית שמש": { lat: 31.7523, lng: 34.9906 },
  "ירוחם": { lat: 30.9879, lng: 34.9253 },
  "דימונה": { lat: 31.0676, lng: 35.0325 },
  "מצפה רמון": { lat: 30.6103, lng: 34.8020 },
  "קריית ים": { lat: 32.8535, lng: 35.0679 },
  "טירת הכרמל": { lat: 32.7622, lng: 34.9700 },
  "זכרון יעקב": { lat: 32.5700, lng: 34.9489 },
  "חדרה": { lat: 32.4349, lng: 34.9195 },
  "כפר יונה": { lat: 32.3165, lng: 34.9338 },
  "אריאל": { lat: 32.1069, lng: 35.1681 },
  "מעלה אדומים": { lat: 31.7756, lng: 35.2993 },
  "אלעד": { lat: 32.0527, lng: 34.9534 },
};

// Default fallback: geographic centre of Israel
const ISRAEL_CENTER = { lat: 31.5, lng: 34.75 };

function resolveOrefCity(cityName: string): { lat: number; lng: number } {
  // Exact match first
  if (OREF_CITY_COORDS[cityName]) return OREF_CITY_COORDS[cityName];
  // Partial prefix match (e.g. "תל אביב - דרום" → "תל אביב")
  for (const [key, coords] of Object.entries(OREF_CITY_COORDS)) {
    if (cityName.startsWith(key) || key.startsWith(cityName)) return coords;
  }
  return ISRAEL_CENTER;
}

type OrefPayload = {
  id?: string;
  cat?: string;
  title?: string;
  data?: string[];
  desc?: string;
};

function parseOrefAlerts(payload: string, limit: number): ParsedFeedItem[] {
  const trimmed = payload.trim();
  if (!trimmed || trimmed === '""' || trimmed === "null") return [];

  let alert: OrefPayload;
  try {
    alert = JSON.parse(trimmed) as OrefPayload;
  } catch {
    return [];
  }

  const cities = alert.data ?? [];
  if (cities.length === 0) return [];

  const threatTitle = alert.title ?? "ירי רקטות וטילים";
  const alertId = alert.id ?? Date.now().toString();
  const now = new Date().toISOString();

  return cities.slice(0, limit).map((city) => {
    const coords = resolveOrefCity(city);
    return {
      title: `OREF: ${threatTitle} – ${city}`,
      summary: `${alert.desc ?? "היכנסו למרחב המוגן"} | ${city}`,
      publishedAt: now,
      location: city,
      mapPoint: { lat: coords.lat, lng: coords.lng, label: city },
      // Embed alertId in link so fingerprint stays stable per alert+city
      link: `oref:${alertId}:${city}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function matchBlocks(xml: string, tagName: string) {
  const regex = new RegExp(`<${tagName}[\\s\\S]*?<\\/${tagName}>`, "gi");
  return xml.match(regex) ?? [];
}

function getTagContent(xml: string, tagName: string) {
  const regex = new RegExp(
    `<${tagName}(?: [^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "i",
  );
  const match = xml.match(regex);
  return match?.[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1").trim();
}

function getAtomLink(xml: string) {
  return xml.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1];
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function readPath(input: unknown, pathValue: string): unknown {
  return pathValue.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, input);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function isValidLatLng(lat: number, lng: number) {
  return lat !== 0 && lng !== 0 && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
