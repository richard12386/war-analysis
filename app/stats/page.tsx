import type { Metadata } from "next";
import { Suspense } from "react";
import { getSortedIncidents } from "@/lib/incidents";
import { countsByFilter, deriveType } from "@/lib/incident-type";
import StatsClient from "./stats-client";

export const metadata: Metadata = {
  title: "Statistics",
  description: "Statistiky a přehledy války v Íránu od prvního dne konfliktu.",
};

export const dynamic = "force-dynamic";

// ── types ──────────────────────────────────────────────────────────────────

export type DailyCount = {
  date: string;   // YYYY-MM-DD Prague
  day: number;    // war day number (Day 1 = 2026-02-28)
  label: string;  // "D1", "D2" …
  total: number;
  strikes: number;
  alerts: number;
  ships: number;
  news: number;
};

export type TypeSlice = {
  type: string;
  label: string;
  emoji: string;
  count: number;
  color: string;
};

export type StatsData = {
  totalEvents: number;
  eventsToday: number;
  activeShips: number;
  alertsLast24h: number;
  eventsPerDay: DailyCount[];
  eventsByType: TypeSlice[];
  topLocations: { location: string; count: number }[];
  currentDay: number;
  lastUpdated: string;
};

// ── helpers ────────────────────────────────────────────────────────────────

const WAR_START = "2026-02-28";

function pragueDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

function warDayOf(prageDateStr: string): number {
  // Use UTC noon to stay on correct calendar day regardless of DST
  const d = new Date(prageDateStr + "T12:00:00Z").getTime();
  const s = new Date(WAR_START + "T12:00:00Z").getTime();
  return Math.max(1, Math.round((d - s) / 86_400_000) + 1);
}

function dateRange(from: string, to: string): string[] {
  const result: string[] = [];
  let cur = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  while (cur <= end) {
    result.push(new Date(cur).toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" }));
    cur = new Date(cur.getTime() + 86_400_000);
  }
  return result;
}

// ── page ───────────────────────────────────────────────────────────────────

export default async function StatsPage() {
  const incidents = await getSortedIncidents();

  const now = new Date();
  const today = pragueDate(now.toISOString());
  const oneDayAgoMs = now.getTime() - 86_400_000;

  // Summary cards
  const totalEvents = incidents.length;
  const eventsToday = incidents.filter((i) => pragueDate(i.publishedAt) === today).length;
  const activeShips = incidents.filter((i) => deriveType(i) === "ship").length;
  const alertsLast24h = incidents.filter(
    (i) => deriveType(i) === "alert" && new Date(i.publishedAt).getTime() >= oneDayAgoMs,
  ).length;

  // Events per day — fill every day from Day 1 to today (zeros included)
  const allDates = dateRange(WAR_START, today);
  const dayMap = new Map<string, DailyCount>();
  for (const date of allDates) {
    const day = warDayOf(date);
    dayMap.set(date, { date, day, label: `D${day}`, total: 0, strikes: 0, alerts: 0, ships: 0, news: 0 });
  }
  for (const inc of incidents) {
    const dk = pragueDate(inc.publishedAt);
    const entry = dayMap.get(dk);
    if (!entry) continue;
    const t = deriveType(inc);
    entry[t === "strike" ? "strikes" : t === "alert" ? "alerts" : t === "ship" ? "ships" : "news"]++;
    entry.total++;
  }
  const eventsPerDay = [...dayMap.values()]; // already sorted day-ascending

  // Events by type (pie)
  const typeCounts = countsByFilter(incidents);
  const eventsByType: TypeSlice[] = [
    { type: "strike", label: "Strikes", emoji: "💥", count: typeCounts.strikes, color: "#dd6a42" },
    { type: "alert",  label: "Alerts",  emoji: "🚨", count: typeCounts.alerts,  color: "#ffb49a" },
    { type: "ship",   label: "Ships",   emoji: "🚢", count: typeCounts.ships,   color: "#7dd3fc" },
    { type: "news",   label: "News",    emoji: "📰", count: typeCounts.news,    color: "#b7efc5" },
  ].filter((s) => s.count > 0);

  // Top locations (top 10)
  const locMap = new Map<string, number>();
  for (const inc of incidents) {
    const loc = inc.location?.trim();
    if (loc) locMap.set(loc, (locMap.get(loc) ?? 0) + 1);
  }
  const topLocations = [...locMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([location, count]) => ({ location, count }));

  const data: StatsData = {
    totalEvents,
    eventsToday,
    activeShips,
    alertsLast24h,
    eventsPerDay,
    eventsByType,
    topLocations,
    currentDay: warDayOf(today),
    lastUpdated: now.toISOString(),
  };

  return (
    <main className="shell min-h-screen px-5 py-6 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-7xl">
        <Suspense>
          <StatsClient data={data} />
        </Suspense>
      </div>
    </main>
  );
}
