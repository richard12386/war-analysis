"use client";

import { useEffect, useState } from "react";
import type { Incident } from "@/lib/incidents";

type Props = { incidents: Incident[] };

// Lazy-load leaflet only on client
export default function IncidentMapClient({ incidents }: Props) {
  const [MapComponents, setMapComponents] = useState<React.ComponentType<Props> | null>(null);

  useEffect(() => {
    // Dynamic import of the actual Leaflet map to avoid SSR issues
    import("./incident-map-leaflet").then((mod) => {
      setMapComponents(() => mod.default);
    });
  }, []);

  if (!MapComponents) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-[1.5rem] border border-white/10 bg-[#120d0b]">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/30">
          Načítám mapu…
        </p>
      </div>
    );
  }

  return <MapComponents incidents={incidents} />;
}
