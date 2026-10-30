/**
 * Channel adapters.
 *
 * Every adapter implements the same contract and always returns a structured
 * result — in simulator mode the result carries the exact provider request that
 * *would* have been sent, so the staff outbox shows real payloads without any
 * outbound network access.
 */
import { notifyConfig } from "./config";
import type { ChannelId, Severity } from "../types";

export interface SendInput {
  recipient: string;
  title: string;
  body: string;
  sms: string;
  subject: string;
  html: string;
  whatsapp: string;
  severity: Severity;
  eventType: string;
  pushSubscription?: unknown;
  subscriptionId?: number | null;
}

export interface SendResult {
  status: "simulated" | "sent" | "failed";
  provider: string;
  error?: string | null;
  meta?: Record<string, unknown>;
}

export interface ChannelAdapter {
  id: ChannelId;
  label: string;
  send(input: SendInput): Promise<SendResult>;
}

function redact(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = /authorization|x-api-key/i.test(k) ? `${v.slice(0, 14)}…[redacted]` : v;
  }
  return out;
}

function simulated(provider: string, request: Record<string, unknown>): SendResult {
  return { status: "simulated", provider, meta: { mode: "simulator", request } };
}

/* ── In-app ─────────────────────────────────────────────────────────────── */

export const inAppChannel: ChannelAdapter = {
  id: "inapp",
  label: "In-app",
  async send(input) {
    // The alert feed is driven by the SSE stream, so nothing outbound happens
    // here — we only confirm the message was published to connected clients.
    return {
      status: "simulated",
      provider: "ghanabed-stream",
      meta: { mode: "in-app", deliveredTo: "connected browser sessions", severity: input.severity },
    };
  },
};

/* ── Browser push (Web Push / VAPID) ────────────────────────────────────── */

