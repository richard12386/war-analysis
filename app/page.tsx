import type { Metadata } from "next";
import Link from "next/link";
import { IncidentMap } from "@/app/incident-map";
import { LiveRefresh } from "@/app/live-refresh";
import {
  formatIncidentDate,
  getCategoryLabel,
  getDashboardStats,
  getFeaturedIncidents,
  getIncidentDataset,
  getSeverityLabel,
  getSortedIncidents,
  getVerificationLabel,
  type Incident,
} from "@/lib/incidents";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Newsroom dashboard pro sledování incidentů, ověřování zdrojů a publikaci aktualit o válce v Íránu.",
};

export const dynamic = "force-dynamic";

const severityStyles = {
  critical: "border-[#dd6a42] bg-[#dd6a42]/12 text-[#ffb49a]",
  high: "border-[#d79e52] bg-[#d79e52]/12 text-[#ffd79b]",
  medium: "border-[#7f8f8d] bg-[#7f8f8d]/12 text-[#d1dfdb]",
  low: "border-white/15 bg-white/5 text-[#f5ede3]",
} as const;

const verificationStyles = {
  confirmed: "text-[#b7efc5]",
  contested: "text-[#ffd8a8]",
  pending: "text-[#d3d3d3]",
  template: "text-[#c8b7a4]",
} as const;

const verificationBorderStyles = {
  confirmed: "border-[#b7efc5]/20",
  contested: "border-[#ffd8a8]/20",
  pending: "border-white/10",
  template: "border-white/6",
} as const;

