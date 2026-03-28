/**
 * NOTAM (Notice to Airmen) layer
 *
 * Fetches airspace restriction NOTAMs from the FAA NOTAM API v1.
 * Requires free registration at https://api.faa.gov to get credentials.
 * Set FAA_NOTAM_CLIENT_ID and FAA_NOTAM_CLIENT_SECRET in .env.local.
 *
 * Without credentials the fetch returns [] gracefully (map shows no NOTAM zones).
 *
 * Q-line parsing: extracts lat/lng/radius from the ICAO Q-line
 * e.g. "Q) LLLL/QRTCA/IV/NBO/A/000/999/3145N03445E005"
 *       → lat 31.75°N, lng 34.75°E, radius 5 NM = 9260 m
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  formatNotamExpiry,
  type NotamCache,
  type NotamZone,
} from "@/lib/notam-shared";

const CACHE_PATH = path.join(process.cwd(), "data", "notam-cache.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Locations to query: Ben Gurion (IL), Tehran ACC FIR (IR), Tehran Mehrabad (IR),
// Amman FIR (Jordan/Lebanon), Baghdad FIR (Iraq)
const DESIGNATORS = "LLBG,OIIX,OIII,OJAC,ORBI";

// ── cache ──────────────────────────────────────────────────────────────────

export async function readNotamCache(): Promise<NotamCache | null> {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    return JSON.parse(raw) as NotamCache;
  } catch {
    return null;
  }
}

async function writeNotamCache(cache: NotamCache): Promise<void> {
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

/**
 * Returns cached NOTAMs if fresh (< 1 h), otherwise fetches from FAA and
 * writes a new cache file. Always returns a NotamCache — never throws.
 */
export async function fetchAndCacheNotams(): Promise<NotamCache> {
  const cached = await readNotamCache();
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
    return cached;
  }

  const zones = await fetchNotamsFromFaa();
  const cache: NotamCache = { fetchedAt: new Date().toISOString(), zones };
  await writeNotamCache(cache).catch((err) =>
    console.error("[notam] Failed to write cache:", err),
  );
  return cache;
}

// ── FAA fetch ──────────────────────────────────────────────────────────────

async function fetchNotamsFromFaa(): Promise<NotamZone[]> {
  const clientId = process.env.FAA_NOTAM_CLIENT_ID;
  const clientSecret = process.env.FAA_NOTAM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("[notam] FAA_NOTAM_CLIENT_ID/SECRET not set — skipping fetch");
    return [];
  }

  const url = new URL("https://external-api.faa.gov/notamapi/v1/notams");
  url.searchParams.set("locationDesignator", DESIGNATORS);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("pageSize", "500");

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[notam] FAA API ${res.status}: ${body.slice(0, 200)}`);
      return [];
    }

    const data = (await res.json()) as { items?: unknown[] };
    return parseNotamItems(data.items ?? []);
  } catch (err) {
    console.error("[notam] Fetch error:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ── parsing ────────────────────────────────────────────────────────────────

function parseNotamItems(items: unknown[]): NotamZone[] {
  const zones: NotamZone[] = [];
  for (const item of items) {
    try {
      const zone = parseNotamItem(item);
      if (zone) zones.push(zone);
    } catch {
      // skip malformed item
    }
  }
  return zones;
}

function parseNotamItem(item: unknown): NotamZone | null {
  // FAA NOTAM API v1 wraps each item as a GeoJSON Feature
  const props = (item as Record<string, unknown>).properties as
    | Record<string, unknown>
    | undefined;
  const coreData = props?.coreNOTAMData as Record<string, unknown> | undefined;
  const notam = coreData?.notam as Record<string, unknown> | undefined;

  // Some implementations return the notam object directly
  const n = notam ?? (item as Record<string, unknown>);
  if (!n) return null;

  const rawText = String(n.icaoMessage ?? n.message ?? "");
  if (!rawText) return null;

  // Extract and parse Q-line
  const qLine = extractQLine(rawText);
  if (!qLine) return null;

  // Q-line fields: FIR/QCODE/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/COORDS
  const fields = qLine.split("/");
  if (fields.length < 8) return null;

  const qCode = (fields[1] ?? "").toUpperCase();

  // Only show restricted / prohibited / danger airspace
  if (!isAirspaceRestriction(qCode)) return null;

  const coordStr = (fields[7] ?? "").trim();
  const coords = parseQLineCoords(coordStr);
  if (!coords) return null;

  const lowerFL = parseInt(fields[5] ?? "0") || 0;
  const upperFL = parseInt(fields[6] ?? "0") || 0;

  return {
    id: String(n.id ?? n.number ?? "NOTAM"),
    qCode,
    lat: coords.lat,
    lng: coords.lng,
    radiusM: coords.radiusM,
    lowerFL,
    upperFL,
    effectiveStart: String(n.effectiveStart ?? n.issued ?? ""),
    effectiveEnd: String(n.effectiveEnd ?? ""),
    location: String(n.location ?? n.accountId ?? ""),
    rawText: rawText.slice(0, 400),
  };
}

/**
 * Extract the Q-line content from a raw NOTAM text.
 * Handles both multi-line and single-line (condensed) NOTAM formats.
 */
function extractQLine(text: string): string | null {
  const m = text.match(/Q\)\s*([^\n\r]+)/);
  return m ? m[1].trim() : null;
}

/**
 * Airspace Q-codes to show on the map.
 * QR* = Restricted/Prohibited/Danger area activity
 * QF* A = Aerodrome services restricted/closed (only aerodrome-related ops)
 */
function isAirspaceRestriction(qCode: string): boolean {
  // QR-prefixed codes cover the main classes:
  // QRTCA (TCA), QRDCA (Danger area), QRPCA (Prohibited), QRLGA (Restricted lower)
  return qCode.startsWith("QR");
}

/**
 * Parse the coordinate+radius portion of a NOTAM Q-line.
 * Format: DDMM[NS]DDDMM[EW]RRR
 * Example: 3145N03445E005 → 31°45'N 034°45'E radius 5 NM
 */
function parseQLineCoords(
  coords: string,
): { lat: number; lng: number; radiusM: number } | null {
  const m = coords.match(/^(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])(\d{3})/);
  if (!m) return null;

  const latDeg = parseInt(m[1]) + parseInt(m[2]) / 60;
  const lat = m[3] === "N" ? latDeg : -latDeg;
  const lngDeg = parseInt(m[4]) + parseInt(m[5]) / 60;
  const lng = m[6] === "E" ? lngDeg : -lngDeg;
  const radiusNM = parseInt(m[7]);
  // Minimum 5 km so very small NOTAMs are still visible on the map
  const radiusM = Math.max(radiusNM * 1852, 5_000);

  return { lat, lng, radiusM };
}

// ── formatting ─────────────────────────────────────────────────────────────

export { formatNotamExpiry };
