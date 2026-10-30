/**
 * GET /api/notifications — the delivery outbox.
 * Staff use it to see exactly what patients were told, on which channel and
 * through which provider (including the simulated provider payloads).
 * Query params: limit, facility, channel, token (a patient may read their own).
 */
import { fail, json, intParam } from "@/lib/api";
import { HttpError, currentUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { listNotifications } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(200, intParam(url.searchParams.get("limit"), 50));
    const user = await currentUser();
    const token = url.searchParams.get("token") ?? undefined;

    if (token && !user) {
      // Patients may only see messages addressed to their own subscriptions.
      const rows = all<Record<string, unknown>>(
        `SELECT n.id, n.channel, n.provider, n.recipient, n.event_type, n.severity, n.title, n.body,
                n.facility_id, n.status, n.error, n.created_at, f.name AS facility_name
         FROM notification_log n
         JOIN subscriptions s ON s.id = n.subscription_id
         LEFT JOIN facilities f ON f.id = n.facility_id
         WHERE s.token = ?
         ORDER BY n.created_at DESC LIMIT ?`,
        [token, limit],
      );
      return json({ notifications: rows, mode: "patient" });
    }

    if (!user && !token) throw new HttpError(401, "Sign in to view the notification outbox");

    return json({
      notifications: listNotifications(limit, url.searchParams.get("facility") ?? undefined, url.searchParams.get("channel") ?? undefined),
      mode: "staff",
    });
  } catch (err) {
    return fail(err);
  }
}
