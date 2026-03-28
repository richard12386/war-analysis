import type { Metadata } from "next";
import Link from "next/link";
import {
  createIncidentAction,
  importAllSourcesAction,
  importIncidentFeedAction,
} from "@/app/actions";
import {
  formatIncidentDate,
  getSortedIncidents,
  getVerificationLabel,
} from "@/lib/incidents";
import { readImportSources } from "@/lib/import-sources";

export const metadata: Metadata = {
  title: "Admin",
  description: "Redakční rozhraní pro ruční zadávání incidentů a spouštění importů ze zdrojů.",
};

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams: Promise<{
    created?: string;
    imported?: string;
    failedSources?: string;
  }>;
};

export default async function AdminPage(props: AdminPageProps) {
  const searchParams = await props.searchParams;
  const incidents = await getSortedIncidents();
  const sources = await readImportSources();

  const enabledSources = sources.filter((s) => s.enabled);
  const liveIncidents = incidents.filter((i) => !i.isTemplate);

  const trustStats = {
    avg:
      liveIncidents.length > 0
        ? Math.round(
            liveIncidents.reduce((sum, i) => sum + (i.trustScore ?? 0), 0) /
              liveIncidents.length,
          )
        : 0,
    confirmed: liveIncidents.filter((i) => i.verification === "confirmed").length,
    pending: liveIncidents.filter((i) => i.verification === "pending").length,
    contested: liveIncidents.filter((i) => i.verification === "contested").length,
    withTrusted: liveIncidents.filter((i) => (i.trustedSourceCount ?? 0) > 0).length,
  };

  const signalCounts: Record<string, number> = {};
  for (const incident of liveIncidents) {
    for (const signal of incident.suspiciousSignals ?? []) {
      signalCounts[signal] = (signalCounts[signal] ?? 0) + 1;
    }
  }

  return (
    <main className="shell min-h-screen px-5 py-6 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        {/* Header */}
        <section className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
                Desk control
              </p>
              <h1 className="mt-2 text-4xl sm:text-5xl">Redakční konzole</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
                Odsud lze ručně přidávat incidenty, spouštět importy a hned
                kontrolovat, co je venku na dashboardu.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/6"
            >
              Zpět na dashboard
            </Link>
          </div>

          {searchParams.created ? (
            <StatusNotice variant="success">
              Nový incident byl uložen a zobrazí se na dashboardu.
            </StatusNotice>
          ) : null}

          {searchParams.imported ? (
            <StatusNotice variant="success">
              Import proběhl. Přidáno nebo aktualizováno {searchParams.imported} záznamů.
              {searchParams.failedSources ? (
                <span className="ml-1 text-[#ffd8a8]">
                  ({searchParams.failedSources} zdrojů selhalo)
                </span>
              ) : null}
            </StatusNotice>
          ) : null}

          {/* Verifikační přehled */}
          {liveIncidents.length > 0 ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <StatPill label="Průměrná důvěra" value={`${trustStats.avg}/100`} />
              <StatPill
                label="Potvrzeno"
                value={String(trustStats.confirmed)}
                color="text-[#b7efc5]"
              />
              <StatPill label="Čeká na ověření" value={String(trustStats.pending)} />
              <StatPill
                label="Sporné"
                value={String(trustStats.contested)}
                color="text-[#ffd8a8]"
              />
              <StatPill label="Má důvěryhodný zdroj" value={String(trustStats.withTrusted)} />
            </div>
          ) : null}

          {Object.keys(signalCounts).length > 0 ? (
            <div className="mt-4 rounded-[1.25rem] border border-[#ffd8a8]/20 bg-[#ffd8a8]/5 px-4 py-3 text-sm text-[#ffd8a8]">
              <span className="font-mono uppercase tracking-[0.2em]">Podezřelé signály:</span>
              <span className="ml-2">
                {Object.entries(signalCounts)
                  .map(([signal, count]) => `${signal} (${count}×)`)
                  .join(", ")}
              </span>
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          {/* Formulář pro ruční zadání */}
          <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
              Ruční zadání
            </p>
            <h2 className="mt-2 text-3xl">Přidat incident</h2>
            <form action={createIncidentAction} className="mt-6 grid gap-4">
              <LabelledField label="Titulek">
                <input name="title" required className={inputClassName} />
              </LabelledField>

              <LabelledField label="Shrnutí">
                <textarea name="summary" required rows={4} className={inputClassName} />
              </LabelledField>

              <LabelledField label="Detailní text">
                <textarea name="body" rows={8} className={inputClassName} />
              </LabelledField>

              <div className="grid gap-4 md:grid-cols-2">
                <LabelledField label="Lokalita">
                  <input name="location" required className={inputClassName} />
                </LabelledField>
                <LabelledField label="Publikováno">
                  <input name="publishedAt" type="datetime-local" className={inputClassName} />
                </LabelledField>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <LabelledField label="Kategorie">
                  <select name="category" defaultValue="breaking" className={inputClassName}>
                    <option value="breaking">Breaking</option>
                    <option value="vojensky-vyvoj">Vojenský vývoj</option>
                    <option value="civilni-dopady">Civilní dopady</option>
                    <option value="diplomacie">Diplomacie</option>
                  </select>
                </LabelledField>

                <LabelledField label="Závažnost">
                  <select name="severity" defaultValue="high" className={inputClassName}>
                    <option value="critical">Kritická</option>
                    <option value="high">Vysoká</option>
                    <option value="medium">Střední</option>
                    <option value="low">Nízká</option>
                  </select>
                </LabelledField>

                <LabelledField label="Ověření">
                  <select name="verification" defaultValue="pending" className={inputClassName}>
                    <option value="confirmed">Potvrzeno</option>
                    <option value="pending">Čeká na ověření</option>
                    <option value="contested">Sporné</option>
                    <option value="template">Šablona</option>
                  </select>
                </LabelledField>
              </div>

              <LabelledField label="Tagy">
                <input
                  name="tags"
                  placeholder="írán, breaking, rakety"
                  className={inputClassName}
                />
              </LabelledField>

              <div className="grid gap-4 md:grid-cols-2">
                <LabelledField label="Typ zbraně (nepovinné)">
                  <input
                    name="weaponType"
                    placeholder="Balistická raketa, dron, dělostřelba…"
                    className={inputClassName}
                  />
                </LabelledField>
                <LabelledField label="Typ cíle (nepovinné)">
                  <input
                    name="targetType"
                    placeholder="Vojenská základna, civilní infrastruktura…"
                    className={inputClassName}
                  />
                </LabelledField>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <LabelledField label="Mrtvých (potvrzeno)">
                  <input
                    name="casualties"
                    type="number"
                    min="0"
                    placeholder="0"
                    className={inputClassName}
                  />
                </LabelledField>
                <LabelledField label="Zraněných (potvrzeno)">
                  <input
                    name="injuries"
                    type="number"
                    min="0"
                    placeholder="0"
                    className={inputClassName}
                  />
                </LabelledField>
              </div>

              <LabelledField label="Poškozená infrastruktura (nepovinné)">
                <input
                  name="infrastructureDamage"
                  placeholder="Letecká dráha, elektrická síť, nemocnice…"
                  className={inputClassName}
                />
              </LabelledField>

              <div className="grid gap-4 md:grid-cols-3">
                <LabelledField label="Název zdroje">
                  <input name="sourceLabel" className={inputClassName} />
                </LabelledField>
                <LabelledField label="URL zdroje">
                  <input name="sourceUrl" type="url" className={inputClassName} />
                </LabelledField>
                <LabelledField label="Typ zdroje">
                  <select name="sourceType" defaultValue="media" className={inputClassName}>
                    <option value="media">Média</option>
                    <option value="official">Oficiální</option>
                    <option value="osint">OSINT</option>
                    <option value="ngo">NGO</option>
                  </select>
                </LabelledField>
              </div>

              <div className="flex flex-wrap gap-5 pt-2 text-sm text-[var(--muted)]">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="featured" className="h-4 w-4" />
                  Označit jako featured
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="isTemplate" className="h-4 w-4" />
                  Uložit jako šablonu
                </label>
              </div>

              <button
                type="submit"
                className="mt-2 w-fit rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#1a100d] transition hover:brightness-110"
              >
                Uložit incident
              </button>
            </form>
          </section>

          <div className="space-y-6">
            {/* Import */}
            <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
                Import
              </p>
              <h2 className="mt-2 text-3xl">Spustit ingest</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                Nakonfigurované zdroje jsou v souboru{" "}
                <code>data/import-sources.json</code>. Importované záznamy se
                ukládají jako nefeatured s ověřením &quot;čeká na ověření&quot;.
              </p>

              {enabledSources.length > 0 ? (
                <form action={importAllSourcesAction} className="mt-4">
                  <button
                    type="submit"
                    className="w-full rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#1a100d] transition hover:brightness-110"
                  >
                    Importovat všechny aktivní zdroje ({enabledSources.length})
                  </button>
                </form>
              ) : (
                <p className="mt-4 rounded-[1.25rem] border border-white/10 bg-black/20 p-4 text-sm text-[var(--muted)]">
                  Žádné aktivní zdroje. Nastav{" "}
                  <code>&quot;enabled&quot;: true</code> v{" "}
                  <code>data/import-sources.json</code>.
                </p>
              )}

              <div className="mt-5 grid gap-3">
                {sources.map((source) => (
                  <form
                    key={source.id}
                    action={importIncidentFeedAction}
                    className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4"
                  >
                    <input type="hidden" name="sourceId" value={source.id} />
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-lg">{source.label}</h3>
                        <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                          {source.description}
                        </p>
                        <p className="mt-3 font-mono text-xs uppercase tracking-[0.22em] text-white/50">
                          {source.format} –{" "}
                          {source.enabled ? (
                            <span className="text-[#b7efc5]">aktivní</span>
                          ) : (
                            <span className="text-[#ffd8a8]">vypnuto</span>
                          )}
                        </p>
                      </div>
                      <button
                        type="submit"
                        disabled={!source.enabled}
                        className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-sm text-white transition enabled:hover:border-white/30 enabled:hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Import
                      </button>
                    </div>
                  </form>
                ))}
              </div>

              <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-[var(--muted)]">
                Pro live režim nastav externí cron na{" "}
                <code>/api/cron/import</code> každých 5 minut. Pokud nastavíš{" "}
                <code>CRON_SECRET</code>, posílej ho jako{" "}
                <code>Authorization: Bearer …</code> nebo{" "}
                <code>?key=…</code>.
              </div>
            </section>

            {/* API seznam */}
            <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
                API endpoints
              </p>
              <h2 className="mt-2 text-3xl">Dostupná API</h2>
              <div className="mt-5 grid gap-2 text-sm">
                {[
                  { path: "/api/incidents", label: "Všechny incidenty" },
                  { path: "/api/incidents/live", label: "Živé incidenty (bez šablon)" },
                  { path: "/api/map", label: "Mapové markery a trajektorie" },
                  { path: "/api/verification", label: "Verifikační statistiky" },
                  {
                    path: "/api/cron/import",
                    label: "Cron import (vyžaduje CRON_SECRET)",
                  },
                ].map(({ path, label }) => (
                  <a
                    key={path}
                    href={path}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-4 rounded-[1rem] border border-white/10 bg-black/20 px-4 py-3 transition hover:border-white/25 hover:bg-white/5"
                  >
                    <code className="font-mono text-xs text-[#ffb49a]">{path}</code>
                    <span className="text-xs text-[var(--muted)]">{label}</span>
                  </a>
                ))}
              </div>
            </section>

            {/* Poslední záznamy */}
            <section className="rounded-[1.75rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ffb49a]">
                Poslední záznamy
              </p>
              <h2 className="mt-2 text-3xl">Přehled</h2>
              <div className="mt-5 grid gap-3">
                {incidents.slice(0, 8).map((incident) => (
                  <article
                    key={incident.id}
                    className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/incidents/${incident.id}`}
                        className="text-base transition hover:text-[#ffb49a]"
                      >
                        {incident.title}
                      </Link>
                      {incident.trustScore !== undefined ? (
                        <span
                          className={`shrink-0 font-mono text-xs ${incident.trustScore >= 70 ? "text-[#b7efc5]" : incident.trustScore < 35 ? "text-[#ffd8a8]" : "text-white/50"}`}
                        >
                          {incident.trustScore}/100
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-white/50">
                      <span>{formatIncidentDate(incident.publishedAt)}</span>
                      <span
                        className={
                          incident.verification === "confirmed"
                            ? "text-[#b7efc5]"
                            : incident.verification === "contested"
                              ? "text-[#ffd8a8]"
                              : ""
                        }
                      >
                        {getVerificationLabel(incident.verification)}
                      </span>
                      <span>{incident.sourceCount} zdrojů</span>
                      {incident.origin === "imported" ? (
                        <span className="text-[#c8b7a4]">import</span>
                      ) : null}
                    </div>
                    {incident.suspiciousSignals?.length ? (
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#ffd8a8]">
                        {incident.suspiciousSignals.join(", ")}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function LabelledField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm text-[var(--muted)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

function StatusNotice({
  children,
  variant = "success",
}: {
  children: React.ReactNode;
  variant?: "success" | "warning";
}) {
  return (
    <div
      className={`mt-5 rounded-[1.25rem] border px-4 py-3 text-sm ${
        variant === "warning"
          ? "border-[#ffd8a8]/30 bg-[#ffd8a8]/10 text-[#ffd8a8]"
          : "border-[var(--line)] bg-[var(--accent-soft)] text-[#f8d6cb]"
      }`}
    >
      {children}
    </div>
  );
}

function StatPill({
  label,
  value,
  color = "text-white/80",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className={`mt-2 text-2xl leading-none ${color}`}>{value}</p>
    </div>
  );
}

const inputClassName =
  "w-full rounded-[1rem] border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-[#dd6a42]";
