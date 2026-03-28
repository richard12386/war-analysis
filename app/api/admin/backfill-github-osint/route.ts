import { createIncidentId, upsertImportedIncidents } from "@/lib/incidents";
import type { Incident, IncidentPoint, AttackTrajectory } from "@/lib/incidents";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

const OSINT_SOURCES = [
  "https://raw.githubusercontent.com/danielrosehill/Iran-Israel-War-2026-OSINT-Data/main/data/tp3-2025/waves.json",
  "https://raw.githubusercontent.com/danielrosehill/Iran-Israel-War-2026-OSINT-Data/main/data/tp4-2026/waves.json",
];

const IMPORT_SOURCE_ID = "github-osint-iran-israel";

// ---------------------------------------------------------------------------
// Flexible field resolver — handles various naming conventions used in
// community OSINT JSON datasets (snake_case, camelCase, short forms).
// ---------------------------------------------------------------------------

type RawWave = Record<string, unknown>;

function str(obj: RawWave, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function num(obj: RawWave, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (!isNaN(n)) return n;
    }
  }
  return undefined;
}

function resolveTimestamp(wave: RawWave): string {
  const raw = str(wave, "timestamp", "date", "time", "datetime", "reported_at", "occurred_at");
  if (raw) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function resolveLocation(wave: RawWave): { name: string; mapPoint?: IncidentPoint } {
  const name = str(wave, "location", "city", "target_location", "area", "place");
  const lat = num(wave, "lat", "latitude");
  const lon = num(wave, "lon", "lng", "longitude");

  // Try nested location object
  const locObj = wave.location as Record<string, unknown> | undefined;
  if (locObj && typeof locObj === "object") {
    const nLat = num(locObj, "lat", "latitude") ?? lat;
    const nLon = num(locObj, "lon", "lng", "longitude") ?? lon;
    const nName = str(locObj, "name", "city") || name;
    if (nLat !== undefined && nLon !== undefined) {
      return { name: nName || "Israel", mapPoint: { lat: nLat, lng: nLon, label: nName || "target" } };
    }
    return { name: nName };
  }

  if (lat !== undefined && lon !== undefined) {
    return { name: name || "Israel", mapPoint: { lat, lng: lon, label: name || "target" } };
  }
  return { name: name || "Israel" };
}

function resolveTrajectory(wave: RawWave, mapPoint?: IncidentPoint): AttackTrajectory | undefined {
  const originLat = num(wave, "origin_lat", "launch_lat", "source_lat");
  const originLon = num(wave, "origin_lon", "origin_lng", "launch_lon", "source_lon");
  const weaponType = str(wave, "weapon_type", "weaponType", "weapon", "missile_type", "munition");

  if (originLat === undefined || originLon === undefined || !mapPoint) return undefined;

  const originName = str(wave, "origin", "launch_site", "source_country", "attacker_location") || "Launch site";

  return {
    id: createHash("sha1")
      .update(`${originLat}:${originLon}:${mapPoint.lat}:${mapPoint.lng}`)
      .digest("hex")
      .slice(0, 10),
    weaponType: weaponType || "unknown",
    status: "reported",
    origin: { lat: originLat, lng: originLon, label: originName },
    target: mapPoint,
  };
}

function waveToIncident(wave: RawWave, sourceUrl: string): Incident {
  const timestamp = resolveTimestamp(wave);
  const { name: locationName, mapPoint } = resolveLocation(wave);
  const trajectory = resolveTrajectory(wave, mapPoint);

  const weaponType = str(wave, "weapon_type", "weaponType", "weapon", "missile_type", "munition");
  const attackingSide = str(wave, "attacking_side", "attacker", "side", "perpetrator");
  const targetType = str(wave, "target_type", "target", "target_category");
  const description = str(wave, "description", "notes", "details", "summary", "notes_en");
  const casualties = num(wave, "casualties", "killed", "deaths");
  const injuries = num(wave, "injuries", "wounded", "injured");
  const infrastructureDamage = str(wave, "infrastructure_damage", "damage", "damage_notes");

  const titleParts: string[] = [];
  if (attackingSide) titleParts.push(attackingSide);
  if (weaponType) titleParts.push(weaponType);
  titleParts.push("útok");
  if (locationName) titleParts.push(`– ${locationName}`);
  const title = titleParts.join(" ");

  const summaryParts: string[] = [];
  if (weaponType) summaryParts.push(`Zbraň: ${weaponType}`);
  if (attackingSide) summaryParts.push(`Útočník: ${attackingSide}`);
  if (targetType) summaryParts.push(`Cíl: ${targetType}`);
  if (casualties) summaryParts.push(`Oběti: ${casualties}`);
  const summary =
    description.slice(0, 320) ||
    summaryParts.join(" | ") ||
    `OSINT záznam: ${title}`;

  const fingerprint = createHash("sha1")
    .update(`${IMPORT_SOURCE_ID}:${timestamp}:${locationName}:${weaponType}`)
    .digest("hex")
    .slice(0, 10);

  return {
    id: createIncidentId(`${IMPORT_SOURCE_ID}-${fingerprint}`, timestamp),
    title,
    summary,
    body: description || undefined,
    location: locationName,
    publishedAt: timestamp,
    category: "vojensky-vyvoj",
    severity: casualties && casualties > 0 ? "high" : "medium",
    verification: "pending",
    featured: false,
    isTemplate: false,
    origin: "imported",
    importSourceId: IMPORT_SOURCE_ID,
    tags: ["osint", "github", "iran", "izrael", ...(weaponType ? [weaponType] : [])],
    sourceCount: 1,
    sources: [
      {
        label: "Iran-Israel War 2026 OSINT Data (GitHub)",
        url: sourceUrl,
        type: "osint",
        publishedAt: timestamp,
      },
    ],
    mapPoint,
    trajectories: trajectory ? [trajectory] : undefined,
    weaponType: weaponType || undefined,
    targetType: targetType || undefined,
    casualties: casualties,
    injuries: injuries,
    infrastructureDamage: infrastructureDamage || undefined,
  };
}

export async function POST(request: Request) {
  // Optional: protect with CRON_SECRET
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (bearer !== secret && key !== secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const results: { url: string; fetched: number; skipped: number; error?: string }[] = [];
  const allIncidents: Incident[] = [];

  for (const sourceUrl of OSINT_SOURCES) {
    try {
      const res = await fetch(sourceUrl, {
        headers: { "User-Agent": "IranWarDeskImporter/1.0" },
        next: { revalidate: 0 },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const raw = await res.json() as unknown;
      const waves: RawWave[] = Array.isArray(raw)
        ? (raw as RawWave[])
        : Array.isArray((raw as Record<string, unknown>).waves)
          ? ((raw as Record<string, unknown>).waves as RawWave[])
          : Array.isArray((raw as Record<string, unknown>).events)
            ? ((raw as Record<string, unknown>).events as RawWave[])
            : [];

      const incidents = waves.map((w) => waveToIncident(w, sourceUrl));
      allIncidents.push(...incidents);
      results.push({ url: sourceUrl, fetched: incidents.length, skipped: 0 });
    } catch (err) {
      results.push({
        url: sourceUrl,
        fetched: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // upsertImportedIncidents deduplicates by incident ID (stable hash of seed + timestamp)
  await upsertImportedIncidents(allIncidents);

  return Response.json({
    ok: true,
    totalImported: allIncidents.length,
    sources: results,
    ranAt: new Date().toISOString(),
  });
}
