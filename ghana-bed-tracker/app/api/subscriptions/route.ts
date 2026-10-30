/**
 * Subscription API for patients.
 *
 * GET  /api/subscriptions?token=…      → list a patient's own alerts
 * POST /api/subscriptions              → create a subscription
 *      body: { name, channel: sms|email|whatsapp|browser|inapp, contact,
 *              facilityId?, regionId?, wardCategory?, notifyOn[], threshold?, cooldownMinutes? }
 */
import { fail, json, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { run } from "@/lib/db";
import { isValidEmail, normalizeGhPhone, wardLabel } from "@/lib/format";
import { listFacilities } from "@/lib/queries";
import { CHANNEL_LABELS, EVENT_LABELS } from "@/lib/format";
import { randomToken } from "@/lib/password";
import { listSubscriptions } from "@/lib/queries";
import type { ChannelId } from "@/lib/types";

export const dynamic = "force-dynamic";

const CHANNELS: ChannelId[] = ["sms", "email", "whatsapp", "browser", "inapp"];
const EVENTS = ["bed_freed", "facility_full", "ward_full", "high_occupancy", "any_change"];

export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) throw new HttpError(400, "A `token` is required to list subscriptions");
    const subs = listSubscriptions({ token });
    const facilities = listFacilities();
    return json({
      subscriptions: subs.map((s) => ({
        ...s,
        facility_name: s.facility_id ? facilities.find((f) => f.id === s.facility_id)?.name ?? null : null,
        region_name: s.region_id ? facilities.find((f) => f.region_id === s.region_id)?.region_name ?? null : null,
        ward_label: wardLabel(s.ward_category),
        channel_label: CHANNEL_LABELS[s.channel] ?? s.channel,
        events: s.notify_on.split(",").map((e) => EVENT_LABELS[e] ?? e),
      })),
    });
  } catch (err) {
    return fail(err);
  }
}

interface Body {
  name?: string;
  channel?: string;
  contact?: string;
  facilityId?: string | null;
  regionId?: string | null;
  wardCategory?: string | null;
  notifyOn?: string[];
  threshold?: number;
  cooldownMinutes?: number;
  token?: string;
  pushSubscription?: unknown;
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Body>(req);
    const channel = (body.channel ?? "").toLowerCase() as ChannelId;
    if (!CHANNELS.includes(channel)) throw new HttpError(400, `channel must be one of: ${CHANNELS.join(", ")}`);

    const name = (body.name ?? "").trim();
    if (name.length < 2) throw new HttpError(400, "Please tell us a name so we can address the alert");

    let contact = (body.contact ?? "").trim();
    if (channel === "sms" || channel === "whatsapp") {
      const normalized = normalizeGhPhone(contact);
      if (!normalized) {
        throw new HttpError(400, "Enter a valid Ghanaian mobile number, e.g. 024 412 3456 or +233244123456");
      }
      contact = normalized;
    } else if (channel === "email") {
      if (!isValidEmail(contact)) throw new HttpError(400, "Enter a valid e-mail address");
    } else if (channel === "browser") {
      contact = `browser:${randomToken(6)}`;
    } else {
      contact = contact || `inapp:${randomToken(6)}`;
    }

    const notifyOn = (body.notifyOn ?? ["bed_freed", "facility_full"]).filter((e) => EVENTS.includes(e));
    if (!notifyOn.length) throw new HttpError(400, "Choose at least one alert type");

    const facilityId = body.facilityId || null;
    const regionId = body.regionId || null;
    if (facilityId) {
      const facility = listFacilities().find((f) => f.id === facilityId);
      if (!facility) throw new HttpError(404, "Unknown facility");
    }

    const token = body.token && /^[\w-]{8,}$/.test(body.token) ? body.token : randomToken(12);
    const threshold = Math.min(99, Math.max(50, Number(body.threshold ?? 90)));
    const cooldown = Math.min(240, Math.max(5, Number(body.cooldownMinutes ?? 15)));

    const { lastInsertRowid } = run(
      `INSERT INTO subscriptions
        (token, name, channel, contact, facility_id, region_id, ward_category, notify_on, threshold, cooldown_minutes, active, verified, push_subscription, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        token,
        name,
        channel,
        contact,
        facilityId,
        regionId,
        body.wardCategory || null,
        notifyOn.join(","),
        threshold,
        cooldown,
        1,
        channel === "inapp" || channel === "browser" ? 1 : 0,
        body.pushSubscription ? JSON.stringify(body.pushSubscription) : null,
        Date.now(),
      ],
    );

    const subs = listSubscriptions({ token });
    const created = subs.find((s) => s.id === Number(lastInsertRowid));

    return json(
      {
        ok: true,
        token,
        subscription: created ?? null,
        message:
          channel === "sms"
            ? `Alerts will be sent by SMS to ${contact}. Reply STOP to opt out.`
            : channel === "whatsapp"
              ? `Alerts will be sent to ${contact} on WhatsApp.`
              : channel === "email"
                ? `Alerts will be sent to ${contact}.`
                : "Alerts will appear in this browser.",
      },
      { status: 201 },
    );
  } catch (err) {
    return fail(err);
  }
}
