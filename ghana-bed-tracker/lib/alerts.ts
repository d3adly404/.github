/**
 * Alert rule engine.
 *
 * Compares the before/after state of a ward and its parent facility, derives
 * the events that patients subscribed to, applies per-subscription cooldowns
 * and hands matching subscribers to the delivery pipeline.
 */
import { all, get, run } from "./db";
import { pct } from "./format";
import { nearestAvailable } from "./queries";
import { dispatchToSubscriptions, type DeliveryReport } from "./notifications/dispatch";
import { broadcast } from "./realtime";
import type { AlertEvent, AlertEventType, Facility, Subscription, Ward } from "./types";

export interface ChangeSnapshot {
  occupied: number;
  capacity: number;
  available: number;
  occupancy: number;
}

export interface WardChangeContext {
  facility: Facility;
  ward: Ward;
  wardBefore: ChangeSnapshot;
  wardAfter: ChangeSnapshot;
  facilityBefore: ChangeSnapshot;
  facilityAfter: ChangeSnapshot;
  actor: string;
  /** Simulator churn is still notified, but tagged so it can be filtered. */
  source: "staff" | "simulator" | "scenario";
  threshold?: number;
}

interface DetectedEvent {
  type: AlertEventType;
  severity: AlertEvent["severity"];
  title: string;
  message: string;
  ward: Ward | null;
}

export function snapshot(occupied: number, capacity: number): ChangeSnapshot {
  return { occupied, capacity, available: Math.max(0, capacity - occupied), occupancy: pct(occupied, capacity) };
}

/** Maps an internal event type onto the `notify_on` tokens a subscription uses. */
const NOTIFY_ON_MAP: Record<AlertEventType, string[]> = {
  facility_full: ["facility_full", "any_change"],
  facility_reopened: ["bed_freed", "facility_full", "any_change"],
  ward_full: ["ward_full", "facility_full", "any_change"],
  ward_freed: ["bed_freed", "ward_full", "any_change"],
  high_occupancy: ["high_occupancy", "any_change"],
  occupancy_recovered: ["high_occupancy", "bed_freed", "any_change"],
  broadcast: ["any_change", "bed_freed", "facility_full"],
  stale_report: ["any_change"],
};

export function detectEvents(ctx: WardChangeContext): DetectedEvent[] {
  const { facility, ward, wardBefore, wardAfter, facilityBefore, facilityAfter } = ctx;
  const threshold = ctx.threshold ?? 90;
  const events: DetectedEvent[] = [];
  const wardName = ward.name;

  // 1. Facility ran completely out of beds (or got them back).
  if (facilityAfter.available === 0 && facilityBefore.available > 0 && facilityAfter.capacity > 0) {
    events.push({
      type: "facility_full",
      severity: "critical",
      title: `${facility.name} is FULL — no beds available`,
      message: `All ${facilityAfter.capacity} inpatient beds at ${facility.name} (${facility.town}, ${facility.region_name}) are occupied.`,
      ward: null,
    });
  }
  if (facilityAfter.available > 0 && facilityBefore.available === 0) {
    events.push({
      type: "facility_reopened",
      severity: "success",
      title: `${facility.name} now has ${facilityAfter.available} free bed${facilityAfter.available === 1 ? "" : "s"}`,
      message: `${facility.name} is no longer full — ${facilityAfter.available} of ${facilityAfter.capacity} beds are free (${facilityAfter.occupancy}% occupancy).`,
      ward: null,
    });
  }

  // 2. Ward-level exhaustion / release.
  if (wardAfter.available === 0 && wardBefore.available > 0 && wardAfter.capacity > 0) {
    events.push({
      type: "ward_full",
      severity: "critical",
      title: `${wardName} at ${facility.name} is full`,
      message: `${wardName} has no free beds (${wardAfter.capacity}/${wardAfter.capacity} occupied).`,
      ward,
    });
  }
  if (wardAfter.available > 0 && wardBefore.available === 0) {
    events.push({
      type: "ward_freed",
      severity: "success",
      title: `A bed has been freed in ${wardName} at ${facility.name}`,
      message: `${wardName} now has ${wardAfter.available} of ${wardAfter.capacity} beds free.`,
      ward,
    });
  }

  // 3. Threshold crossings, up and down.
  if (facilityAfter.occupancy >= threshold && facilityBefore.occupancy < threshold) {
    events.push({
      type: "high_occupancy",
      severity: "warning",
      title: `${facility.name} has reached ${facilityAfter.occupancy}% occupancy`,
      message: `${facility.name} crossed the ${threshold}% alert threshold with ${facilityAfter.available} bed(s) free.`,
      ward: null,
    });
  }
  if (facilityAfter.occupancy < threshold && facilityBefore.occupancy >= threshold && facilityAfter.available > 0) {
    events.push({
      type: "occupancy_recovered",
      severity: "info",
      title: `Bed pressure easing at ${facility.name}`,
      message: `${facility.name} is back to ${facilityAfter.occupancy}% occupancy with ${facilityAfter.available} bed(s) free.`,
      ward: null,
    });
  }

  return events;
}