function sortByVerificationPriority(incidents: Incident[]) {
  const order: Record<string, number> = { confirmed: 0, pending: 1, contested: 2, template: 3 };
  return [...incidents].sort((a, b) => {
    const priorityDiff = (order[a.verification] ?? 3) - (order[b.verification] ?? 3);
    if (priorityDiff !== 0) return priorityDiff;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}

export default async function Home() {
  const dataset = await getIncidentDataset();
  const stats = await getDashboardStats();
  const featured = await getFeaturedIncidents();
  const incidents = await getSortedIncidents();

  const liveIncidents = incidents.filter((i) => !i.isTemplate);
  const confirmedIncidents = liveIncidents.filter((i) => i.verification === "confirmed");
  const pendingIncidents = liveIncidents.filter((i) => i.verification === "pending");
  const contestedIncidents = liveIncidents.filter((i) => i.verification === "contested");
  const templateIncidents = sortByVerificationPriority(incidents).filter((i) => i.isTemplate);

  const hasRecentConfirmed = confirmedIncidents.length > 0;

  return (
    <main className="shell min-h-screen px-5 py-6 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        {/* Hero */}
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--panel)] shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.35fr_0.95fr] lg:px-10 lg:py-10">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                <span className="rounded-full border border-[var(--line)] px-3 py-1">
                  War monitoring
                </span>
                <span className="rounded-full border border-[var(--line)] px-3 py-1">
                  Fokus na Írán
                </span>
                {hasRecentConfirmed ? (
                  <span className="rounded-full border border-[#b7efc5]/30 bg-[#b7efc5]/10 px-3 py-1 text-[#b7efc5]">
                    Live – potvrzené zprávy
                  </span>
                ) : (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1">
                    Připraveno pro živá data
                  </span>
                )}
              </div>

              <div className="max-w-3xl space-y-4">
                <p className="font-mono text-sm uppercase tracking-[0.3em] text-[#ffb49a]">
                  {dataset.meta.siteTitle}
                </p>
                <h1 className="max-w-4xl text-5xl leading-none font-medium text-balance sm:text-6xl lg:text-7xl">
                  Redakční základ pro všechny aktuality o válce v Íránu.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-[var(--muted)] sm:text-lg">
                  Dashboard umožňuje průběžné doplňování ověřených událostí,
                  prioritizaci breaking updates, třídění podle závažnosti a
                  oddělení potvrzených informací od tvrzení čekajících na
                  verifikaci.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="#timeline"
                  className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#1a100d] transition hover:brightness-110"
                >
                  Otevřít timeline
                </Link>
                <Link
                  href="/admin"
                  className="rounded-full border border-white/12 px-5 py-3 text-sm font-semibold text-white/90 transition hover:border-white/30 hover:bg-white/6"
                >
                  Otevřít admin
                </Link>
                <Link
                  href="/api/incidents"
                  className="rounded-full border border-white/12 px-5 py-3 text-sm font-semibold text-white/90 transition hover:border-white/30 hover:bg-white/6"
                >
                  API – incidenty
                </Link>
              </div>
            </div>

            <aside className="grid gap-3 rounded-[1.75rem] border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <LiveRefresh intervalMs={300000} />
              </div>
              <MetricCard value={stats.totalItems} label="Položky v systému" />
              <MetricCard value={stats.liveItems} label="Živé incidenty" />
              <MetricCard
                value={stats.verifiedItems}
                label="Potvrzené záznamy"
                highlight={stats.verifiedItems > 0}
              />
              <MetricCard value={stats.criticalItems} label="Kritické incidenty" />
              <MetricCard value={stats.featuredItems} label="Featured karty" />
              <MetricCard value={stats.pendingItems} label="Čeká na ověření" />
            </aside>
          </div>
        </section>

        {/* Featured + Watchlist */}
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
                  Featured
                </p>
                <h2 className="mt-2 text-3xl">Co má být vždy nahoře</h2>
              </div>
              <p className="text-sm text-[var(--muted)]">
                Poslední update {formatIncidentDate(dataset.meta.lastUpdated)}
              </p>
            </div>

            <div className="grid gap-4">
              {featured.length > 0 ? (
                featured.map((incident) => (
                  <article
                    key={incident.id}
                    className={`rounded-[1.5rem] border bg-black/20 p-5 ${verificationBorderStyles[incident.verification]}`}
                  >
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <Badge>{getCategoryLabel(incident.category)}</Badge>
                      <Badge className={severityStyles[incident.severity]}>
                        {getSeverityLabel(incident.severity)}
                      </Badge>
                      <span
                        className={`text-xs font-medium uppercase tracking-[0.2em] ${verificationStyles[incident.verification]}`}
                      >
                        {getVerificationLabel(incident.verification)}
                      </span>
                    </div>
                    <h3 className="text-2xl leading-tight">
                      <Link
                        href={`/incidents/${incident.id}`}
                        className="transition hover:text-[#ffb49a]"
                      >
                        {incident.title}
                      </Link>
                    </h3>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
                      {incident.summary}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-white/55">
                      <span>{incident.location}</span>
                      <span>{formatIncidentDate(incident.publishedAt)}</span>
                      <span>{incident.sourceCount} zdrojů</span>
                      {incident.trustScore !== undefined ? (
                        <span
                          className={
                            incident.trustScore >= 70
                              ? "text-[#b7efc5]"
                              : incident.trustScore < 35
                                ? "text-[#ffd8a8]"
                                : ""
                          }
                        >
                          důvěra {incident.trustScore}/100
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5 text-sm leading-7 text-[var(--muted)]">
                  Zatím žádné featured incidenty. Označ incident jako featured v admin rozhraní.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
                Watchlist
              </p>
              <h2 className="mt-2 text-3xl">Okruhy ke sledování</h2>
              <div className="mt-5 grid gap-3">
                {dataset.watchlist.map((item) => (
                  <article
                    key={item.label}
                    className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4"
                  >
                    <h3 className="text-lg">{item.label}</h3>
                    <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                      {item.description}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
                Redakční pravidlo
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                {dataset.meta.editorialNote}
              </p>
              <div className="mt-4 rounded-[1.25rem] border border-[var(--line)] bg-[var(--accent-soft)] p-4 text-sm leading-7 text-[#f8d6cb]">
                Doporučený postup: nejdřív vložit incident, pak přidat zdroje,
                nastavit úroveň ověření a teprve poté označit jako featured.
              </div>
            </section>
          </div>
        </section>

        {/* Mapa */}
        <IncidentMap incidents={incidents} />

        {/* Timeline */}
        <section
          id="timeline"
          className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
                Timeline
              </p>
              <h2 className="mt-2 text-3xl">Chronologie incidentů</h2>
            </div>
            <div className="flex items-center gap-4 text-sm text-[var(--muted)]">
              <span className="text-[#b7efc5]">{confirmedIncidents.length} potvrzeno</span>
              <span>{pendingIncidents.length} čeká</span>
              <span className="text-[#ffd8a8]">{contestedIncidents.length} sporné</span>
            </div>
          </div>

          <div className="mt-6 grid gap-6">
            {confirmedIncidents.length > 0 && (
              <IncidentGroup
                label="Potvrzeno"
                labelColor="text-[#b7efc5]"
                incidents={confirmedIncidents}
              />
            )}
            {pendingIncidents.length > 0 && (
              <IncidentGroup
                label="Čeká na ověření"
                labelColor="text-[#d3d3d3]"
                incidents={pendingIncidents}
              />
            )}
            {contestedIncidents.length > 0 && (
              <IncidentGroup
                label="Sporné / slabě podložené"
                labelColor="text-[#ffd8a8]"
                incidents={contestedIncidents}
              />
            )}
            {templateIncidents.length > 0 && (
              <IncidentGroup
                label="Šablony (nahradit živými daty)"
                labelColor="text-[#c8b7a4]"
                incidents={templateIncidents}
              />
            )}
            {liveIncidents.length === 0 && templateIncidents.length === 0 && (
              <p className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5 text-sm leading-7 text-[var(--muted)]">
                Zatím žádné záznamy. Přidej incident v admin rozhraní nebo spusť import.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function IncidentGroup({
  label,
  labelColor,
  incidents,
}: {
  label: string;
  labelColor: string;
  incidents: Incident[];
}) {
  return (
    <div>
      <p className={`mb-3 font-mono text-xs uppercase tracking-[0.3em] ${labelColor}`}>
        {label}
      </p>
      <div className="grid gap-4">
        {incidents.map((incident, index) => (
          <IncidentRow key={incident.id} incident={incident} index={index} />
        ))}
      </div>
    </div>
  );
}

function IncidentRow({ incident, index }: { incident: Incident; index: number }) {
  return (
    <article
      className={`grid gap-4 rounded-[1.5rem] border bg-black/20 p-5 lg:grid-cols-[90px_1fr] ${verificationBorderStyles[incident.verification]}`}
    >
      <div className="flex items-start lg:justify-center">
        <div className="rounded-full border border-white/12 px-3 py-2 font-mono text-xs uppercase tracking-[0.24em] text-white/65">
          #{String(index + 1).padStart(2, "0")}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{getCategoryLabel(incident.category)}</Badge>
          <Badge className={severityStyles[incident.severity]}>
            {getSeverityLabel(incident.severity)}
          </Badge>
          <Badge className={verificationStyles[incident.verification]}>
            {getVerificationLabel(incident.verification)}
          </Badge>
        </div>
        <h3 className="mt-4 text-2xl leading-tight">
          <Link
            href={`/incidents/${incident.id}`}
            className="transition hover:text-[#ffb49a]"
          >
            {incident.title}
          </Link>
        </h3>
        <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{incident.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {incident.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-white/60"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-white/50">
          <span>{incident.location}</span>
          <span>{formatIncidentDate(incident.publishedAt)}</span>
          <span>{incident.sourceCount} zdrojů</span>
          {incident.trustScore !== undefined ? (
            <span
              className={
                incident.trustScore >= 70
                  ? "text-[#b7efc5]"
                  : incident.trustScore < 35
                    ? "text-[#ffd8a8]"
                    : ""
              }
            >
              důvěra {incident.trustScore}/100
            </span>
          ) : null}
          {incident.casualties !== undefined ? (
            <span className="text-[#ffb49a]">{incident.casualties} mrtvých</span>
          ) : null}
          {incident.injuries !== undefined ? (
            <span>{incident.injuries} zraněných</span>
          ) : null}
        </div>
        {incident.suspiciousSignals?.length ? (
          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[#ffd8a8]">
            Signály: {incident.suspiciousSignals.join(", ")}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function MetricCard({
  value,
  label,
  highlight,
}: {
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <article
      className={`rounded-[1.4rem] border p-4 ${highlight ? "border-[#b7efc5]/20 bg-[#b7efc5]/5" : "border-white/10 bg-white/5"}`}
    >
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
        {label}
      </p>
      <p className={`mt-3 text-4xl leading-none ${highlight ? "text-[#b7efc5]" : ""}`}>
        {value}
      </p>
    </article>
  );
}

function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-white/80 ${className}`}
    >
      {children}
    </span>
  );
}
