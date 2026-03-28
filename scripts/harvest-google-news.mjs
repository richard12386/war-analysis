import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_FROM = "2026-02-28";
const DEFAULT_TO = "2026-03-28";
const DEFAULT_MAX = 200;

const CONFLICT_QUERIES = [
  "Iran after:{from} before:{before}",
  "Iran Israel after:{from} before:{before}",
  "Iran missile OR strike OR attack after:{from} before:{before}",
  "Iran drone OR UAV after:{from} before:{before}",
  "Iran cyber attack after:{from} before:{before}",
  "Strait of Hormuz Iran after:{from} before:{before}",
  "Tehran strike Iran after:{from} before:{before}",
  "Gulf airspace Iran after:{from} before:{before}",
  "Saudi Kuwait Bahrain UAE Iran attack after:{from} before:{before}",
  "Iran notam OR airspace closure after:{from} before:{before}",
  "Iran Houthi missile after:{from} before:{before}",
  "Iran maritime tanker Gulf after:{from} before:{before}",
];

const CONFLICT_KEYWORDS = [
  "airspace",
  "army",
  "attack",
  "ballistic",
  "barrage",
  "base",
  "ceasefire",
  "clash",
  "cyber",
  "defense",
  "drone",
  "fighter",
  "gulf",
  "hormuz",
  "houthi",
  "iran",
  "israel",
  "missile",
  "military",
  "naval",
  "nuclear",
  "notam",
  "retaliation",
  "rocket",
  "saudi",
  "shipping",
  "strike",
  "tehran",
  "troops",
  "uav",
  "uae",
  "war",
];

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getTag(block, tagName) {
  const match = block.match(
    new RegExp(`<${tagName}(?: [^>]*)?>([\\s\\S]*?)</${tagName}>`, "i"),
  );
  return match ? decodeXml(match[1].trim()) : "";
}

function getSource(block) {
  const match = block.match(
    /<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i,
  );
  if (!match) {
    return null;
  }

  return {
    name: decodeXml(match[2].trim()) || "Unknown source",
    siteUrl: decodeXml(match[1].trim()) || "",
  };
}

function parseItems(xml) {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  return blocks.map((block) => {
    const title = stripHtml(getTag(block, "title"));
    const link = getTag(block, "link");
    const pubDate = getTag(block, "pubDate");
    const description = stripHtml(getTag(block, "description"));
    const source = getSource(block);

    return {
      title,
      link,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
      description,
      sourceName: source?.name ?? "Unknown source",
      sourceSiteUrl: source?.siteUrl ?? "",
    };
  });
}

function isConflictRelevant(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  return CONFLICT_KEYWORDS.some((keyword) => text.includes(keyword));
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/\s+-\s+[^-]+$/, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKey(item) {
  const day = item.publishedAt ? item.publishedAt.slice(0, 10) : "unknown-day";
  return `${normalizeTitle(item.title)}|${item.sourceName.toLowerCase()}|${day}`;
}

async function fetchQuery(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; IranWarDeskBot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Google News RSS returned ${response.status} for query "${query}"`);
  }

  const xml = await response.text();
  return parseItems(xml).map((item) => ({
    ...item,
    query,
    queryUrl: url,
  }));
}

function inDateWindow(item, fromIso, toIso) {
  if (!item.publishedAt) {
    return false;
  }

  return item.publishedAt >= fromIso && item.publishedAt <= toIso;
}

async function main() {
  const from = getArg("from", DEFAULT_FROM);
  const to = getArg("to", DEFAULT_TO);
  const max = Number.parseInt(getArg("max", String(DEFAULT_MAX)), 10);
  const before = new Date(`${to}T00:00:00Z`);
  before.setUTCDate(before.getUTCDate() + 1);
  const beforeDate = before.toISOString().slice(0, 10);
  const fromIso = new Date(`${from}T00:00:00.000Z`).toISOString();
  const toIso = new Date(`${to}T23:59:59.999Z`).toISOString();

  const queries = CONFLICT_QUERIES.map((template) =>
    template.replaceAll("{from}", from).replaceAll("{before}", beforeDate),
  );

  const collected = [];
  const failures = [];

  for (const query of queries) {
    try {
      const items = await fetchQuery(query);
      collected.push(...items);
    } catch (error) {
      failures.push({
        query,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const item of collected) {
    if (!inDateWindow(item, fromIso, toIso)) {
      continue;
    }

    if (!isConflictRelevant(item)) {
      continue;
    }

    const key = buildKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  deduped.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));

  const output = {
    meta: {
      harvestedAt: new Date().toISOString(),
      from: fromIso,
      to: toIso,
      queries,
      fetchedItems: collected.length,
      uniqueItems: deduped.length,
      savedItems: Math.min(deduped.length, max),
      failures,
      note: "Raw Google News harvest for editorial review. These are article leads, not verified incidents.",
    },
    items: deduped.slice(0, max).map((item, index) => ({
      id: `lead-${String(index + 1).padStart(3, "0")}`,
      title: item.title,
      publishedAt: item.publishedAt,
      sourceName: item.sourceName,
      sourceSiteUrl: item.sourceSiteUrl,
      url: item.link,
      description: item.description,
      query: item.query,
    })),
  };

  const outputDir = path.join(process.cwd(), "data");
  const fileName = `news-harvest-${from}-to-${to}.json`;
  const outputPath = path.join(outputDir, fileName);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        file: outputPath,
        fetchedItems: output.meta.fetchedItems,
        uniqueItems: output.meta.uniqueItems,
        savedItems: output.meta.savedItems,
        failures,
      },
      null,
      2,
    ),
  );
}

await main();
