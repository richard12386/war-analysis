import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { evaluateIncidentReliability } from "@/lib/verification";

export type IncidentSeverity = "critical" | "high" | "medium" | "low";
export type IncidentVerification =
  | "confirmed"
  | "contested"
  | "pending"
  | "template";

export type IncidentCategory =
  | "breaking"
  | "vojensky-vyvoj"
  | "civilni-dopady"
  | "diplomacie";

export type IncidentSource = {
  label: string;
  url: string;
  type: "official" | "media" | "osint" | "ngo";
  publishedAt?: string;
};

export type IncidentPoint = {
  lat: number;
  lng: number;
  label: string;
};

export type AttackTrajectory = {
  id: string;
  weaponType: string;
  status: "reported" | "confirmed";
  launchedAt?: string;
  origin: IncidentPoint;
  target: IncidentPoint;
};

export type IncidentOrigin = "manual" | "imported" | "template";

export type Incident = {
  id: string;
  title: string;
  summary: string;
  body?: string;
  location: string;
  publishedAt: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  verification: IncidentVerification;
  featured: boolean;
  isTemplate: boolean;
  origin?: IncidentOrigin;
  importSourceId?: string;
  tags: string[];
  sourceCount: number;
  sources: IncidentSource[];
  mapPoint?: IncidentPoint;
  trajectories?: AttackTrajectory[];
  weaponType?: string;
  targetType?: string;
  casualties?: number;
  injuries?: number;
  infrastructureDamage?: string;
  trustScore?: number;
  trustedSourceCount?: number;
  suspiciousSignals?: string[];
  verificationNote?: string;
};

export type WatchItem = {
  label: string;
  description: string;
};

export type IncidentDataset = {
  meta: {
    siteTitle: string;
    regionFocus: string;
    lastUpdated: string;
    dataState: "ready-for-live-data" | "live";
    editorialNote: string;
  };
  watchlist: WatchItem[];
  incidents: Incident[];
};

export const DATA_FILE_PATH = path.join(process.cwd(), "data", "incidents.json");

export async function readIncidentDataset() {
  const raw = await fs.readFile(DATA_FILE_PATH, "utf8");
  return normalizeDataset(JSON.parse(raw) as IncidentDataset);
}

export async function writeIncidentDataset(dataset: IncidentDataset) {
  const normalized = normalizeDataset(dataset, true);
  await fs.writeFile(
    DATA_FILE_PATH,
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8",
  );
  return normalized;
}

export async function getIncidentDataset() {
  return readIncidentDataset();
}

export async function getSortedIncidents() {
  const dataset = await readIncidentDataset();
  return [...dataset.incidents].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt),
  );
}

export async function getFeaturedIncidents() {
  const incidents = await getSortedIncidents();
  return incidents.filter((incident) => incident.featured);
}

export async function getIncidentById(id: string) {
  const incidents = await getSortedIncidents();
  return incidents.find((incident) => incident.id === id);
}

export async function getDashboardStats() {
  const incidents = await getSortedIncidents();
  const liveIncidents = incidents.filter((incident) => !incident.isTemplate);

  return {
    totalItems: incidents.length,
    liveItems: liveIncidents.length,
    featuredItems: incidents.filter((incident) => incident.featured).length,
    criticalItems: liveIncidents.filter((incident) => incident.severity === "critical")
      .length,
    verifiedItems: liveIncidents.filter(
      (incident) => incident.verification === "confirmed",
    ).length,
    pendingItems: liveIncidents.filter(
      (incident) =>
        incident.verification === "pending" ||
        incident.verification === "contested",
    ).length,
  };
}

