import type { Incident } from "@/lib/incidents";

const BOUNDS = {
  minLat: 20,
  maxLat: 42,
  minLng: 34,
  maxLng: 64,
};

export function IncidentMap({ incidents }: { incidents: Incident[] }) {
  const points = incidents
    .filter((incident) => incident.mapPoint)
    .map((incident) => ({
      id: incident.id,
      title: incident.title,
      verification: incident.verification,
      severity: incident.severity,
      point: incident.mapPoint!,
      weaponType: incident.weaponType,
      targetType: incident.targetType,
    }));

  const trajectories = incidents.flatMap((incident) =>
    (incident.trajectories ?? []).map((trajectory) => ({
      ...trajectory,
      incidentId: incident.id,
      incidentVerification: incident.verification,
    })),
  );

  const hasData = points.length > 0 || trajectories.length > 0;

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
            Live map
          </p>
          <h2 className="mt-2 text-3xl">Kde jsou zasahy a kam miri utoky</h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-[var(--muted)]">
          Mapa ukazuje jen zaznamy s doplnenou geolokaci. Carkovane trajektorie
          znaci hlasene nebo sledovane smery, nikoli automaticky potvrzeny dopad.
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#120d0b]">
        <svg viewBox="0 0 1000 620" className="h-auto w-full">
          <defs>
            <linearGradient id="gridGlow" x1="0" x2="1">
              <stop offset="0%" stopColor="#3b2318" />
              <stop offset="100%" stopColor="#1a120e" />
            </linearGradient>
            <marker id="arrow-confirmed" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#ffb49a" opacity="0.85" />
            </marker>
            <marker id="arrow-reported" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#d79e52" opacity="0.85" />
            </marker>
          </defs>

          <rect width="1000" height="620" fill="url(#gridGlow)" />

          {Array.from({ length: 9 }).map((_, index) => (
            <line
              key={`v-${index}`}
              x1={80 + index * 100}
              y1={40}
              x2={80 + index * 100}
              y2={580}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          ))}

          {Array.from({ length: 6 }).map((_, index) => (
            <line
              key={`h-${index}`}
              x1={60}
              y1={60 + index * 90}
              x2={940}
              y2={60 + index * 90}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          ))}

          <text x="90" y="78" fill="rgba(255,255,255,0.38)" fontSize="18">
            Irak
          </text>
          <text x="455" y="120" fill="rgba(255,255,255,0.38)" fontSize="20">
            Iran
          </text>
          <text x="790" y="220" fill="rgba(255,255,255,0.38)" fontSize="18">
            Persky zaliv
          </text>
          <text x="175" y="500" fill="rgba(255,255,255,0.38)" fontSize="18">
            Izrael
          </text>

          {trajectories.map((trajectory) => {
            const origin = toSvgPoint(trajectory.origin.lat, trajectory.origin.lng);
            const target = toSvgPoint(trajectory.target.lat, trajectory.target.lng);
            const midX = (origin.x + target.x) / 2;
            const midY = (origin.y + target.y) / 2;
            const isConfirmed = trajectory.status === "confirmed";
            const strokeColor = isConfirmed ? "#ffb49a" : "#d79e52";
            const markerId = isConfirmed ? "url(#arrow-confirmed)" : "url(#arrow-reported)";

            return (
              <g key={trajectory.id}>
                <line
                  x1={origin.x}
                  y1={origin.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={strokeColor}
                  strokeWidth="2.5"
                  strokeDasharray={isConfirmed ? "0" : "10 8"}
                  opacity="0.85"
                  markerEnd={markerId}
                />
                <circle cx={origin.x} cy={origin.y} r="5" fill="#ffd79b" />
                <circle cx={target.x} cy={target.y} r="6" fill="#dd6a42" />
                {trajectory.weaponType ? (
                  <text
                    x={midX + 6}
                    y={midY - 6}
                    fill="rgba(255,255,255,0.65)"
                    fontSize="11"
                  >
                    {trajectory.weaponType}
                  </text>
                ) : null}
              </g>
            );
          })}

          {points.map((item) => {
            const point = toSvgPoint(item.point.lat, item.point.lng);
            const fill =
              item.verification === "confirmed"
                ? "#b7efc5"
                : item.verification === "contested"
                  ? "#ffd8a8"
                  : "#ffb49a";

            return (
              <g key={item.id}>
                <circle cx={point.x} cy={point.y} r="9" fill={fill} opacity="0.95" />
                <circle cx={point.x} cy={point.y} r="20" fill={fill} opacity="0.14" />
                <text
                  x={point.x + 16}
                  y={point.y - 12}
                  fill="rgba(255,255,255,0.82)"
                  fontSize="16"
                >
                  {item.point.label}
                </text>
              </g>
            );
          })}

          {!hasData ? (
            <text
              x="500"
              y="310"
              textAnchor="middle"
              fill="rgba(255,255,255,0.28)"
              fontSize="16"
            >
              Zadne incidenty s geolokaci. Doplnte mapPoint nebo trajektorie.
            </text>
          ) : null}
        </svg>
      </div>

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-2 text-xs uppercase tracking-[0.18em] text-white/55">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-[#b7efc5]" />
          Potvrzeno
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-[#ffb49a]" />
          Ceka na overeni
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-[#ffd8a8]" />
          Sporne
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-5 rounded-full bg-[#ffd79b]" />
          Startovni bod
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-5 rounded-full bg-[#dd6a42]" />
          Cilovy bod
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-[2px] w-6"
            style={{ background: "#ffb49a" }}
          />
          Potvrzena trajektorie
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-[2px] w-6"
            style={{
              background:
                "repeating-linear-gradient(90deg, #d79e52 0, #d79e52 4px, transparent 4px, transparent 8px)",
            }}
          />
          Hlasena trajektorie
        </span>
      </div>
    </section>
  );
}

function toSvgPoint(lat: number, lng: number) {
  const x =
    60 + ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 880;
  const y =
    580 - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 520;

  return { x, y };
}
