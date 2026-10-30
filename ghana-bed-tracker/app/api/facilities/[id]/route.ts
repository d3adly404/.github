/**
 * GET /api/facilities/:id — facility detail: wards, 24h history, recent alerts.
 */
import { json, fail, intParam } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import {
  countSubscribers,
  facilityHistory,
  getFacility,
  getWards,
  recentAlerts,
  wardHistory,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const facility = getFacility(id);
    if (!facility) throw new HttpError(404, "Facility not found");

    const wards = getWards(id);
    const hours = intParam(new URL(_req.url).searchParams.get("hours"), 24);

    return json({
      facility,
      wards: wards.map((w) => ({ ...w, history: wardHistory(w.id, Math.min(hours, 12)) })),
      history: facilityHistory(id, hours),
      alerts: recentAlerts(15, id),
      subscribers: countSubscribers(id),
    });
  } catch (err) {
    return fail(err);
  }
}
