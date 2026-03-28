import { getSortedIncidents } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export async function GET() {
  const incidents = await getSortedIncidents();
  const live = incidents.filter((i) => !i.isTemplate);

  const confirmed = live.filter((i) => i.verification === "confirmed");
  const pending = live.filter((i) => i.verification === "pending");
  const contested = live.filter((i) => i.verification === "contested");

  const avgTrustScore =
    live.length > 0
      ? Math.round(live.reduce((sum, i) => sum + (i.trustScore ?? 0), 0) / live.length)
      : 0;

  const signalCounts: Record<string, number> = {};
  for (const incident of live) {
    for (const signal of incident.suspiciousSignals ?? []) {
      signalCounts[signal] = (signalCounts[signal] ?? 0) + 1;
    }
  }

  const sourceBreakdown = {
    withSources: live.filter((i) => i.sourceCount > 0).length,
    withTrustedSources: live.filter((i) => (i.trustedSourceCount ?? 0) > 0).length,
    withMultipleSources: live.filter((i) => i.sourceCount >= 2).length,
  };

  return Response.json({
    total: live.length,
    byVerification: {
      confirmed: confirmed.length,
      pending: pending.length,
      contested: contested.length,
    },
    avgTrustScore,
    signalCounts,
    sourceBreakdown,
    timestamp: new Date().toISOString(),
  });
}
