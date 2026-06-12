// ─────────────────────────────────────────────────────────────────────────────
// Keep-alive self-ping — keeps the Render free-tier instance warm.
//
// Render spins the service down after ~15 min with no INBOUND traffic; the next
// request then waits 30-50s while it wakes (the "login spins then fails" symptom).
// This periodically requests our own public /api/health, which routes back in
// through Render's edge and counts as inbound activity, so the idle timer never
// elapses and the service stays awake.
//
// Limitation: while an instance is already asleep its timers are suspended, so a
// self-ping can keep it awake but can't WAKE it from a cold sleep. For full
// coverage pair this with an external cron (see .github/workflows/keep-alive.yml)
// and the login page's warmUpBackend() ping.
//
// Env (all optional):
//   KEEPALIVE_ENABLED  "true"/"false"  — default: on only when NODE_ENV=production
//   KEEPALIVE_URL      full URL to ping — default: `${RENDER_EXTERNAL_URL}/api/health`
//                      (RENDER_EXTERNAL_URL is injected automatically by Render)
//   KEEPALIVE_MINUTES  interval in minutes — default 10, clamped to 1..14
// ─────────────────────────────────────────────────────────────────────────────

let timer = null;

function isEnabled() {
  const flag = String(process.env.KEEPALIVE_ENABLED || "").toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "production"; // sensible default
}

function resolveUrl() {
  if (process.env.KEEPALIVE_URL) {
    return process.env.KEEPALIVE_URL.trim();
  }
  const base = String(process.env.RENDER_EXTERNAL_URL || "")
    .trim()
    .replace(/\/$/, "");
  return base ? `${base}/api/health` : null;
}

function resolveIntervalMs() {
  const mins = Number(process.env.KEEPALIVE_MINUTES) || 10;
  const clamped = Math.min(Math.max(mins, 1), 14); // must stay under Render's ~15-min idle
  return clamped * 60 * 1000;
}

async function ping(url) {
  try {
    if (typeof fetch !== "function") return; // Node 18+ required
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    console.log(`[keepalive] pinged ${url} -> ${res.status}`);
  } catch (err) {
    console.warn(`[keepalive] ping failed: ${err.message}`);
  }
}

/** Start the periodic self-ping. Idempotent and never throws. */
function startKeepAlive() {
  if (timer) return;

  if (!isEnabled()) {
    console.log("[keepalive] disabled (set KEEPALIVE_ENABLED=true to force on).");
    return;
  }

  const url = resolveUrl();
  if (!url) {
    console.warn(
      "[keepalive] no KEEPALIVE_URL and no RENDER_EXTERNAL_URL — self-ping skipped.",
    );
    return;
  }

  const intervalMs = resolveIntervalMs();
  timer = setInterval(() => ping(url), intervalMs);
  if (typeof timer.unref === "function") timer.unref(); // never block shutdown

  console.log(
    `[keepalive] enabled — pinging ${url} every ${intervalMs / 60000} min`,
  );
}

function stopKeepAlive() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startKeepAlive, stopKeepAlive };
