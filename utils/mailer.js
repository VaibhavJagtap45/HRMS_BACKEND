// ─────────────────────────────────────────────────────────────────────────────
// Resend HTTP API mailer.
//
// Replaces the previous SMTP (nodemailer) transport: Render's free tier blocks
// outbound SMTP ports (25/465/587), so Gmail sends time out. Resend delivers over
// HTTPS (port 443), which is never blocked.
//
// Required env vars (set in .env / Render dashboard):
//   RESEND_API_KEY     — API key from https://resend.com/api-keys  (starts with "re_")
//   EMAIL_FROM         — sender. Either a full "Name <addr@domain>" string, or just
//                        a display name (then RESEND_FROM_EMAIL supplies the address).
//   RESEND_FROM_EMAIL  — sender address used when EMAIL_FROM has no "@". Must belong
//                        to a domain verified in Resend (e.g. noreply@albostechnologies.com).
//                        Defaults to onboarding@resend.dev — Resend's shared TEST
//                        sender, which only delivers to the Resend account owner's
//                        email. Verify your domain for real delivery to anyone.
//
// Public interface is unchanged, so controllers/server.js need no edits:
//   sendPasswordResetEmail({ to, name, resetUrl }) -> true | false (false = not configured)
//   sendOtpEmail({ to, name, otp })                -> true | false
//   verifyTransport()                              -> boolean (never throws; logs at boot)
//   isMailerConfigured() / isSmtpConfigured()      -> boolean
// On a genuine send failure the send functions THROW, so callers return their 502.
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_DOMAINS_URL = "https://api.resend.com/domains";

function isMailerConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

// Build the "from" header. Accepts a full address ("HRMS <no-reply@x.com>" or
// "no-reply@x.com") as-is; otherwise treats EMAIL_FROM as a display name and
// pairs it with RESEND_FROM_EMAIL (or the Resend test sender).
function resolveFrom() {
  const raw = (process.env.EMAIL_FROM || "").trim();
  if (raw.includes("@")) return raw;

  const name = raw || "HRMS Albos";
  const address = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  return `${name} <${address}>`;
}

function assertFetch() {
  if (typeof fetch !== "function") {
    throw new Error(
      "global fetch is unavailable — Node 18+ is required for the Resend mailer.",
    );
  }
}

async function fetchWithTimeout(url, options, ms) {
  assertFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// POST one email through Resend. Resolves to the message id on success;
// throws with a descriptive message on any non-2xx response or network error.
async function sendViaResend({ to, subject, html, text }) {
  let res;
  try {
    res = await fetchWithTimeout(
      RESEND_API_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: resolveFrom(), to: [to], subject, html, text }),
      },
      15_000,
    );
  } catch (err) {
    throw new Error(`Resend request failed: ${err.message}`);
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason =
      payload?.message || payload?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Resend API error: ${reason}`);
  }

  return payload?.id || true;
}

/**
 * Confirm the mailer is usable. Call once at startup so a misconfiguration shows
 * up in the logs immediately instead of only when a user tries to reset. Never throws.
 */
async function verifyTransport() {
  if (!isMailerConfigured()) {
    console.warn(
      "[mailer] RESEND_API_KEY missing — reset/OTP emails will NOT be sent. " +
        "The OTP is returned in the API response for dev only.",
    );
    return false;
  }

  try {
    // Lightweight authenticated call validates the API key without sending mail.
    const res = await fetchWithTimeout(
      RESEND_DOMAINS_URL,
      { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } },
      10_000,
    );

    if (res.ok) {
      console.log(`[mailer] Resend ready — sending as ${resolveFrom()}`);
      return true;
    }
    if (res.status === 401) {
      console.error(
        "[mailer] Resend verification FAILED: invalid RESEND_API_KEY (401 Unauthorized).",
      );
      return false;
    }
    console.warn(
      `[mailer] Resend key check returned HTTP ${res.status} — continuing anyway.`,
    );
    return true;
  } catch (error) {
    console.error("[mailer] Resend verification error:", error.message);
    return false;
  }
}

/**
 * Send a password-reset email.
 * Returns true when sent, false when the mailer is not configured (caller
 * handles the dev/testing fallback). Throws on a real delivery failure.
 */
async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (!isMailerConfigured()) {
    return false;
  }

  const id = await sendViaResend({
    to,
    subject: "Reset Your HRMS Password",
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Password Reset</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1e3a5f;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">HRMS — Albos Technology</p>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.55);">Human Resource Management System</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Hi ${name},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                We received a request to reset the password for your HRMS account.
                Click the button below to set a new password. This link is valid for
                <strong style="color:#111827;">1 hour</strong>.
              </p>

              <div style="text-align:center;margin:32px 0;">
                <a href="${resetUrl}"
                   style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.2px;">
                  Reset My Password
                </a>
              </div>

              <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;word-break:break-all;font-size:12px;color:#2563eb;">
                <a href="${resetUrl}" style="color:#2563eb;">${resetUrl}</a>
              </p>

              <div style="border-top:1px solid #e5e7eb;padding-top:24px;margin-top:24px;">
                <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
                  If you did not request a password reset, please ignore this email.
                  Your password will remain unchanged. For security concerns, contact your HR administrator.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} Albos Technology · HRMS Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
    text: `Hi ${name},\n\nReset your HRMS password using the link below (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.\n\nAlbos Technology HRMS`,
  });

  console.log(`[mailer] Password-reset email sent to ${to} (id=${id})`);
  return true;
}

/**
 * Send a 6-digit OTP for password reset.
 * Returns true when sent, false when the mailer is not configured. Throws on failure.
 */
async function sendOtpEmail({ to, name, otp }) {
  if (!isMailerConfigured()) return false;

  const id = await sendViaResend({
    to,
    subject: "Your HRMS Password Reset OTP",
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Password Reset OTP</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1e3a5f;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">HRMS — Albos Technology</p>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.55);">Password Reset Verification</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;text-align:center;">
              <p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Hi ${name},</p>
              <p style="margin:0 0 32px;font-size:14px;color:#6b7280;line-height:1.6;">
                Use the OTP below to reset your password.<br/>This code is valid for <strong style="color:#111827;">10 minutes</strong>.
              </p>
              <div style="display:inline-block;background:#f0f4ff;border:2px dashed #4c6ef5;border-radius:16px;padding:20px 40px;margin:0 auto;">
                <p style="margin:0;font-size:42px;font-weight:800;letter-spacing:12px;color:#2563eb;font-family:monospace;">${otp}</p>
              </div>
              <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;">
                Never share this OTP with anyone.<br/>If you didn't request this, ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} Albos Technology · HRMS Platform</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim(),
    text: `Hi ${name},\n\nYour HRMS password reset OTP is: ${otp}\n\nValid for 10 minutes. Do not share this with anyone.\n\nAlbos Technology HRMS`,
  });

  console.log(`[mailer] OTP email sent to ${to} (id=${id})`);
  return true;
}

module.exports = {
  sendPasswordResetEmail,
  sendOtpEmail,
  isMailerConfigured,
  // Backwards-compatible alias for any caller still importing the old name.
  isSmtpConfigured: isMailerConfigured,
  verifyTransport,
};
