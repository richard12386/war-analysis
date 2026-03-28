import { upsertImportedIncidents } from "@/lib/incidents";
import { importAllEnabledSources } from "@/lib/import-sources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const url = new URL(request.url);
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const key = url.searchParams.get("key");

    if (bearer !== secret && key !== secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await importAllEnabledSources();
  await upsertImportedIncidents(result.items);

  return Response.json({
    ok: true,
    imported: result.items.length,
    enabledSources: result.sourceCount,
    successSources: result.sourceCount - result.errors.length,
    failedSources: result.errors.length,
    errors: result.errors.map((e) => ({ sourceId: e.sourceId, label: e.label, error: e.error })),
    ranAt: new Date().toISOString(),
    recommendedSchedule: "Kazdych 5 minut pres cron nebo scheduler.",
  });
}
