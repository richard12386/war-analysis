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

export type ImportSourceFormat = "rss" | "json";

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
  itemPath?: string;
  fieldMap?: {
    title: string;
    summary?: string;
    body?: string;
    location?: string;
    link?: string;
    publishedAt?: string;
  };
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

export async function importFromSourceId(sourceId: string) {
  const sources = await readImportSources();
  const source = sources.find((item) => item.id === sourceId);

  if (!source) {
    throw new Error(`Import source "${sourceId}" neexistuje.`);
  }

  if (!source.enabled) {
    throw new Error(`Import source "${source.label}" je vypnuty.`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(source.url, {
      headers: {
        "User-Agent": "IranWarDeskImporter/1.0",
        Accept: "application/rss+xml, application/atom+xml, application/json, text/xml, */*",
      },
      next: { revalidate: 0 },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Import selhal: ${source.label} – timeout po ${FETCH_TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(
      `Import selhal: ${source.label} vratil ${response.status} ${response.statusText}.`,
    );
  }

  const payload = await response.text();
  const items =
    source.format === "rss"
      ? parseRssLikeFeed(payload)
      : parseJsonFeed(payload, source);

  return items.map((item) => toImportedIncident(source, item));
}

export async function importAllEnabledSources(): Promise<{
  sourceCount: number;
  items: Incident[];
  errors: ImportSourceError[];
}> {
  const sources = await readImportSources();
  const enabledSources = sources.filter((source) => source.enabled);
  const imported: Incident[] = [];
  const errors: ImportSourceError[] = [];

  for (const source of enabledSources) {
    try {
      const items = await importFromSourceId(source.id);
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
    location: item.location || "Lokalita ceka na doplneni",
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

function parseRssLikeFeed(xml: string) {
  const itemBlocks = matchBlocks(xml, "item");
  const entryBlocks = matchBlocks(xml, "entry");
  const blocks = itemBlocks.length > 0 ? itemBlocks : entryBlocks;

  return blocks.slice(0, 15).map((block) => {
    const title = decodeXml(
      getTagContent(block, "title") ?? "Bez nazvu z importu",
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
        stripHtml(description).slice(0, 320) || "Importovany zaznam bez shrnuti.",
      body: stripHtml(description),
      link: link || undefined,
      publishedAt: normalizeDate(publishedAt),
    };
  });
}

function parseJsonFeed(payload: string, source: ImportSource) {
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  const items = readPath(parsed, source.itemPath ?? "items");

  if (!Array.isArray(items)) {
    throw new Error(`JSON source "${source.label}" nema pole itemu.`);
  }

  return items.slice(0, 15).map((rawItem) => {
    const item = rawItem as Record<string, unknown>;

    return {
      title:
        asString(readPath(item, source.fieldMap?.title ?? "title")) ||
        "Bez nazvu z JSON importu",
      summary:
        asString(readPath(item, source.fieldMap?.summary ?? "summary")) ||
        asString(readPath(item, source.fieldMap?.body ?? "body")) ||
        "Importovany zaznam bez shrnuti.",
      body: asString(readPath(item, source.fieldMap?.body ?? "body")) || undefined,
      location:
        asString(readPath(item, source.fieldMap?.location ?? "location")) ||
        undefined,
      link:
        asString(readPath(item, source.fieldMap?.link ?? "url")) || undefined,
      publishedAt: normalizeDate(
        asString(readPath(item, source.fieldMap?.publishedAt ?? "publishedAt")) ||
          new Date().toISOString(),
      ),
    };
  });
}

function matchBlocks(xml: string, tagName: string) {
  const regex = new RegExp(`<${tagName}[\\s\\S]*?<\\/${tagName}>`, "gi");
  return xml.match(regex) ?? [];
}

function getTagContent(xml: string, tagName: string) {
  const regex = new RegExp(`<${tagName}(?: [^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i");
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
