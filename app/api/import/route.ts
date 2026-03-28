import { upsertImportedIncidents } from "@/lib/incidents";
import { importFromSourceId, readImportSources } from "@/lib/import-sources";
import { notifyNewIncidents } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  const sources = await readImportSources();

  return Response.json({
    sources,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { sourceId?: string };

  if (!body.sourceId) {
    return Response.json({ error: "sourceId je povinne." }, { status: 400 });
  }

  const imported = await importFromSourceId(body.sourceId);
  const { newIncidents } = await upsertImportedIncidents(imported);
  notifyNewIncidents(newIncidents).catch((err) =>
    console.error("[api/import] Telegram notify failed:", err),
  );

  return Response.json({
    imported: imported.length,
    items: imported,
  });
}
