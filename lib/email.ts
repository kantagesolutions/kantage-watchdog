import nodemailer from "nodemailer";
import { getSetting } from "./settings";

async function getTransport() {
  const user = await getSetting("SMTP_USER");
  const pass = await getSetting("SMTP_PASS");
  if (!user || !pass) return null;
  const host = await getSetting("SMTP_HOST", "smtp.gmail.com");
  const port = parseInt(await getSetting("SMTP_PORT", "587"));
  return nodemailer.createTransport({
    host, port, secure: false,
    auth: { user, pass },
  });
}

export async function sendIncidentAlert(service: string, error: string, incidentId: string): Promise<void> {
  const transport = await getTransport();
  if (!transport) return;
  const [alertEmail, smtpUser, watchdogUrl] = await Promise.all([
    getSetting("ALERT_EMAIL"),
    getSetting("SMTP_USER"),
    getSetting("WATCHDOG_URL", "http://localhost:3001"),
  ]);
  const to = alertEmail || smtpUser;
  if (!to) return;
  await transport.sendMail({
    from: smtpUser,
    to,
    subject: `🚨 [Kantage Watchdog] ${service} is DOWN`,
    html: `
      <h2 style="color:#e53e3e">🚨 Service Down: ${service}</h2>
      <p><strong>Error:</strong> ${error}</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      <p><a href="${watchdogUrl}/chat?incident=${incidentId}" style="background:#276749;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">
        Open in Watchdog
      </a></p>
    `,
  });
}

export async function sendRecoveryAlert(service: string, durationSeconds: number): Promise<void> {
  const transport = await getTransport();
  if (!transport) return;
  const [alertEmail, smtpUser] = await Promise.all([
    getSetting("ALERT_EMAIL"),
    getSetting("SMTP_USER"),
  ]);
  const to = alertEmail || smtpUser;
  if (!to) return;
  const mins = Math.round(durationSeconds / 60);
  await transport.sendMail({
    from: smtpUser,
    to,
    subject: `✅ [Kantage Watchdog] ${service} recovered`,
    html: `
      <h2 style="color:#276749">✅ Service Recovered: ${service}</h2>
      <p>Back online after ${mins > 1 ? `${mins} minutes` : `${durationSeconds} seconds`}.</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    `,
  });
}

export async function sendTestEmail(): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = await getTransport();
    if (!transport) throw new Error("SMTP credentials not configured");
    const [alertEmail, smtpUser] = await Promise.all([
      getSetting("ALERT_EMAIL"),
      getSetting("SMTP_USER"),
    ]);
    const to = alertEmail || smtpUser;
    if (!to) throw new Error("ALERT_EMAIL not configured");
    await transport.sendMail({
      from: smtpUser,
      to,
      subject: "✅ Kantage Watchdog — Email test",
      html: `<p>Email alerts are working correctly.</p><p><em>Sent at ${new Date().toLocaleString()}</em></p>`,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}
