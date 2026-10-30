/**
 * PATCH /api/wards/:id — record admissions, discharges or a capacity change.
 * Body: { mode: 'set'|'delta', occupied?, delta?, capacity?, reason? }
 * Roles: ward_staff, facility_admin (own facility), national (any facility).
 */
import { fail, json, readJson } from "@/lib/api";
import { HttpError, canManageFacility, requireRole } from "@/lib/auth";
import { updateWard } from "@/lib/beds";
import { getWard } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface Body {
  mode?: "set" | "delta";
  occupied?: number;
  delta?: number;
  capacity?: number;
  reason?: string;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ward_staff", "facility_admin", "national");
    const { id } = await ctx.params;
    const wardId = Number(id);
    if (!Number.isFinite(wardId)) throw new HttpError(400, "Invalid ward id");

    const ward = getWard(wardId);
    if (!ward) throw new HttpError(404, "Ward not found");
    if (!canManageFacility(user, ward.facility_id)) {
      throw new HttpError(403, "You can only update wards at your own facility");
    }

    const body = await readJson<Body>(req);
    const mode = body.mode === "set" ? "set" : "delta";
    if (mode === "set" && body.occupied === undefined && body.capacity === undefined) {
      throw new HttpError(400, "Provide `occupied` or `capacity` when mode is 'set'");
    }
    if (mode === "delta" && !Number.isFinite(body.delta ?? NaN)) {
      throw new HttpError(400, "Provide a numeric `delta` when mode is 'delta'");
    }

    const result = await updateWard({
      wardId,
      mode,
      occupied: body.occupied !== undefined ? Number(body.occupied) : undefined,
      delta: body.delta !== undefined ? Number(body.delta) : undefined,
      capacity: body.capacity !== undefined ? Number(body.capacity) : undefined,
      actor: `${user.name} (${user.role})`,
      source: "staff",
      reason: body.reason,
    });

    return json({
      ok: true,
      ward: result.ward,
      facility: result.facility,
      changed: result.changed,
      alerts: result.alerts.events,
      notified: result.alerts.delivery.attempted,
    });
  } catch (err) {
    return fail(err);
  }
}
