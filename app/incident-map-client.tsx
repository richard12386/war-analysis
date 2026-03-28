"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Incident, IncidentPoint } from "@/lib/incidents";
import {
  FILTER_DEFS,
  applyFilter,
  countsByFilter,
  type IncidentFilterKey,
} from "@/lib/incident-type";
import type { NotamCache, NotamZone } from "@/lib/notam-shared";

type LeafletProps = {
  incidents: Incident[];
  focusPoint?: IncidentPoint | null;
  notamZones: NotamZone[];
  showNotam: boolean;
};
type Props = { incidents: Incident[] };

const NOTAM_POLL_MS = 60 * 60 * 1000; // 1 hour

// ── layer state helpers ────────────────────────────────────────────────────

function readLayerLS(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = localStorage.getItem(`layer_${key}`);
  return v === null ? fallback : v === "true";
}

function writeLayerLS(key: string, value: boolean) {
  try {
    localStorage.setItem(`layer_${key}`, String(value));
  } catch {}
}

// ── component ──────────────────────────────────────────────────────────────

export default function IncidentMapClient({ incidents }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [MapComponent, setMapComponent] = useState<React.ComponentType<LeafletProps> | null>(
    null,
  );

  // incident filter
  const activeFilter = (searchParams.get("filter") as IncidentFilterKey | null) ?? "all";
  const focusId = searchParams.get("focusId");
  const focusPoint = focusId
    ? (incidents.find((i) => i.id === focusId)?.mapPoint ?? null)
    : null;

  // NOTAM layer
  const [notamZones, setNotamZones] = useState<NotamZone[]>([]);
  const [notamFetchedAt, setNotamFetchedAt] = useState<number | null>(null);
  const [showNotam, setShowNotam] = useState(false); // initialised after mount
  const notamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazy-load Leaflet
  useEffect(() => {
    import("./incident-map-leaflet").then((mod) => {
      setMapComponent(() => mod.default);
    });
  }, []);

  // Initialise layer visibility from localStorage after hydration
  useEffect(() => {
    setShowNotam(readLayerLS("notam", false));
  }, []);

  // NOTAM fetch + polling
  const fetchNotams = useCallback(async () => {
    try {
      const res = await fetch("/api/layers/notam");
      if (!res.ok) return;
      const data = (await res.json()) as NotamCache;
      setNotamZones(data.zones ?? []);
      setNotamFetchedAt(Date.now());
    } catch {
      // network failure — keep previous data
    }
  }, []);

  useEffect(() => {
    fetchNotams();
    notamTimerRef.current = setInterval(fetchNotams, NOTAM_POLL_MS);
    return () => {
      if (notamTimerRef.current) clearInterval(notamTimerRef.current);
    };
  }, [fetchNotams]);

  const toggleNotam = useCallback(() => {
    setShowNotam((prev) => {
      writeLayerLS("notam", !prev);
      return !prev;
    });
  }, []);

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

  const counts = countsByFilter(incidents);
  const filtered = applyFilter(incidents, activeFilter);

  // Freshness dot for NOTAM layer
  const notamAge = notamFetchedAt ? (Date.now() - notamFetchedAt) / 1000 / 60 : null;
  const notamDot =
    notamAge === null
      ? null
      : notamAge < 2
        ? "🟢"
        : notamAge < 10
          ? "🟡"
          : "🔴";

  // ── render ───────────────────────────────────────────────────────────────

  const incidentFilterBar = (
    <div className="mb-2 flex flex-wrap gap-2">
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
  );

  const layerBar = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">
        Vrstvy
      </span>
      {/* NOTAM toggle */}
      <button
        onClick={toggleNotam}
        className={[
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-[0.15em] transition-all",
          showNotam
            ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/50"
            : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70",
        ].join(" ")}
      >
        ✈ NOTAM
        {notamDot && <span className="text-[11px]">{notamDot}</span>}
        {notamZones.length > 0 && (
          <span
            className={[
              "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px]",
              showNotam ? "bg-red-500/20 text-red-300" : "bg-white/10 text-white/40",
            ].join(" ")}
          >
            {notamZones.length}
          </span>
        )}
      </button>
    </div>
  );

  if (!MapComponent) {
    return (
      <>
        {incidentFilterBar}
        {layerBar}
        <div className="flex h-[520px] items-center justify-center overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#120d0b]">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/30">
            Načítám mapu…
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {incidentFilterBar}
      {layerBar}
      <div className="overflow-hidden rounded-[1.5rem] border border-white/10">
        <MapComponent
          incidents={filtered}
          focusPoint={focusPoint}
          notamZones={notamZones}
          showNotam={showNotam}
        />
      </div>
    </>
  );
}