export async function addIncident(input: {
  title: string;
  summary: string;
  body?: string;
  location: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  verification: IncidentVerification;
  tags: string[];
  featured: boolean;
  isTemplate: boolean;
  sources: IncidentSource[];
  mapPoint?: IncidentPoint;
  trajectories?: AttackTrajectory[];
  weaponType?: string;
  targetType?: string;
  casualties?: number;
  injuries?: number;
  infrastructureDamage?: string;
  publishedAt?: string;
  origin?: IncidentOrigin;
  importSourceId?: string;
}) {
  const dataset = await readIncidentDataset();
  const publishedAt = input.publishedAt ?? new Date().toISOString();

  const newIncident = normalizeIncident({
    id: createIncidentId(input.title, publishedAt),
    title: input.title,
    summary: input.summary,
    body: input.body,
    location: input.location,
    publishedAt,
    category: input.category,
    severity: input.severity,
    verification: input.verification,
    featured: input.featured,
    isTemplate: input.isTemplate,
    origin: input.origin ?? (input.isTemplate ? "template" : "manual"),
    importSourceId: input.importSourceId,
    tags: input.tags,
    sourceCount: input.sources.length,
    sources: input.sources,
    mapPoint: input.mapPoint,
    trajectories: input.trajectories,
    weaponType: input.weaponType,
    targetType: input.targetType,
    casualties: input.casualties,
    injuries: input.injuries,
    infrastructureDamage: input.infrastructureDamage,
  });

  const incidents = [
    newIncident,
    ...dataset.incidents.filter((incident) => incident.id !== newIncident.id),
  ];

  return writeIncidentDataset({
    ...dataset,
    incidents,
  });
}

export async function upsertImportedIncidents(imported: Incident[]) {
  const dataset = await readIncidentDataset();
  const byId = new Map(dataset.incidents.map((incident) => [incident.id, incident]));

  for (const incident of imported) {
    byId.set(incident.id, normalizeIncident(incident));
  }

  return writeIncidentDataset({
    ...dataset,
    incidents: [...byId.values()].sort((left, right) =>
      right.publishedAt.localeCompare(left.publishedAt),
    ),
  });
}

export function formatIncidentDate(date: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Prague",
  }).format(new Date(date));
}

export function getSeverityLabel(severity: IncidentSeverity) {
  switch (severity) {
    case "critical":
      return "Kritická";
    case "high":
      return "Vysoká";
    case "medium":
      return "Střední";
    case "low":
      return "Nízká";
  }
}

export function getVerificationLabel(verification: IncidentVerification) {
  switch (verification) {
    case "confirmed":
      return "Potvrzeno";
    case "contested":
      return "Sporné";
    case "pending":
      return "Čeká na ověření";
    case "template":
      return "Šablona";
  }
}

export function getCategoryLabel(category: IncidentCategory) {
  switch (category) {
    case "breaking":
      return "Breaking";
    case "vojensky-vyvoj":
      return "Vojenský vývoj";
    case "civilni-dopady":
      return "Civilní dopady";
    case "diplomacie":
      return "Diplomacie";
  }
}

export function createIncidentId(seed: string, publishedAt: string) {
  const digest = createHash("sha1")
    .update(`${seed}:${publishedAt}`)
    .digest("hex")
    .slice(0, 10);

  return `incident-${digest}`;
}

function normalizeDataset(
  dataset: IncidentDataset,
  updateTimestamp?: boolean,
): IncidentDataset {
  const incidents = dataset.incidents.map(normalizeIncident);
  const hasLiveContent = incidents.some((incident) => !incident.isTemplate);

  return {
    ...dataset,
    meta: {
      ...dataset.meta,
      dataState: hasLiveContent ? "live" : "ready-for-live-data",
      lastUpdated: updateTimestamp
        ? new Date().toISOString()
        : dataset.meta.lastUpdated,
    },
    incidents,
  };
}

function normalizeIncident(incident: Incident): Incident {
  const sources = incident.sources ?? [];
  const report = evaluateIncidentReliability({
    title: incident.title,
    summary: incident.summary,
    sources,
  });
  const verification =
    incident.verification === "template"
      ? "template"
      : incident.verification === "confirmed" && report.recommendation !== "contested"
        ? "confirmed"
        : report.recommendation;

  return {
    ...incident,
    body: incident.body?.trim() || undefined,
    verification,
    origin:
      incident.origin ?? (incident.isTemplate ? "template" : "manual"),
    tags: [...new Set((incident.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
    sourceCount: sources.length,
    sources,
    trustScore: report.trustScore,
    trustedSourceCount: report.trustedSources,
    suspiciousSignals: report.suspiciousSignals,
    verificationNote: report.note,
  };
}
