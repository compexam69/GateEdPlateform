import { Resend } from "resend";

const RESEND_API_KEY = process.env["RESEND_API_KEY"];
const FROM_ADDRESS = process.env["RESEND_FROM"] ?? "EdTech Platform <noreply@yourdomain.com>";
const APP_URL = process.env["APP_URL"] ?? "https://yourdomain.com";

// ── Startup configuration log ─────────────────────────────────────────────────
// Runs once when the module is first imported (server boot).
// Lets developers see the exact email capability state in the server logs
// without having to inspect secrets manually.
(function logEmailConfig() {
  const hasKey = !!RESEND_API_KEY;
  const hasFrom = !!process.env["RESEND_FROM"];
  const hasAppUrl = !!process.env["APP_URL"];
  const fromIsPlaceholder = FROM_ADDRESS.includes("yourdomain.com");
  const urlIsPlaceholder = APP_URL.includes("yourdomain.com");

  if (!hasKey) {
    console.warn(
      "[email] RESEND_API_KEY not set — welcome/approval/storage-alert emails are DISABLED. " +
      "Supabase handles verification and password-reset emails independently."
    );
    return;
  }

  const warnings: string[] = [];
  if (!hasFrom || fromIsPlaceholder) {
    warnings.push(
      "RESEND_FROM not set or uses placeholder 'yourdomain.com' — " +
      "Resend will reject outbound emails until a verified sender domain is configured. " +
      "Set RESEND_FROM to e.g. 'EdTech <noreply@yourdomain.com>' with a domain verified in resend.com/domains."
    );
  }
  if (!hasAppUrl || urlIsPlaceholder) {
    warnings.push(
      "APP_URL not set — email buttons link to placeholder 'yourdomain.com'. " +
      "Set APP_URL to your Replit dev URL (e.g. https://xxxx.replit.dev) or production domain."
    );
  }

  if (warnings.length === 0) {
    console.info("[email] Resend configured — welcome/approval/storage-alert emails ACTIVE");
  } else {
    console.warn("[email] Resend API key present but partially misconfigured:");
    warnings.forEach(w => console.warn(`  • ${w}`));
  }
})();

let resend: Resend | null = null;

function getClient(): Resend | null {
  if (!RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(RESEND_API_KEY);
  return resend;
}

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
  body { margin: 0; padding: 0; background-color: #0F172A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .wrapper { max-width: 560px; margin: 40px auto; background: #1E293B; border-radius: 16px; overflow: hidden; border: 1px solid #334155; }
  .header { background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%); padding: 32px 40px; text-align: center; }
  .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
  .header p { margin: 6px 0 0; color: rgba(255,255,255,0.8); font-size: 13px; }
  .body { padding: 32px 40px; color: #F8FAFC; }
  .body p { margin: 0 0 16px; color: #94A3B8; font-size: 15px; line-height: 1.6; }
  .body p.lead { color: #F8FAFC; font-size: 16px; }
  .btn { display: inline-block; margin: 8px 0 24px; padding: 14px 32px; background: #6366F1; color: #ffffff !important; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; }
  .btn:hover { background: #4F46E5; }
  .divider { border: none; border-top: 1px solid #334155; margin: 24px 0; }
  .footer { padding: 20px 40px; background: #0F172A; text-align: center; }
  .footer p { margin: 0; color: #475569; font-size: 12px; line-height: 1.5; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>EdTech Study Platform</h1>
    <p>Smart Mastery-Based Learning</p>
  </div>
  <div class="body">
    ${body}
  </div>
  <div class="footer">
    <p>EdTech Study Platform · Helping students ace JEE, NEET &amp; GATE<br/>
    You received this because your email is registered with us. Do not share this email.</p>
  </div>
</div>
</body>
</html>`;
}

/**
 * Sent automatically right after account creation.
 * Tells the user their account exists and is pending admin approval,
 * and reminds them to verify their email first.
 */
export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set — welcome email skipped");
    return;
  }
  const body = `
    <p class="lead">Welcome, ${name}!</p>
    <p>Your account has been created successfully. There are two quick steps before you can start learning:</p>
    <p><strong>Step 1:</strong> Verify your email — check your inbox for a separate verification email and click the link inside.</p>
    <p><strong>Step 2:</strong> Wait for admin approval — once your email is verified, an admin will review and approve your account. This usually takes less than 24 hours.</p>
    <p>Once approved, you will receive a confirmation email and can sign in at:</p>
    <a class="btn" href="${APP_URL}/login">Sign In to EdTech</a>
    <hr class="divider" />
    <p>If you did not create this account, you can safely ignore this email.</p>
  `;
  await client.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: "Welcome to EdTech Study Platform — Account Created",
    html: baseTemplate("Welcome to EdTech", body),
  });
}

/**
 * Sent when an admin approves a student's account.
 */
export async function sendApprovalEmail(to: string, name: string): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set — approval email skipped");
    return;
  }
  const body = `
    <p class="lead">Great news, ${name}! Your account has been approved.</p>
    <p>You now have full access to the EdTech Study Platform. Start your mastery journey with structured, gated learning for JEE, NEET, and GATE.</p>
    <a class="btn" href="${APP_URL}/login">Start Learning Now</a>
    <hr class="divider" />
    <p>What you can do now:</p>
    <p>• Follow your personalized mastery learning path<br/>
       • Take quizzes, DPPs, and topic tests<br/>
       • Track your performance over time<br/>
       • Use the Pomodoro focus timer</p>
  `;
  await client.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: "Your EdTech Account Has Been Approved",
    html: baseTemplate("Account Approved", body),
  });
}

/**
 * Sent to all admins when B2 storage exceeds the configured threshold.
 */
export async function sendStorageAlertEmail(to: string, usedGb: number, limitGb: number): Promise<void> {
  const client = getClient();
  if (!client) return;
  const pct = Math.round((usedGb / limitGb) * 100);
  const body = `
    <p class="lead">Storage Alert: ${pct}% used (${usedGb.toFixed(2)} GB / ${limitGb} GB)</p>
    <p>The platform's Backblaze B2 storage is running low. Immediate action may be required to prevent upload failures for students.</p>
    <a class="btn" href="${APP_URL}/admin">Open Admin Panel</a>
  `;
  await client.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `EdTech Storage Alert — ${pct}% Used`,
    html: baseTemplate("Storage Alert", body),
  });
}
