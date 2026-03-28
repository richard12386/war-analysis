import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatIncidentDate,
  getCategoryLabel,
  getIncidentById,
  getSeverityLabel,
  getVerificationLabel,
} from "@/lib/incidents";
import { isTrustedSource, isOfficialSource } from "@/lib/verification";

export const dynamic = "force-dynamic";

type IncidentPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(
  props: IncidentPageProps,
): Promise<Metadata> {
  const params = await props.params;
  const incident = await getIncidentById(params.id);

  if (!incident) {
    return {
      title: "Incident nenalezen",
    };
  }

  return {
    title: incident.title,
    description: incident.summary,
  };
}

export default async function IncidentPage(props: IncidentPageProps) {
  const params = await props.params;
  const incident = await getIncidentById(params.id);

  if (!incident) {
    notFound();
  }

  const hasMapData = incident.mapPoint || (incident.trajectories?.length ?? 0) > 0;
  const trustColor =
    (incident.trustScore ?? 0) >= 70
      ? "text-[#b7efc5]"
      : (incident.trustScore ?? 0) < 35
        ? "text-[#ffd8a8]"
        : "text-white/70";

  return (
    <main className="shell min-h-screen px-5 py-6 sm:px-8 lg:px-12">
      <article className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/"
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/6"
            >
              Zpet na dashboard
            </Link>
            <Link
              href="/admin"
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/6"
            >
              Otevrit admin
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <MetaPill>{getCategoryLabel(incident.category)}</MetaPill>
            <MetaPill>{getSeverityLabel(incident.severity)}</MetaPill>
            <MetaPill
              className={
                incident.verification === "confirmed"
                  ? "border-[#b7efc5]/30 text-[#b7efc5]"
                  : incident.verification === "contested"
                    ? "border-[#ffd8a8]/30 text-[#ffd8a8]"
                    : ""
              }
            >
              {getVerificationLabel(incident.verification)}
            </MetaPill>
            {incident.origin ? <MetaPill>{incident.origin}</MetaPill> : null}
          </div>

          <h1 className="mt-5 max-w-4xl text-4xl leading-tight sm:text-5xl">
            {incident.title}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-[var(--muted)]">
            {incident.summary}
          </p>

          <div className="mt-6 flex flex-wrap gap-4 text-sm uppercase tracking-[0.18em] text-white/50">
            <span>{incident.location}</span>
            <span>{formatIncidentDate(incident.publishedAt)}</span>
            <span>{incident.sourceCount} zdroju</span>
            {incident.trustScore !== undefined ? (
              <span className={trustColor}>trust {incident.trustScore}/100</span>
            ) : null}
            {incident.casualties !== undefined ? (
              <span className="text-[#ffb49a]">{incident.casualties} mrtvych</span>
            ) : null}
            {incident.injuries !== undefined ? (
              <span>{incident.injuries} ranenych</span>
            ) : null}
          </div>

          {(incident.weaponType || incident.targetType || incident.infrastructureDamage) ? (
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              {incident.weaponType ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.16em] text-[#ffd79b]">
                  Zbroj: {incident.weaponType}
                </span>
              ) : null}
              {incident.targetType ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.16em] text-white/70">
                  Cil: {incident.targetType}
                </span>
              ) : null}
              {incident.infrastructureDamage ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.16em] text-[#ffd8a8]">
                  Poskozeno: {incident.infrastructureDamage}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
            <h2 className="text-2xl">Detail incidentu</h2>
            <div className="mt-4 space-y-4 text-base leading-8 text-[var(--muted)]">
              {(incident.body ?? incident.summary)
                .split("\n")
                .filter(Boolean)
                .map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {incident.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-white/60"
                >
                  {tag}
                </span>
              ))}
            </div>
          </section>

          <aside className="space-y-6">
            {/* Verifikace */}
            <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
              <h2 className="text-2xl">Verifikace</h2>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[var(--muted)]">Trust score</span>
                  <span className={`font-mono ${trustColor}`}>
                    {incident.trustScore ?? "—"}/100
                  </span>
                </div>
                {incident.trustedSourceCount !== undefined ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[var(--muted)]">Duveryhodne zdroje</span>
                    <span className="font-mono text-[#b7efc5]">
                      {incident.trustedSourceCount}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[var(--muted)]">Stav overeni</span>
                  <span
                    className={`font-mono text-xs uppercase tracking-[0.18em] ${
                      incident.verification === "confirmed"
                        ? "text-[#b7efc5]"
                        : incident.verification === "contested"
                          ? "text-[#ffd8a8]"
                          : "text-white/70"
                    }`}
                  >
                    {getVerificationLabel(incident.verification)}
                  </span>
                </div>
              </div>

              {incident.verificationNote ? (
                <p className="mt-4 rounded-[1rem] border border-white/10 bg-black/20 p-3 text-sm leading-7 text-[#ffd8a8]">
                  {incident.verificationNote}
                </p>
              ) : null}

              {incident.suspiciousSignals?.length ? (
                <div className="mt-4 rounded-[1rem] border border-[#ffd8a8]/20 bg-[#ffd8a8]/5 p-3">
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#ffd8a8]">
                    Suspiciozni signaly
                  </p>
                  <p className="mt-2 text-xs text-[#ffd8a8]/80">
                    {incident.suspiciousSignals.join(", ")}
                  </p>
                </div>
              ) : null}

              <p className="mt-4 text-xs leading-6 text-[var(--muted)]">
                Automaticka kontrola nedokaze garantovat pravdu. Finalni
                potvrzeni musi delat redakcni workflow.
              </p>
            </section>

            {/* Zdroje */}
            <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
              <h2 className="text-2xl">Zdroje</h2>
              <div className="mt-4 grid gap-3">
                {incident.sources.length ? (
                  incident.sources.map((source) => {
                    const trusted = isTrustedSource(source);
                    const official = isOfficialSource(source);
                    return (
                      <a
                        key={`${source.label}-${source.url}`}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4 transition hover:border-white/25 hover:bg-white/8"
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-base">{source.label}</p>
                          {official ? (
                            <span className="rounded-full bg-[#b7efc5]/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#b7efc5]">
                              Oficial
                            </span>
                          ) : trusted ? (
                            <span className="rounded-full bg-white/8 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">
                              Duveryhodny
                            </span>
                          ) : (
                            <span className="rounded-full bg-[#ffd8a8]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#ffd8a8]">
                              Neovereny
                            </span>
                          )}
                          <span className="ml-1 rounded-full bg-white/6 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
                            {source.type}
                          </span>
                        </div>
                        <p className="mt-2 break-all text-sm leading-7 text-[var(--muted)]">
                          {source.url}
                        </p>
                        {source.publishedAt ? (
                          <p className="mt-1 text-xs text-white/35">
                            {formatIncidentDate(source.publishedAt)}
                          </p>
                        ) : null}
                      </a>
                    );
                  })
                ) : (
                  <p className="text-sm leading-7 text-[var(--muted)]">
                    Zatim nejsou ulozene zadne zdroje. Dopln je v admin rozhrani
                    nebo pres import.
                  </p>
                )}
              </div>
            </section>

            {/* Mapa / trajektorie */}
            {hasMapData ? (
              <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
                <h2 className="text-2xl">Mapa a trajektorie</h2>
                {incident.mapPoint ? (
                  <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-black/20 p-4 text-sm">
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#ffb49a]">
                      Misto incidentu
                    </p>
                    <p className="mt-2 text-white/80">{incident.mapPoint.label}</p>
                    <p className="mt-1 font-mono text-xs text-white/40">
                      {incident.mapPoint.lat.toFixed(4)}, {incident.mapPoint.lng.toFixed(4)}
                    </p>
                  </div>
                ) : null}
                {incident.trajectories?.map((traj) => (
                  <div
                    key={traj.id}
                    className="mt-3 rounded-[1.2rem] border border-white/10 bg-black/20 p-4 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#ffd79b]">
                        {traj.weaponType || "Trajektorie"}
                      </p>
                      <span
                        className={`font-mono text-[10px] uppercase tracking-[0.18em] ${traj.status === "confirmed" ? "text-[#b7efc5]" : "text-[#ffd8a8]"}`}
                      >
                        {traj.status === "confirmed" ? "Potvrzeno" : "Hlaseno"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-white/40">Start</p>
                        <p className="mt-1 text-white/80">{traj.origin.label}</p>
                        <p className="font-mono text-xs text-white/30">
                          {traj.origin.lat.toFixed(4)}, {traj.origin.lng.toFixed(4)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-white/40">Cil</p>
                        <p className="mt-1 text-white/80">{traj.target.label}</p>
                        <p className="font-mono text-xs text-white/30">
                          {traj.target.lat.toFixed(4)}, {traj.target.lng.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                <p className="mt-4 text-xs leading-6 text-[var(--muted)]">
                  Souradnice jsou zobrazeny na hlavni mape dashboardu.
                </p>
              </section>
            ) : null}
          </aside>
        </div>
      </article>
    </main>
  );
}

function MetaPill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/70 ${className}`}
    >
      {children}
    </span>
  );
}
