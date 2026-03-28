"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Incident } from "@/lib/incidents";
import {
  FILTER_DEFS,
  TYPE_EMOJI,
  applyFilter,
  countsByFilter,
  deriveType,
  type IncidentFilterKey,
} from "@/lib/incident-type";

// War start: Day 1
const WAR_START_MS = new Date("2026-02-28T00:00:00Z").getTime();

function getPragueDate(isoStr: string): string {
  // Returns YYYY-MM-DD in Prague timezone
  return new Date(isoStr).toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

function getWarDay(pragueDate: string): number {
  // Days since 2026-02-28, 1-indexed
  const d = new Date(pragueDate + "T12:00:00Z").getTime();
  return Math.max(1, Math.round((d - WAR_START_MS) / 86400000) + 1);
}

function formatPragueTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayHeading(pragueDate: string): string {
  return new Date(pragueDate + "T12:00:00Z").toLocaleDateString("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type DayGroup = {
  dateKey: string; // YYYY-MM-DD
  dayNumber: number;
  isToday: boolean;
  incidents: Incident[];
};

function groupByDay(incidents: Incident[]): DayGroup[] {
  const today = getPragueDate(new Date().toISOString());
  const map = new Map<string, Incident[]>();

  for (const inc of incidents) {
    const dk = getPragueDate(inc.publishedAt);
    const arr = map.get(dk) ?? [];
    arr.push(inc);
    map.set(dk, arr);
  }

  return [...map.entries()]
    .map(([dateKey, items]) => ({
      dateKey,
      dayNumber: getWarDay(dateKey),
      isToday: dateKey === today,
      // Within a day, show chronologically (oldest first)
      incidents: [...items].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)),
    }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey)); // newest day at top
}

const verificationColors: Record<string, string> = {
  confirmed: "#b7efc5",
  pending: "#d3d3d3",
  contested: "#ffd8a8",
  template: "#c8b7a4",
};

