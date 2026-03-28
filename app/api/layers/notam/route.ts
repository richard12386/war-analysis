import { fetchAndCacheNotams } from "@/lib/notam";

export const dynamic = "force-dynamic";

/**
 * GET /api/layers/notam
 *
 * Returns cached NOTAMs (refreshes after 1 hour).
 * Response: { fetchedAt: string; zones: NotamZone[] }
 */
export async function GET() {
  const cache = await fetchAndCacheNotams();
  return Response.json(cache);
}
