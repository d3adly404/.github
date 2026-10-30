/**
 * Delivery pipeline: render a message for each matching subscription, hand it
 * to the right channel adapter, persist the result and push it to live clients.
 */
import { run } from "../db";
import { broadcast } from "../realtime";
import { channelFor, type SendInput } from "./channels";
import { notifyConfig } from "./config";
import { renderMessage, severityFor, type Alternative } from "./templates";
import type { AlertEventType, Facility, Severity, Subscription, Ward } from "../types";

export interface DispatchTarget {
  event: AlertEventType;
  facility: Facility;
  ward?: Ward | null;
  alternatives?: Alternative[];
  /** Overrides for manual facility broadcasts. */
  title?: string;
  body?: string;
  severity?: Severity;
}

export interface DeliveryReport {
  attempted: number;
  sent: number;
  simulated: number;
  failed: number;
  channels: Record<string, number>;
}

export async function dispatchToSubscriptions(
  target: DispatchTarget,
  subscriptions: Subscription[],
): Promise<DeliveryReport> {
  const cfg = notifyConfig();
  const report: DeliveryReport = { attempted: 0, sent: 0, simulated: 0, failed: 0, channels: {} };
  if (!subscriptions.length) return report;

  const baseSeverity = target.severity ?? severityFor(target.event);

  for (const sub of subscriptions) {
    const rendered = renderMessage({
      event: target.event,
      facility: target.facility,
      ward: target.ward ?? null,
      alternatives: target.alternatives,
      token: sub.token,
      baseUrl: cfg.baseUrl,
      recipientName: sub.name,
      customTitle: target.title,
      customBody: target.body,
    });
    const severity = target.severity ?? rendered.severity ?? baseSeverity;

    const input: SendInput = {
      recipient: sub.contact,
      title: rendered.title,
      body: rendered.body,
      sms: rendered.sms,
      subject: rendered.subject,
      html: rendered.html,
      whatsapp: rendered.whatsapp,
      severity,
      eventType: target.event,
      pushSubscription: sub.push_subscription ? sub.push_subscription : undefined,
      subscriptionId: sub.id,
    };

    let result;
    try {
      result = await channelFor(sub.channel).send(input);
    } catch (err) {
      result = {
        status: "failed" as const,
        provider: sub.channel,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    report.attempted += 1;
    report.channels[sub.channel] = (report.channels[sub.channel] ?? 0) + 1;
    if (result.status === "sent") report.sent += 1;
    else if (result.status === "failed") report.failed += 1;
    else report.simulated += 1;

    const { lastInsertRowid } = run(
      `INSERT INTO notification_log
        (subscription_id, channel, provider, recipient, event_type, severity, title, body, facility_id, status, error, meta, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        sub.id,
        sub.channel,
        result.provider,
        sub.contact,
        target.event,
        severity,
        rendered.title,
        sub.channel === "sms" ? rendered.sms : sub.channel === "whatsapp" ? rendered.whatsapp : rendered.body,
        target.facility.id,
        result.status,
        result.error ?? null,
        result.meta ? JSON.stringify(result.meta) : null,
        Date.now(),
      ],
    );

    // Live clients (public alert feed + staff outbox) pick this up instantly.
    broadcast({
      kind: "alert",
      alert: {
        id: Number(lastInsertRowid),
        facility_id: target.facility.id,
        ward_id: target.ward?.id ?? null,
        type: target.event,
        severity,
        title: rendered.title,
        message: rendered.body,
        notified: report.attempted,
        ts: Date.now(),
        facility_name: target.facility.name,
        region_name: target.facility.region_name,
      },
    });
  }

  return report;
}

/** Records a message in the outbox without a subscription (e.g. staff broadcast previews). */
export function logOutboxEntry(entry: {
  channel: string;
  provider: string;
  recipient: string;
  eventType: string;
  severity: Severity;
  title: string;
  body: string;
  facilityId: string | null;
  status: string;
  meta?: Record<string, unknown>;
}): void {
  run(
    `INSERT INTO notification_log
      (subscription_id, channel, provider, recipient, event_type, severity, title, body, facility_id, status, error, meta, created_at)
     VALUES(NULL,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      entry.channel,
      entry.provider,
      entry.recipient,
      entry.eventType,
      entry.severity,
      entry.title,
      entry.body,
      entry.facilityId,
      entry.status,
      null,
      entry.meta ? JSON.stringify(entry.meta) : null,
      Date.now(),
    ],
  );
}
