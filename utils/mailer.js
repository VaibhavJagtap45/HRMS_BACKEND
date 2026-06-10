const nodemailer = require("nodemailer");

/**
 * Lazily-built, cached nodemailer transporter.
 *
 * Required env vars (set in .env / host dashboard):
 *   SMTP_HOST      — e.g. smtp.gmail.com
 *   SMTP_PORT      — e.g. 587
 *   SMTP_SECURE    — "true" for port 465, "false" for STARTTLS on 587
 *   SMTP_USER      — sender email address
 *   SMTP_PASS      — app password / SMTP password (Gmail: a 16-char App Password)
 *   EMAIL_FROM     — display name, e.g. "HRMS Albos"
 *
 * For Gmail: enable 2FA and use an App Password as SMTP_PASS.
 */
let cachedTransporter = null;

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Reuse connections across sends.
    pool: true,
    maxConnections: 3,
    // Fail fast instead of leaving a password-reset request hanging when the
    // SMTP host is unreachable (common on free-tier hosts with cold sockets).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return cachedTransporter;
}

/**
 * Verify SMTP connectivity & credentials. Call once at startup so a
 * misconfiguration surfaces in the logs immediately, instead of only when a
 * user actually tries to reset their password. Never throws.
 */
async function verifyTransport() {
  if (!isSmtpConfigured()) {
    console.warn(
      "[mailer] SMTP not configured (SMTP_USER / SMTP_PASS missing). " +
        "Reset emails will NOT be sent — the OTP is returned in the API response for dev only.",
    );
    return false;
  }

  try {
    await getTransporter().verify();
    console.log(
      `[mailer] SMTP ready — ${process.env.SMTP_HOST || "smtp.gmail.com"}:${
        process.env.SMTP_PORT || 587
      } as ${process.env.SMTP_USER}`,
    );
    return true;
  } catch (error) {
    console.error("[mailer] SMTP verification FAILED:", error.message);
    return false;
  }
}

/**
 * Send a password-reset email.
 * Returns true when email was sent, false when SMTP is not configured
 * (caller handles the fallback for dev/testing).
 */
async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (!isSmtpConfigured()) {
    return false;
  }

  const transporter = getTransporter();
  const fromName = process.env.EMAIL_FROM || "HRMS Albos";
  const fromAddress = process.env.SMTP_USER;

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
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

  console.log(`[mailer] Password-reset email sent to ${to} (messageId=${info.messageId})`);
  return true;
}

/**
 * Send a 6-digit OTP for password reset.
 * Returns true when sent, false when SMTP not configured.
 */
async function sendOtpEmail({ to, name, otp }) {
  if (!isSmtpConfigured()) return false;

  const transporter = getTransporter();
  const fromName = process.env.EMAIL_FROM || "HRMS Albos";
  const fromAddress = process.env.SMTP_USER;

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
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

  console.log(`[mailer] OTP email sent to ${to} (messageId=${info.messageId})`);
  return true;
}

module.exports = {
  sendPasswordResetEmail,
  sendOtpEmail,
  isSmtpConfigured,
  verifyTransport,
};
