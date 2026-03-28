import type { Incident } from "@/lib/incidents";

export type IncidentFilterKey = "all" | "ships" | "alerts" | "strikes" | "news";
export type IncidentEventType = "ship" | "alert" | "strike" | "news";

export const FILTER_DEFS: { key: IncidentFilterKey; label: string; emoji: string }[] = [
  { key: "all", label: "ALL", emoji: "" },
  { key: "ships", label: "SHIPS", emoji: "🚢" },
  { key: "alerts", label: "ALERTS", emoji: "🚨" },
  { key: "strikes", label: "STRIKES", emoji: "💥" },
  { key: "news", label: "NEWS", emoji: "📰" },
];

export const TYPE_EMOJI: Record<IncidentEventType, string> = {
  ship: "🚢",
  alert: "🚨",
  strike: "💥",
  news: "📰",
};

export function deriveType(i: Incident): IncidentEventType {
  const tags = i.tags.map((t) => t.toLowerCase());
  if (
    tags.some((t) =>
      ["ship", "loď", "naval", "námořní", "fleet", "tanker", "vessel"].includes(t),
    )
  )
    return "ship";
  if ((i.trajectories && i.trajectories.length > 0) || i.weaponType) return "strike";
  if (i.category === "vojensky-vyvoj") return "strike";
  if (i.category === "breaking") return "alert";
  return "news";
}

export function applyFilter(incidents: Incident[], filter: IncidentFilterKey): Incident[] {
  if (filter === "all") return incidents;
  const typeMap: Record<Exclude<IncidentFilterKey, "all">, IncidentEventType> = {
    ships: "ship",
    alerts: "alert",
    strikes: "strike",
    news: "news",
  };
  const target = typeMap[filter];
  return incidents.filter((i) => deriveType(i) === target);
}

export function countsByFilter(
  incidents: Incident[],
): Record<IncidentFilterKey, number> {
  return {
    all: incidents.length,
    ships: incidents.filter((i) => deriveType(i) === "ship").length,
    alerts: incidents.filter((i) => deriveType(i) === "alert").length,
    strikes: incidents.filter((i) => deriveType(i) === "strike").length,
    news: incidents.filter((i) => deriveType(i) === "news").length,
  };
}
