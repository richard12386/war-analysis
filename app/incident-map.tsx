import IncidentMapClient from "@/app/incident-map-client";
import type { Incident } from "@/lib/incidents";

export function IncidentMap({ incidents }: { incidents: Incident[] }) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
            Live map
          </p>
          <h2 className="mt-2 text-3xl">Kde jsou zásahy a kam míří útoky</h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-[var(--muted)]">
          Mapa zobrazuje jen záznamy s doplněnou geolokací. Přerušované
          trajektorie znamenají hlášené nebo sledované směry, nikoli automaticky
          potvrzený dopad.
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-white/10">
        <IncidentMapClient incidents={incidents} />
      </div>

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-2 text-xs uppercase tracking-[0.18em] text-white/55">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-[#b7efc5]" />
          Potvrzeno
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-[#ffb49a]" />
          Čeká na ověření
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-[#ffd8a8]" />
          Sporné
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-5 rounded-full bg-[#ffd79b]" />
          Startovní bod
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-5 rounded-full bg-[#dd6a42]" />
          Cílový bod
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-[2px] w-6" style={{ background: "#ffb49a" }} />
          Potvrzená trajektorie
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-[2px] w-6"
            style={{
              background:
                "repeating-linear-gradient(90deg,#d79e52 0,#d79e52 4px,transparent 4px,transparent 8px)",
            }}
          />
          Hlášená trajektorie
        </span>
      </div>
    </section>
  );
}