function subscriptionMatches(
  sub: Subscription,
  ctx: WardChangeContext,
  event: DetectedEvent,
): boolean {
  if (!sub.active) return false;

  // Scope: specific facility > region > national.
  if (sub.facility_id && sub.facility_id !== ctx.facility.id) return false;
  if (!sub.facility_id && sub.region_id && sub.region_id !== ctx.facility.region_id) return false;

  // Ward preference only narrows ward-level events.
  if (sub.ward_category && event.ward && event.ward.category !== sub.ward_category) return false;

  // Event preference.
  const wanted = sub.notify_on.split(",").map((s) => s.trim());
  const accepts = (NOTIFY_ON_MAP[event.type] ?? []).some((token) => wanted.includes(token));
  if (!accepts) return false;

  if (event.type === "high_occupancy" && ctx.facilityAfter.occupancy < sub.threshold) return false;

  // Cooldown: don't spam the same person about the same event type.
  const last = get<{ created_at: number }>(
    `SELECT created_at FROM notification_log
     WHERE subscription_id = ? AND event_type = ? ORDER BY created_at DESC LIMIT 1`,
    [sub.id, event.type],
  );
  if (last) {
    const elapsedMin = (Date.now() - Number(last.created_at)) / 60_000;
    if (elapsedMin < sub.cooldown_minutes) return false;
  }
  return true;
}

function normalizeSub(r: Record<string, unknown>): Subscription {
  return {
    id: Number(r.id),
    token: String(r.token),
    name: String(r.name),
    channel: String(r.channel) as Subscription["channel"],
    contact: String(r.contact),
    facility_id: r.facility_id == null ? null : String(r.facility_id),
    region_id: r.region_id == null ? null : String(r.region_id),
    ward_category: r.ward_category == null ? null : String(r.ward_category),
    notify_on: String(r.notify_on),
    threshold: Number(r.threshold),
    cooldown_minutes: Number(r.cooldown_minutes),
    active: Number(r.active),
    verified: Number(r.verified),
    created_at: Number(r.created_at),
    push_subscription: r.push_subscription == null ? null : String(r.push_subscription),
  };
}

function candidateSubscriptions(ctx: WardChangeContext): Subscription[] {
  const rows = all<Record<string, unknown>>(
    `SELECT * FROM subscriptions
     WHERE active = 1
       AND (facility_id = ? OR (facility_id IS NULL AND region_id = ?) OR (facility_id IS NULL AND region_id IS NULL))`,
    [ctx.facility.id, ctx.facility.region_id],
  );
  return rows.map(normalizeSub);
}

export interface AlertRunResult {
  events: { type: AlertEventType; severity: string; notified: number }[];
  delivery: DeliveryReport;
}

