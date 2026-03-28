/**
 * Telegram notification module
 *
 * Sends formatted alerts to a configured Telegram chat.
 * Controlled by TELEGRAM_ENABLED, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID in .env.local
 *
 * Behaviour by event type:
 *   STRIKE / ALERT  → immediate, one message per incident
 *   SHIP            → immediate, but deduplicated per vessel name (1 per hour)
 *   NEWS            → accumulated, sent as a digest every 6 hours
 *
 * Global rate limit: at most 1 Telegram message per 10 seconds (avoids 429 errors).
 * State is module-level — persists across requests in the same Node.js process.
 */

import type { Incident } from "@/lib/incidents";
import { deriveType } from "@/lib/incident-type";

// ── config ─────────────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return (
    process.env.TELEGRAM_ENABLED === "true" &&
    !!process.env.TELEGRAM_BOT_TOKEN &&
    !!process.env.TELEGRAM_CHAT_ID
  );
}

function siteUrl(): string {
  return (process.env.SITE_URL ?? "").replace(/\/$/, "");
}

// ── rate limiting ──────────────────────────────────────────────────────────

const RATE_LIMIT_MS = 10_000; // 10 seconds between outgoing messages
let lastSentMs = 0;

// ── ship deduplication ─────────────────────────────────────────────────────

const SHIP_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour per vessel
const shipLastNotified = new Map<string, number>();

// ── news digest ────────────────────────────────────────────────────────────

const NEWS_DIGEST_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const pendingNews: Incident[] = [];
let lastNewsDigestMs = 0;

// ── core send ──────────────────────────────────────────────────────────────

/**
 * sendAlert — send a raw HTML-formatted message to the configured chat.
 * Exported for direct use (manual alerts, testing).
 * Respects the 10-second rate limit by sleeping if needed.
 */
export async function sendAlert(text: string): Promise<void> {
  if (!isEnabled()) return;

  const wait = lastSentMs + RATE_LIMIT_MS - Date.now();
  if (wait > 0) await sleep(wait);

  lastSentMs = Date.now();

  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[Telegram] Send failed ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    console.error("[Telegram] Network error:", err instanceof Error ? err.message : err);
  }
}

// ── dispatcher ─────────────────────────────────────────────────────────────

/**
 * notifyNewIncidents — classify each new incident and dispatch accordingly.
 * Call this after every live import (not backfill).
 */
export async function notifyNewIncidents(incidents: Incident[]): Promise<void> {
  if (!isEnabled() || incidents.length === 0) return;

  const now = Date.now();

  for (const incident of incidents) {
    if (incident.isTemplate) continue;

    const type = deriveType(incident);

    if (type === "strike" || type === "alert") {
      await sendAlert(formatImmediate(incident, type));
    } else if (type === "ship") {
      const key = vesselKey(incident);
      const last = shipLastNotified.get(key) ?? 0;
      if (now - last >= SHIP_COOLDOWN_MS) {
        shipLastNotified.set(key, now);
        await sendAlert(formatShip(incident));
      }
    } else {
      // news — queue for digest
      pendingNews.push(incident);
    }
  }

  // Flush news digest if the interval has elapsed
  if (pendingNews.length > 0 && now - lastNewsDigestMs >= NEWS_DIGEST_INTERVAL_MS) {
    const batch = pendingNews.splice(0); // drain in place
    lastNewsDigestMs = now;
    await sendAlert(formatDigest(batch));
  }
}

// ── formatters ─────────────────────────────────────────────────────────────

const SEVERITY_ICON: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "⚪",
};

const VERIFICATION_LABEL: Record<string, string> = {
  confirmed: "✅ Potvrzeno",
  pending: "⏳ Čeká na ověření",
  contested: "❓ Sporné",
  template: "📋 Šablona",
};

function formatImmediate(incident: Incident, type: "strike" | "alert"): string {
  const emoji = type === "strike" ? "💥" : "🚨";
  const sev = SEVERITY_ICON[incident.severity] ?? "⚪";
  const ver = VERIFICATION_LABEL[incident.verification] ?? incident.verification;

  const lines: string[] = [
    `${emoji} <b>${type.toUpperCase()}</b> — ${sev} ${incident.severity.toUpperCase()}`,
    `📍 <b>${incident.location}</b>`,
    ver,
    "",
    incident.summary.slice(0, 280),
  ];

  if (incident.weaponType) lines.push(`\n🎯 Zbraň: ${incident.weaponType}`);
  if (incident.casualties != null) lines.push(`💀 Oběti: ${incident.casualties}`);
  if (incident.injuries != null) lines.push(`🏥 Zranění: ${incident.injuries}`);

  const base = siteUrl();
  if (base) lines.push(`\n🔗 ${base}/incidents/${incident.id}`);

  return lines.join("\n");
}

function formatShip(incident: Incident): string {
  const lines: string[] = [
    `🚢 <b>VESSEL ALERT</b> — Plavidlo v oblasti`,
    `📍 ${incident.location || "Perský záliv / Rudé moře"}`,
    "",
    `<b>${incident.title}</b>`,
    incident.summary.slice(0, 200),
  ];

  if (incident.mapPoint) {
    const { lat, lng } = incident.mapPoint;
    lines.push(`\n🗺 ${lat.toFixed(3)}°N  ${lng.toFixed(3)}°E`);
  }

  const base = siteUrl();
  if (base) lines.push(`\n🔗 ${base}/incidents/${incident.id}`);

  return lines.join("\n");
}

function formatDigest(items: Incident[]): string {
  const top = items.slice(0, 8);
  const rest = items.length - top.length;

  const lines: string[] = [
    `📰 <b>NEWS DIGEST</b> — ${items.length} nových zpráv (6h)`,
    "",
    ...top.map((i) => `• ${i.title}${i.location ? ` (${i.location})` : ""}`),
  ];

  if (rest > 0) lines.push(`<i>(+${rest} dalších)</i>`);

  const base = siteUrl();
  if (base) lines.push(`\n🔗 ${base}/timeline`);

  return lines.join("\n");
}

// Stable vessel identity key — strips speed suffix so "Vessel X – 12.3 kn" and
// "Vessel X – 8.1 kn" resolve to the same key for dedup purposes.
function vesselKey(incident: Incident): string {
  return incident.title.replace(/\s*[–\-]\s*[\d.]+\s*kn\s*$/i, "").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