export const browserChannel: ChannelAdapter = {
  id: "browser",
  label: "Browser push",
  async send(input) {
    const cfg = notifyConfig();
    const payload = JSON.stringify({
      title: input.title,
      body: input.body,
      severity: input.severity,
      event: input.eventType,
      icon: "/icon.svg",
      url: "/",
    });

    if (!cfg.vapid.enabled || !input.pushSubscription) {
      return simulated("web-push (VAPID not configured)", {
        endpoint: typeof input.recipient === "string" ? input.recipient : "(browser session)",
        method: "POST <push-endpoint>",
        payload,
        note: "Set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY and store a PushSubscription to deliver for real.",
      });
    }

    try {
      const webpush = (await import("web-push")).default;
      webpush.setVapidDetails(cfg.vapid.subject, cfg.vapid.publicKey, cfg.vapid.privateKey);
      await webpush.sendNotification(JSON.parse(String(input.pushSubscription)) as never, payload);
      return { status: "sent", provider: "web-push (VAPID)", meta: { endpoint: "browser push service" } };
    } catch (err) {
      return {
        status: "failed",
        provider: "web-push (VAPID)",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

/* ── SMS: Hubtel primary, Arkesel fallback ──────────────────────────────── */

export const smsChannel: ChannelAdapter = {
  id: "sms",
  label: "SMS",
  async send(input) {
    const cfg = notifyConfig();
    const to = input.recipient;

    if (cfg.hubtel.enabled) {
      const res = await sendHubtel(cfg, to, input.sms);
      if (res.status !== "failed") return res;
      if (cfg.arkesel.enabled) {
        const fallback = await sendArkesel(cfg, to, input.sms);
        return { ...fallback, meta: { ...(fallback.meta ?? {}), hubtelError: res.error } };
      }
      return res;
    }
    if (cfg.arkesel.enabled) return sendArkesel(cfg, to, input.sms);

    return simulated("hubtel → arkesel (no credentials)", {
      primary: {
        method: "POST",
        url: "https://api.hubtel.com/v2/messages/send",
        headers: redact({
          Authorization: `Basic base64(${cfg.hubtel.clientId || "<CLIENT_ID>"}:${cfg.hubtel.clientSecret || "<CLIENT_SECRET>"})`,
          "Content-Type": "application/json",
        }),
        body: { From: cfg.hubtel.sender, To: to, Content: input.sms, Registered: true },
      },
      fallback: {
        method: "POST",
        url: "https://sms.arkesel.com/api/sms/send",
        query: { action: "send-sms", api_key: "<ARKESEL_API_KEY>", to, from: cfg.arkesel.senderId, message: input.sms },
      },
      characters: input.sms.length,
      segments: Math.ceil(input.sms.length / 160),
    });
  },
};

async function sendHubtel(cfg: ReturnType<typeof notifyConfig>, to: string, message: string): Promise<SendResult> {
  const url = "https://api.hubtel.com/v2/messages/send";
  const body = { From: cfg.hubtel.sender, To: to, Content: message, Registered: true };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.hubtel.clientId}:${cfg.hubtel.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`Hubtel HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    return { status: "sent", provider: "hubtel", meta: { response: json, to } };
  } catch (err) {
    return { status: "failed", provider: "hubtel", error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendArkesel(cfg: ReturnType<typeof notifyConfig>, to: string, message: string): Promise<SendResult> {
  const url = new URL("https://sms.arkesel.com/api/sms/send");
  url.searchParams.set("action", "send-sms");
  url.searchParams.set("api_key", cfg.arkesel.apiKey);
  url.searchParams.set("to", to.replace("+", ""));
  url.searchParams.set("from", cfg.arkesel.senderId);
  url.searchParams.set("message", message);
  try {
    const res = await fetch(url, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || String(json.response_code ?? "").toLowerCase() === "error") {
      throw new Error(`Arkesel: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return { status: "sent", provider: "arkesel", meta: { response: json, to } };
  } catch (err) {
    return { status: "failed", provider: "arkesel", error: err instanceof Error ? err.message : String(err) };
  }
}

/* ── E-mail (SMTP) ──────────────────────────────────────────────────────── */

export const emailChannel: ChannelAdapter = {
  id: "email",
  label: "E-mail",
  async send(input) {
    const cfg = notifyConfig();
    if (!cfg.smtp.enabled) {
      return simulated("smtp (not configured)", {
        from: cfg.smtp.from,
        to: input.recipient,
        subject: input.subject,
        text: input.body,
        htmlBytes: input.html.length,
      });
    }
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transport = nodemailer.createTransport({
        host: cfg.smtp.host,
        port: cfg.smtp.port,
        secure: cfg.smtp.secure,
        auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
      });
      const info = await transport.sendMail({
        from: cfg.smtp.from,
        to: input.recipient,
        subject: input.subject,
        text: input.body,
        html: input.html,
      });
      return { status: "sent", provider: `smtp:${cfg.smtp.host}`, meta: { messageId: info.messageId } };
    } catch (err) {
      return { status: "failed", provider: `smtp:${cfg.smtp.host}`, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

/* ── WhatsApp (Meta Cloud API) ──────────────────────────────────────────── */

export const whatsappChannel: ChannelAdapter = {
  id: "whatsapp",
  label: "WhatsApp",
  async send(input) {
    const cfg = notifyConfig();
    const to = input.recipient.replace(/[^\d]/g, "");

    if (!cfg.whatsapp.enabled) {
      return simulated("meta-cloud-api (no token)", {
        method: "POST",
        url: `https://graph.facebook.com/${cfg.whatsapp.graphVersion}/${cfg.whatsapp.phoneNumberId || "<PHONE_NUMBER_ID>"}/messages`,
        headers: redact({ Authorization: `Bearer ${cfg.whatsapp.token || "<WHATSAPP_TOKEN>"}`, "Content-Type": "application/json" }),
        body: { messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body: input.whatsapp } },
      });
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/${cfg.whatsapp.graphVersion}/${cfg.whatsapp.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.whatsapp.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { preview_url: false, body: input.whatsapp },
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(`WhatsApp HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
      return { status: "sent", provider: "meta-cloud-api", meta: { response: json, to } };
    } catch (err) {
      return { status: "failed", provider: "meta-cloud-api", error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export const CHANNELS: Record<ChannelId, ChannelAdapter> = {
  inapp: inAppChannel,
  browser: browserChannel,
  sms: smsChannel,
  email: emailChannel,
  whatsapp: whatsappChannel,
};

export function channelFor(id: string): ChannelAdapter {
  return CHANNELS[id as ChannelId] ?? inAppChannel;
}
