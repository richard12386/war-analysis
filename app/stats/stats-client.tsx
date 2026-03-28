"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { LiveRefresh } from "@/app/live-refresh";
import type { StatsData } from "./page";

// Load charts client-only — recharts uses ResizeObserver which breaks SSR
const EventsPerDayChart = dynamic(
  () => import("./stats-charts").then((m) => m.EventsPerDayChart),
  { ssr: false, loading: () => <ChartSkeleton height={260} /> },
);
const EventsByTypeChart = dynamic(
  () => import("./stats-charts").then((m) => m.EventsByTypeChart),
  { ssr: false, loading: () => <ChartSkeleton height={260} /> },
);
const TopLocationsChart = dynamic(
  () => import("./stats-charts").then((m) => m.TopLocationsChart),
  { ssr: false, loading: () => <ChartSkeleton height={300} /> },
);

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-[1rem] bg-white/3"
      style={{ height }}
    >
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-white/20">
        Načítám graf…
      </p>
    </div>
  );
}

// ── summary card ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <article
      className={[
        "rounded-[1.5rem] border p-5",
        accent
          ? "border-[#ffb49a]/20 bg-[#ffb49a]/6"
          : "border-white/10 bg-white/4",
      ].join(" ")}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/40">{label}</p>
      <p className={`mt-3 text-5xl leading-none ${accent ? "text-[#ffb49a]" : ""}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-white/30">{sub}</p>
      )}
    </article>
  );
}

// ── chart panel ───────────────────────────────────────────────────────────

function ChartPanel({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
      <div className="mb-5">
        <h2 className="text-2xl">{title}</h2>
        {sub && <p className="mt-1 text-sm text-white/40">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

// Legend row for the stacked bar chart (recharts Legend inside ssr:false components
// can flicker — simpler to do it manually here)
function BarLegend() {
  const items = [
    { color: "#dd6a42", label: "💥 Strikes" },
    { color: "#ffb49a", label: "🚨 Alerts" },
    { color: "#7dd3fc", label: "🚢 Ships" },
    { color: "#b7efc5", label: "📰 News" },
  ];
  return (
    <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1">
      {items.map(({ color, label }) => (
        <span key={label} className="flex items-center gap-1.5 font-mono text-[11px] text-white/40">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────

export default function StatsClient({ data }: { data: StatsData }) {
  const updated = new Date(data.lastUpdated).toLocaleTimeString("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
            Statistics
          </p>
          <h1 className="mt-2 text-4xl">Přehled od Dne 1</h1>
          <p className="mt-2 text-sm text-white/40">
            Dnes je Den {data.currentDay} — data aktualizována v {updated}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LiveRefresh intervalMs={300000} />
          <Link
            href="/"
            className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/6"
          >
            Dashboard
          </Link>
          <Link
            href="/timeline"
            className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/6"
          >
            Timeline
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Celkem událostí"
          value={data.totalEvents}
          sub={`od 28. 2. 2026`}
          accent
        />
        <StatCard
          label="Dnes"
          value={data.eventsToday}
          sub="nových záznamů"
        />
        <StatCard
          label="Lodě aktivní"
          value={data.activeShips}
          sub="typ: ship"
        />
        <StatCard
          label="Alerty 24h"
          value={data.alertsLast24h}
          sub="posledních 24 hodin"
        />
      </div>

      {/* Row 1: events per day (full width) */}
      <ChartPanel
        title="Události po dnech"
        sub={`Den 1 – Den ${data.currentDay} · každý sloupec = 1 den`}
      >
        <BarLegend />
        <EventsPerDayChart data={data.eventsPerDay} />
      </ChartPanel>

      {/* Row 2: pie + locations side by side */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <ChartPanel
          title="Typy událostí"
          sub="distribuce podle odvozené kategorie"
        >
          <EventsByTypeChart data={data.eventsByType} />

          {/* Type count summary below the donut */}
          <div className="mt-5 grid grid-cols-2 gap-2">
            {data.eventsByType.map((s) => (
              <div
                key={s.type}
                className="rounded-[1rem] border border-white/8 bg-white/3 px-3 py-2"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
                  {s.emoji} {s.label}
                </p>
                <p className="mt-1 text-2xl" style={{ color: s.color }}>
                  {s.count}
                </p>
              </div>
            ))}
            {data.eventsByType.length === 0 && (
              <p className="col-span-2 text-sm text-white/30">Žádná data</p>
            )}
          </div>
        </ChartPanel>

        <ChartPanel
          title="Nejčastější lokace"
          sub="top 10 podle počtu záznamů"
        >
          <TopLocationsChart data={data.topLocations} />
        </ChartPanel>
      </div>

      {/* Data note */}
      <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-white/20">
        Šablonové záznamy jsou zahrnuty dokud nejsou nahrazeny živými daty · obnova každých 5 min
      </p>
    </div>
  );
}