export default function TimelineClient({ incidents }: { incidents: Incident[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const todayRef = useRef<HTMLDivElement>(null);

  const activeFilter = (searchParams.get("filter") as IncidentFilterKey | null) ?? "all";
  const counts = countsByFilter(incidents);
  const filtered = applyFilter(incidents, activeFilter);
  const dayGroups = groupByDay(filtered);

  // Auto-scroll to today on mount
  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []); // only on mount

  const setFilter = useCallback(
    (filter: IncidentFilterKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (filter === "all") {
        params.delete("filter");
      } else {
        params.set("filter", filter);
      }
      const qs = params.toString();
      router.replace(pathname + (qs ? `?${qs}` : ""), { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
            Chronologie
          </p>
          <h1 className="mt-2 text-4xl">Timeline od Dne 1</h1>
          <p className="mt-3 text-sm leading-7 text-white/50">
            Válka začala 28. 2. 2026. Dnes je Den {getWarDay(getPragueDate(new Date().toISOString()))}.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/"
            className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/6"
          >
            Zpět na dashboard
          </Link>
          <Link
            href="/#map"
            className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/6"
          >
            Otevřít mapu
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-8 flex flex-wrap gap-2">
        {FILTER_DEFS.map(({ key, label, emoji }) => {
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={[
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-[0.15em] transition-all",
                isActive
                  ? "bg-[#ffb49a]/20 text-[#ffb49a] ring-1 ring-[#ffb49a]/50"
                  : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70",
              ].join(" ")}
            >
              {emoji && <span>{emoji}</span>}
              {label}
              <span
                className={[
                  "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px]",
                  isActive ? "bg-[#ffb49a]/20 text-[#ffb49a]" : "bg-white/10 text-white/40",
                ].join(" ")}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {dayGroups.length === 0 && (
        <div className="rounded-[1.5rem] border border-white/10 bg-white/3 p-8 text-center">
          <p className="text-sm text-white/40">
            Žádné záznamy pro tento filtr.
          </p>
        </div>
      )}

      {/* Day groups */}
      <div className="relative">
        {/* Vertical timeline spine */}
        <div className="absolute left-[5.5rem] top-0 h-full w-px bg-white/10" />

        <div className="flex flex-col gap-0">
          {dayGroups.map((group) => (
            <div
              key={group.dateKey}
              ref={group.isToday ? todayRef : undefined}
              id={`day-${group.dateKey}`}
              className="relative"
            >
              {/* Day header */}
              <div className="sticky top-4 z-10 mb-4 mt-2 flex items-center gap-4">
                {/* Day badge */}
                <div className="w-20 shrink-0 text-right">
                  <span
                    className={[
                      "inline-block rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.2em]",
                      group.isToday
                        ? "bg-[#ffb49a]/20 text-[#ffb49a] ring-1 ring-[#ffb49a]/40"
                        : "bg-white/8 text-white/50",
                    ].join(" ")}
                  >
                    Den {group.dayNumber}
                  </span>
                </div>

                {/* Spine connector */}
                <div
                  className={[
                    "h-3 w-3 shrink-0 rounded-full ring-2",
                    group.isToday
                      ? "bg-[#ffb49a] ring-[#ffb49a]/30"
                      : "bg-white/20 ring-white/10",
                  ].join(" ")}
                />

                {/* Date label */}
                <div>
                  <p className="text-sm text-white/60">
                    {formatDayHeading(group.dateKey)}
                    {group.isToday && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#ffb49a]">
                        Dnes
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Events */}
              <div className="mb-8 ml-[6.5rem] flex flex-col gap-2">
                {group.incidents.map((inc, idx) => {
                  const type = deriveType(inc);
                  const emoji = TYPE_EMOJI[type];
                  const vColor = verificationColors[inc.verification] ?? "#d3d3d3";
                  const hasMap = !!inc.mapPoint;
                  const isLast = idx === group.incidents.length - 1;

                  return (
                    <div key={inc.id} className="relative flex gap-3">
                      {/* Spine extender */}
                      {!isLast && (
                        <div className="absolute -left-[1.55rem] top-5 h-full w-px bg-white/8" />
                      )}
                      {/* Connector dot */}
                      <div
                        className="absolute -left-[1.7rem] top-[0.65rem] h-2 w-2 rounded-full bg-white/15"
                        style={{ borderColor: vColor }}
                      />

                      <article
                        className="flex-1 rounded-[1.25rem] border border-white/8 bg-white/3 p-4 transition hover:border-white/15 hover:bg-white/5"
                        style={{ borderLeftColor: vColor + "33", borderLeftWidth: 2 }}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-white/35">
                              {formatPragueTime(inc.publishedAt)}
                            </span>
                            <span className="text-base leading-none">{emoji}</span>
                            <span
                              className="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]"
                              style={{ color: vColor, background: vColor + "18" }}
                            >
                              {type}
                            </span>
                          </div>

                          <div className="flex gap-2">
                            <Link
                              href={`/incidents/${inc.id}`}
                              className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-white/40 transition hover:border-white/25 hover:text-white/70"
                            >
                              Detail
                            </Link>
                            {hasMap && (
                              <Link
                                href={`/?focusId=${inc.id}#map`}
                                className="rounded-full border border-[#ffb49a]/25 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[#ffb49a]/70 transition hover:border-[#ffb49a]/50 hover:text-[#ffb49a]"
                              >
                                Na mapě
                              </Link>
                            )}
                          </div>
                        </div>

                        <h3 className="mt-2 text-base leading-snug text-white/90">
                          {inc.title}
                        </h3>

                        {inc.summary && (
                          <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-white/45">
                            {inc.summary}
                          </p>
                        )}

                        <div className="mt-2.5 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.15em] text-white/35">
                          {inc.location && (
                            <span className="flex items-center gap-1">
                              <span className="text-white/20">↓</span>
                              {inc.location}
                            </span>
                          )}
                          {inc.casualties !== undefined && (
                            <span className="text-[#ffb49a]/70">
                              {inc.casualties} mrtvých
                            </span>
                          )}
                          {inc.weaponType && (
                            <span className="text-[#ffd79b]/60">{inc.weaponType}</span>
                          )}
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom note */}
      {dayGroups.length > 0 && (
        <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-white/20">
          Den 1 — 28. 2. 2026 — začátek konfliktu
        </p>
      )}
    </div>
  );
}
