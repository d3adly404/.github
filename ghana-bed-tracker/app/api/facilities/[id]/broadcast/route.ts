/**
 * POST /api/facilities/:id/broadcast — send a free-text notice to everyone
 * subscribed to this facility (or its region). Roles: facility_admin, national.
 */
import { fail, json, readJson } from "@/lib/api";
import { HttpError, canManageFacility, requireRole } from "@/lib/auth";
import { broadcastToSubscribers } from "@/lib/alerts";
import { getFacility } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("facility_admin", "national");
    const { id } = await ctx.params;
    if (!canManageFacility(user, id)) throw new HttpError(403, "You can only broadcast for your own facility");

    const facility = getFacility(id);
    if (!facility) throw new HttpError(404, "Facility not found");

    const body = await readJson<{ title?: string; message?: string }>(req);
    const title = (body.title ?? "").trim();
    const message = (body.message ?? "").trim();
    if (!title || !message) throw new HttpError(400, "Both `title` and `message` are required");
    if (message.length > 480) throw new HttpError(400, "Message must be 480 characters or fewer (SMS limit)");

    const delivery = await broadcastToSubscribers(
      facility,
      `${title} — ${facility.name}`,
      message,
      `${user.name} (${user.role})`,
    );

    return json({ ok: true, delivery });
  } catch (err) {
    return fail(err);
  }
}
