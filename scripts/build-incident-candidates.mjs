import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const DEFAULT_INPUT = "data/news-harvest-2026-02-28-to-2026-03-28.json";
const DEFAULT_OUTPUT = "data/incident-candidates-2026-02-28-to-2026-03-28.json";
const DEFAULT_MAX = 180;

const CATEGORY_KEYWORDS = {
  diplomacie: ["ceasefire", "trump", "diplom", "talks", "summit", "un", "sanction"],
  "civilni-dopady": ["airspace", "notam", "airport", "evacuation", "civilian", "hospital", "port", "shipping"],
  "vojensky-vyvoj": [
    "attack",
    "base",
    "barrage",
    "clash",
    "cyber",
    "drone",
    "fighter",
    "hormuz",
    "houthi",
    "missile",
    "naval",
    "nuclear",
    "rocket",
    "strike",
    "troops",
    "war",
  ],
};

const HIGH_PRIORITY_KEYWORDS = [
  "attack",
  "base",
  "barrage",
  "clash",
  "cyber",
  "drone",
  "fighter",
  "hormuz",
  "houthi",
  "missile",
  "naval",
  "nuclear",
  "rocket",
  "strike",
  "troops",
  "airspace",
  "notam",
  "shipping",
];

const LOCATION_HINTS = [
  "Tehran",
  "Iran",
  "Israel",
  "Saudi Arabia",
  "Kuwait",
  "Bahrain",
  "UAE",
  "Doha",
  "Qatar",
  "Yemen",
  "Beirut",
  "Lebanon",
  "Syria",
  "Iraq",
  "Strait of Hormuz",
  "Gulf of Oman",
  "Fujairah",
  "Prince Sultan Air Base",
];

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function stripSourceSuffix(title) {
  return normalizeWhitespace(title.replace(/\s+-\s+[^-]+$/, ""));
}

function normalizeTitle(title) {
  return stripSourceSuffix(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeSlug(title, publishedAt) {
  const base = stripSourceSuffix(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 72);
  const date = publishedAt.slice(0, 10);
  const digest = createHash("sha1").update(`${publishedAt}:${title}`).digest("hex").slice(0, 8);
  return `${date}-${base}-${digest}`;
}

function scoreLead(item) {
  const text = `${item.title} ${item.description} ${item.query}`.toLowerCase();
  let score = 0;

  for (const keyword of HIGH_PRIORITY_KEYWORDS) {
    if (text.includes(keyword)) {
      score += 4;
    }
  }

  if (text.includes("iran")) score += 3;
  if (text.includes("israel")) score += 2;
  if (text.includes("war")) score += 2;
  if (text.includes("live")) score += 1;
  if (text.includes("latest")) score += 1;
  if (item.sourceName) score += 1;

  return score;
}

function inferCategory(item) {
  const text = `${item.title} ${item.description} ${item.query}`.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return category;
    }
  }

  return "breaking";
}

function inferSeverity(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();

  if (
    ["missile", "drone", "strike", "attack", "base", "troops", "hormuz", "nuclear"].some(
      (keyword) => text.includes(keyword),
    )
  ) {
    return "high";
  }

  if (["airspace", "notam", "shipping", "cyber", "port", "airport"].some((keyword) => text.includes(keyword))) {
    return "medium";
  }

  return "low";
}

function inferLocation(item) {
  const text = `${item.title} ${item.description}`;

  for (const hint of LOCATION_HINTS) {
    if (text.toLowerCase().includes(hint.toLowerCase())) {
      return hint;
    }
  }

  return "Lokalita čeká na doplnění";
}

function inferTags(item) {
  const text = `${item.title} ${item.description} ${item.query}`.toLowerCase();
  const tags = new Set(["harvest", "google-news", "iran"]);

  for (const keyword of HIGH_PRIORITY_KEYWORDS) {
    if (text.includes(keyword)) {
      tags.add(keyword.replace(/\s+/g, "-"));
    }
  }

  if (text.includes("airspace") || text.includes("notam")) tags.add("aviation");
  if (text.includes("hormuz") || text.includes("shipping") || text.includes("naval")) tags.add("maritime");
  if (text.includes("cyber")) tags.add("cyber");
  if (text.includes("houthi")) tags.add("houthi");

  return [...tags];
}

async function main() {
  const inputPath = path.join(process.cwd(), getArg("input", DEFAULT_INPUT));
  const outputPath = path.join(process.cwd(), getArg("output", DEFAULT_OUTPUT));
  const max = Number.parseInt(getArg("max", String(DEFAULT_MAX)), 10);

  const raw = await readFile(inputPath, "utf8");
  const harvest = JSON.parse(raw);
  const items = Array.isArray(harvest.items) ? harvest.items : [];

  const ranked = items
    .map((item) => ({ ...item, relevanceScore: scoreLead(item) }))
    .sort((left, right) => {
      if (right.relevanceScore !== left.relevanceScore) {
        return right.relevanceScore - left.relevanceScore;
      }
      return right.publishedAt.localeCompare(left.publishedAt);
    });

  const deduped = [];
  const seenTitles = new Set();
  for (const item of ranked) {
    const key = `${normalizeTitle(item.title)}|${item.publishedAt.slice(0, 10)}`;
    if (seenTitles.has(key)) {
      continue;
    }
    seenTitles.add(key);
    deduped.push(item);
  }

  const candidates = deduped.slice(0, max).map((item) => ({
    id: makeSlug(item.title, item.publishedAt),
    title: stripSourceSuffix(item.title),
    summary: normalizeWhitespace(item.description || item.title),
    body: normalizeWhitespace(
      `${item.description || item.title} Raw harvest query: ${item.query}. Candidate item imported for editorial review and location enrichment.`,
    ),
    location: inferLocation(item),
    publishedAt: item.publishedAt,
    category: inferCategory(item),
    severity: inferSeverity(item),
    verification: "pending",
    featured: false,
    isTemplate: false,
    origin: "imported",
    importSourceId: "google-news-harvest",
    tags: inferTags(item),
    sourceCount: 1,
    sources: [
      {
        label: item.sourceName || "Google News source",
        url: item.sourceSiteUrl || item.url,
        type: "media",
        publishedAt: item.publishedAt,
      },
    ],
    verificationNote:
      "Automaticky vygenerovaný kandidát z raw news harvestu. Před publikací doplnit přesnou lokalitu, otevřít původní článek a ručně potvrdit fakta.",
    harvestUrl: item.url,
    relevanceScore: item.relevanceScore,
  }));

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFile: path.relative(process.cwd(), inputPath),
      totalHarvestItems: items.length,
      uniqueRankedItems: deduped.length,
      savedCandidates: candidates.length,
      note: "Candidate incidents derived from the raw Google News harvest. These entries are pending editorial review.",
    },
    items: candidates,
  };

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        ok: true,
        file: outputPath,
        sourceItems: items.length,
        savedCandidates: candidates.length,
      },
      null,
      2,
    ),
  );
}

await main();