/** Detects events, persists them, notifies subscribers and broadcasts live. */
export async function evaluateAndNotify(ctx: WardChangeContext): Promise<AlertRunResult> {
  const detected = detectEvents(ctx);
  const result: AlertRunResult = {
    events: [],
    delivery: { attempted: 0, sent: 0, simulated: 0, failed: 0, channels: {} },
  };
  if (!detected.length) return result;

  const candidates = candidateSubscriptions(ctx);

  for (const event of detected) {
    const matched = candidates.filter((sub) => subscriptionMatches(sub, ctx, event));

    const alternatives =
      event.severity === "critical" || event.severity === "warning"
        ? nearestAvailable(ctx.facility.lat, ctx.facility.lon, ctx.facility.id, 3).map((a) => ({
            name: a.name,
            town: a.town,
            region_name: a.region_name,
            available: a.available,
            distance_km: a.distance_km,
            phone: a.phone,
          }))
        : [];

    const { lastInsertRowid } = run(
      `INSERT INTO alert_events(facility_id, ward_id, type, severity, title, message, notified, ts)
       VALUES(?,?,?,?,?,?,?,?)`,
      [
        ctx.facility.id,
        event.ward?.id ?? null,
        event.type,
        event.severity,
        event.title,
        event.message,
        matched.length,
        Date.now(),
      ],
    );

    broadcast({
      kind: "alert",
      alert: {
        id: Number(lastInsertRowid),
        facility_id: ctx.facility.id,
        ward_id: event.ward?.id ?? null,
        type: event.type,
        severity: event.severity,
        title: event.title,
        message: event.message,
        notified: matched.length,
        ts: Date.now(),
        facility_name: ctx.facility.name,
        region_name: ctx.facility.region_name,
      },
    });

    const delivery = await dispatchToSubscriptions(
      {
        event: event.type,
        facility: { ...ctx.facility, ...ctx.facilityAfter },
        ward: event.ward,
        alternatives,
      },
      matched,
    );

    result.events.push({ type: event.type, severity: event.severity, notified: matched.length });
    result.delivery.attempted += delivery.attempted;
    result.delivery.sent += delivery.sent;
    result.delivery.simulated += delivery.simulated;
    result.delivery.failed += delivery.failed;
    for (const [channel, count] of Object.entries(delivery.channels)) {
      result.delivery.channels[channel] = (result.delivery.channels[channel] ?? 0) + count;
    }
  }

  return result;
}

/** Manual broadcast from a facility admin to all of that facility's subscribers. */
export async function broadcastToSubscribers(
  facility: Facility,
  title: string,
  body: string,
  actor: string,
): Promise<DeliveryReport> {
  const subs = all<Record<string, unknown>>(
    `SELECT * FROM subscriptions WHERE active = 1 AND (facility_id = ? OR (facility_id IS NULL AND region_id = ?))`,
    [facility.id, facility.region_id],
  ).map(normalizeSub);

  const { lastInsertRowid } = run(
    `INSERT INTO alert_events(facility_id, ward_id, type, severity, title, message, notified, ts)
     VALUES(?,?,?,?,?,?,?,?)`,
    [facility.id, null, "broadcast", "info", title, body, subs.length, Date.now()],
  );
  run(`INSERT INTO audit_log(actor, action, entity, detail, ts) VALUES(?,?,?,?,?)`, [
    actor,
    "broadcast",
    facility.id,
    `${title} → ${subs.length} subscribers`,
    Date.now(),
  ]);

  broadcast({
    kind: "alert",
    alert: {
      id: Number(lastInsertRowid),
      facility_id: facility.id,
      ward_id: null,
      type: "broadcast",
      severity: "info",
      title,
      message: body,
      notified: subs.length,
      ts: Date.now(),
      facility_name: facility.name,
      region_name: facility.region_name,
    },
  });

  return dispatchToSubscriptions(
    { event: "broadcast", facility, title, body, severity: "info" },
    subs,
  );
}
