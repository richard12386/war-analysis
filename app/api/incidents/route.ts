import { getDashboardStats, getIncidentDataset, getSortedIncidents } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export async function GET() {
  const dataset = await getIncidentDataset();
  const incidents = await getSortedIncidents();
  const stats = await getDashboardStats();

  return Response.json({
    meta: dataset.meta,
    watchlist: dataset.watchlist,
    stats,
    incidents,
  });
}
