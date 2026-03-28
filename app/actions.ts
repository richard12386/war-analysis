"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addIncident,
  upsertImportedIncidents,
  type IncidentCategory,
  type IncidentSeverity,
  type IncidentSource,
  type IncidentVerification,
} from "@/lib/incidents";
import { importAllEnabledSources, importFromSourceId } from "@/lib/import-sources";
import { notifyNewIncidents } from "@/lib/telegram";

export async function createIncidentAction(formData: FormData) {
  const title = readRequiredString(formData, "title");
  const summary = readRequiredString(formData, "summary");
  const body = readOptionalString(formData, "body");
  const location = readRequiredString(formData, "location");
  const category = readRequiredString(formData, "category") as IncidentCategory;
  const severity = readRequiredString(formData, "severity") as IncidentSeverity;
  const verification = readRequiredString(
    formData,
    "verification",
  ) as IncidentVerification;
  const tags = readOptionalString(formData, "tags")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const sourceLabel = readOptionalString(formData, "sourceLabel");
  const sourceUrl = readOptionalString(formData, "sourceUrl");
  const sourceType =
    (readOptionalString(formData, "sourceType") as IncidentSource["type"]) ||
    "media";

  const sources =
    sourceLabel && sourceUrl
      ? [{ label: sourceLabel, url: sourceUrl, type: sourceType }]
      : [];

  const casualtiesRaw = readOptionalString(formData, "casualties");
  const injuriesRaw = readOptionalString(formData, "injuries");

  const newIncident = await addIncident({
    title,
    summary,
    body,
    location,
    category,
    severity,
    verification,
    tags,
    featured: formData.get("featured") === "on",
    isTemplate: formData.get("isTemplate") === "on",
    publishedAt: normalizePublishedAt(readOptionalString(formData, "publishedAt")),
    sources,
    weaponType: readOptionalString(formData, "weaponType") || undefined,
    targetType: readOptionalString(formData, "targetType") || undefined,
    casualties: casualtiesRaw ? parseInt(casualtiesRaw, 10) || undefined : undefined,
    injuries: injuriesRaw ? parseInt(injuriesRaw, 10) || undefined : undefined,
    infrastructureDamage: readOptionalString(formData, "infrastructureDamage") || undefined,
  });

  notifyNewIncidents([newIncident]).catch((err) =>
    console.error("[createIncidentAction] Telegram notify failed:", err),
  );

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/api/incidents");
  revalidatePath("/api/incidents/live");
  revalidatePath("/api/map");
  revalidatePath("/api/verification");
  redirect("/admin?created=1");
}

export async function importIncidentFeedAction(formData: FormData) {
  const sourceId = readRequiredString(formData, "sourceId");
  const imported = await importFromSourceId(sourceId);
  const { newIncidents } = await upsertImportedIncidents(imported);

  notifyNewIncidents(newIncidents).catch((err) =>
    console.error("[importIncidentFeedAction] Telegram notify failed:", err),
  );

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/api/incidents");
  revalidatePath("/api/incidents/live");
  revalidatePath("/api/map");
  revalidatePath("/api/verification");
  redirect(`/admin?imported=${imported.length}`);
}

export async function importAllSourcesAction() {
  const result = await importAllEnabledSources();
  const { newIncidents } = await upsertImportedIncidents(result.items);

  notifyNewIncidents(newIncidents).catch((err) =>
    console.error("[importAllSourcesAction] Telegram notify failed:", err),
  );

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/api/incidents");
  revalidatePath("/api/incidents/live");
  revalidatePath("/api/map");
  revalidatePath("/api/verification");

  const failed = result.errors.length;
  const params = new URLSearchParams({ imported: String(result.items.length) });
  if (failed > 0) {
    params.set("failedSources", String(failed));
  }
  redirect(`/admin?${params.toString()}`);
}

function readRequiredString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Pole "${key}" je povinne.`);
  }

  return value.trim();
}

function readOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalizePublishedAt(value: string) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
