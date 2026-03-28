import { getSortedIncidents } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export async function GET() {
  const incidents = await getSortedIncidents();
  const live = incidents.filter((i) => !i.isTemplate);

  const markers = live
    .filter((i) => i.mapPoint)
    .map((i) => ({
      id: i.id,
      title: i.title,
      verification: i.verification,
      severity: i.severity,
      point: i.mapPoint!,
      weaponType: i.weaponType,
      targetType: i.targetType,
      casualties: i.casualties,
      injuries: i.injuries,
      publishedAt: i.publishedAt,
    }));

  const trajectories = live.flatMap((i) =>
    (i.trajectories ?? []).map((t) => ({
      ...t,
      incidentId: i.id,
      incidentTitle: i.title,
      incidentVerification: i.verification,
    })),
  );

  return Response.json({
    markers,
    trajectories,
    markerCount: markers.length,
    trajectoryCount: trajectories.length,
    timestamp: new Date().toISOString(),
  });
}
