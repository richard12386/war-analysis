import { upsertImportedIncidents } from "@/lib/incidents";
import { importAllEnabledSources } from "@/lib/import-sources";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

// POST /api/admin/backfill-rss?from=2026-02-28
//
// Fetches all enabled RSS (and other HTTP-based) sources using the high-cap
// backfill limit (500 items per source), then optionally discards items older
// than the `from` query parameter.
//
// Note: RSS feeds only expose their most recent ~20–50 articles regardless of
// the item limit — true historical data is not available via RSS. The `from`
// filter applies to whatever the feed currently carries.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const key = url.searchParams.get("key");
    if (bearer !== secret && key !== secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const fromDate = fromParam ? new Date(fromParam) : null;
  const fromIso = fromDate && !isNaN(fromDate.getTime()) ? fromDate.toISOString() : null;

  const result = await importAllEnabledSources(true);

  const filtered = fromIso
    ? result.items.filter((item) => item.publishedAt >= fromIso)
    : result.items;

  await upsertImportedIncidents(filtered);
  revalidatePath("/");

  return Response.json({
    ok: true,
    mode: "backfill-rss",
    from: fromIso ?? "no filter",
    totalFetched: result.items.length,
    afterDateFilter: filtered.length,
    enabledSources: result.sourceCount,
    successSources: result.sourceCount - result.errors.length,
    failedSources: result.errors.length,
    errors: result.errors.map((e) => ({ sourceId: e.sourceId, label: e.label, error: e.error })),
    note: "RSS feeds expose only their most recent ~20–50 articles. Items before that window are not available via RSS.",
    ranAt: new Date().toISOString(),
  });
}
