import { upsertImportedIncidents } from "@/lib/incidents";
import { importAllEnabledSources } from "@/lib/import-sources";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

// Manual backfill endpoint — fetches all available items from every enabled
// source (up to 500 per source) instead of the normal 15-item limit.
//
// RSS feeds only carry the last ~20–50 articles regardless of this cap;
// true historical data older than a few days is not available via RSS.
//
// Trigger: GET /api/backfill?key=<CRON_SECRET>
// Or without a secret set: GET /api/backfill
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const url = new URL(request.url);
    const bearer = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    const key = url.searchParams.get("key");

    if (bearer !== secret && key !== secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await importAllEnabledSources(true);
  await upsertImportedIncidents(result.items);

  revalidatePath("/");
  revalidatePath("/api/incidents");
  revalidatePath("/api/incidents/live");
  revalidatePath("/api/map");
  revalidatePath("/api/verification");

  return Response.json({
    ok: true,
    mode: "backfill",
    imported: result.items.length,
    enabledSources: result.sourceCount,
    successSources: result.sourceCount - result.errors.length,
    failedSources: result.errors.length,
    errors: result.errors.map((e) => ({
      sourceId: e.sourceId,
      label: e.label,
      error: e.error,
    })),
    note: "RSS feeds nesou jen posledních ~20–50 článků. Starší záznamy nejsou přes RSS dostupné.",
    ranAt: new Date().toISOString(),
  });
}
