/**
 * Notification provider configuration.
 *
 * The app boots with zero configuration: `NOTIFY_MODE=simulator` renders every
 * message exactly as it would be delivered and stores it in the outbox, so the
 * alerting pipeline is fully demonstrable offline. Set `NOTIFY_MODE=live` plus
 * provider credentials to deliver for real.
 */

export type NotifyMode = "simulator" | "live";

export interface NotifyConfig {
  mode: NotifyMode;
  fromName: string;
  senderId: string;
  baseUrl: string;
  hubtel: { clientId: string; clientSecret: string; sender: string; enabled: boolean };
  arkesel: { apiKey: string; senderId: string; enabled: boolean };
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string; from: string; enabled: boolean };
  whatsapp: { token: string; phoneNumberId: string; graphVersion: string; enabled: boolean };
  vapid: { publicKey: string; privateKey: string; subject: string; enabled: boolean };
}

function env(key: string): string {
  return (process.env[key] ?? "").trim();
}

export function notifyConfig(): NotifyConfig {
  const mode = (env("NOTIFY_MODE").toLowerCase() === "live" ? "live" : "simulator") as NotifyMode;
  const hubtelId = env("HUBTEL_CLIENT_ID");
  const hubtelSecret = env("HUBTEL_CLIENT_SECRET");
  const arkeselKey = env("ARKESEL_API_KEY");
  const smtpHost = env("SMTP_HOST");
  const waToken = env("WHATSAPP_TOKEN");
  const waNumber = env("WHATSAPP_PHONE_NUMBER_ID");
  const vapidPublic = env("VAPID_PUBLIC_KEY");
  const vapidPrivate = env("VAPID_PRIVATE_KEY");

  return {
    mode,
    fromName: env("NOTIFY_FROM_NAME") || "GhanaBed",
    senderId: (env("NOTIFY_SENDER_ID") || "GHANABED").slice(0, 11),
    baseUrl: env("APP_BASE_URL") || "http://localhost:3000",
    hubtel: {
      clientId: hubtelId,
      clientSecret: hubtelSecret,
      sender: env("HUBTEL_SENDER") || env("NOTIFY_SENDER_ID") || "GhanaBed",
      enabled: Boolean(hubtelId && hubtelSecret),
    },
    arkesel: {
      apiKey: arkeselKey,
      senderId: env("ARKESEL_SENDER_ID") || "GhanaBed",
      enabled: Boolean(arkeselKey),
    },
    smtp: {
      host: smtpHost,
      port: Number(env("SMTP_PORT") || 587),
      secure: env("SMTP_SECURE").toLowerCase() === "true",
      user: env("SMTP_USER"),
      pass: env("SMTP_PASSWORD"),
      from: env("SMTP_FROM") || "GhanaBed <no-reply@ghanabed.health>",
      enabled: Boolean(smtpHost),
    },
    whatsapp: {
      token: waToken,
      phoneNumberId: waNumber,
      graphVersion: env("WHATSAPP_GRAPH_VERSION") || "v19.0",
      enabled: Boolean(waToken && waNumber),
    },
    vapid: {
      publicKey: vapidPublic,
      privateKey: vapidPrivate,
      subject: env("VAPID_SUBJECT") || "mailto:ops@ghanabed.health",
      enabled: Boolean(vapidPublic && vapidPrivate),
    },
  };
}

export function isLive(): boolean {
  return notifyConfig().mode === "live";
}

/** One-line summary of what is wired up, shown in the staff portal footer. */
export function providerStatus(): { channel: string; provider: string; ready: boolean; detail: string }[] {
  const c = notifyConfig();
  return [
    {
      channel: "SMS",
      provider: c.hubtel.enabled ? "Hubtel" : c.arkesel.enabled ? "Arkesel" : "Hubtel → Arkesel (no keys)",
      ready: c.hubtel.enabled || c.arkesel.enabled,
      detail: c.hubtel.enabled
        ? "Hubtel credentials configured; Arkesel used as fallback"
        : c.arkesel.enabled
          ? "Arkesel API key configured"
          : "No SMS credentials — messages are simulated",
    },
    {
      channel: "E-mail",
      provider: c.smtp.enabled ? `SMTP ${c.smtp.host}` : "SMTP (not configured)",
      ready: c.smtp.enabled,
      detail: c.smtp.enabled ? `Delivering via ${c.smtp.host}:${c.smtp.port}` : "No SMTP host — messages are simulated",
    },
    {
      channel: "WhatsApp",
      provider: c.whatsapp.enabled ? "Meta Cloud API" : "Meta Cloud API (no token)",
      ready: c.whatsapp.enabled,
      detail: c.whatsapp.enabled
        ? `Phone number id ${c.whatsapp.phoneNumberId.slice(0, 6)}…`
        : "No WhatsApp token — messages are simulated",
    },
    {
      channel: "Browser push",
      provider: c.vapid.enabled ? "Web Push (VAPID)" : "Web Push (no keys)",
      ready: c.vapid.enabled,
      detail: c.vapid.enabled ? "VAPID keys configured" : "Generate keys with `npx web-push generate-vapid-keys`",
    },
    {
      channel: "In-app",
      provider: "GhanaBed stream",
      ready: true,
      detail: "Always available — delivered over the live SSE stream",
    },
  ];
}
