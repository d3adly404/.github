/**
 * POST /api/push/subscribe — attach a browser PushSubscription to an alert.
 * Body: { subscription, subscriptionId? } or a full new subscription payload.
 */
import { fail, json, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { run } from "@/lib/db";
import { listSubscriptions } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface Body {
  subscription?: unknown;
  subscriptionId?: number;
  token?: string;
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Body>(req);
    if (!body.subscription || typeof body.subscription !== "object") {
      throw new HttpError(400, "A PushSubscription object is required");
    }

    const id = Number(body.subscriptionId);
    if (!Number.isFinite(id)) throw new HttpError(400, "subscriptionId is required");

    const existing = listSubscriptions({ token: body.token }).find((s) => s.id === id);
    if (!existing) throw new HttpError(404, "Subscription not found for this device link");

    run(`UPDATE subscriptions SET push_subscription = ?, channel = 'browser', verified = 1 WHERE id = ?`, [
      JSON.stringify(body.subscription),
      id,
    ]);

    return json({ ok: true, updated: id });
  } catch (err) {
    return fail(err);
  }
}
