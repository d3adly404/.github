/**
 * PATCH  /api/subscriptions/:id — pause/resume or re-target an alert
 * DELETE /api/subscriptions/:id — unsubscribe
 *
 * Auth is by the subscriber's own token (sent in the `token` query param or
 * request body), or by any signed-in staff member.
 */
import { fail, json, readJson } from "@/lib/api";
import { HttpError, currentUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { listSubscriptions } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function loadAuthorized(id: number, token?: string) {
  const sub = get<{ id: number; token: string }>(`SELECT id, token FROM subscriptions WHERE id = ?`, [id]);
  if (!sub) throw new HttpError(404, "Subscription not found");
  const user = await currentUser();
  if (!user && sub.token !== token) throw new HttpError(403, "This alert link does not match the subscription");
  return sub;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const subId = Number(id);
    const url = new URL(req.url);
    const body = await readJson<Record<string, unknown>>(req).catch(() => ({}) as Record<string, unknown>);
    const token = (body.token as string) ?? url.searchParams.get("token") ?? undefined;
    await loadAuthorized(subId, token);

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.active !== undefined) {
      sets.push("active = ?");
      params.push(body.active ? 1 : 0);
    }
    if (body.notifyOn !== undefined && Array.isArray(body.notifyOn)) {
      sets.push("notify_on = ?");
      params.push((body.notifyOn as string[]).join(","));
    }
    if (body.threshold !== undefined) {
      sets.push("threshold = ?");
      params.push(Math.min(99, Math.max(50, Number(body.threshold))));
    }
    if (body.cooldownMinutes !== undefined) {
      sets.push("cooldown_minutes = ?");
      params.push(Math.min(240, Math.max(5, Number(body.cooldownMinutes))));
    }
    if (body.facilityId !== undefined) {
      sets.push("facility_id = ?");
      params.push(body.facilityId || null);
    }
    if (body.regionId !== undefined) {
      sets.push("region_id = ?");
      params.push(body.regionId || null);
    }
    if (body.wardCategory !== undefined) {
      sets.push("ward_category = ?");
      params.push(body.wardCategory || null);
    }
    if (!sets.length) throw new HttpError(400, "Nothing to update");

    params.push(subId);
    run(`UPDATE subscriptions SET ${sets.join(", ")} WHERE id = ?`, params);
    const updated = listSubscriptions({ token }).find((s) => s.id === subId) ?? null;
    return json({ ok: true, subscription: updated });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const subId = Number(id);
    const url = new URL(req.url);
    await loadAuthorized(subId, url.searchParams.get("token") ?? undefined);
    run(`DELETE FROM subscriptions WHERE id = ?`, [subId]);
    return json({ ok: true, deleted: subId });
  } catch (err) {
    return fail(err);
  }
}
