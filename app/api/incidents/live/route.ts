import { getSortedIncidents } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
  const verification = url.searchParams.get("verification");

  const incidents = await getSortedIncidents();
  let live = incidents.filter((i) => !i.isTemplate);

  if (verification === "confirmed") {
    live = live.filter((i) => i.verification === "confirmed");
  } else if (verification === "pending") {
    live = live.filter((i) => i.verification === "pending");
  } else if (verification === "contested") {
    live = live.filter((i) => i.verification === "contested");
  }

  const paginated = live.slice(0, limit);

  return Response.json({
    incidents: paginated,
    count: paginated.length,
    total: live.length,
    confirmed: live.filter((i) => i.verification === "confirmed").length,
    pending: live.filter((i) => i.verification === "pending").length,
    contested: live.filter((i) => i.verification === "contested").length,
    timestamp: new Date().toISOString(),
  });
}
