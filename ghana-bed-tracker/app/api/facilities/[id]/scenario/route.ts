/**
 * POST /api/facilities/:id/scenario — run a scripted pressure scenario.
 * Body: { scenario: 'surge'|'discharge_round'|'icu_pressure'|'maternity_surge'|'fill_facility' }
 * Used for demos, drills and staff training. Roles: facility_admin, national.
 */
import { fail, json, readJson } from "@/lib/api";
import { HttpError, canManageFacility, requireRole } from "@/lib/auth";
import { getFacility } from "@/lib/queries";
import { runScenario, type ScenarioId } from "@/lib/simulator";

export const dynamic = "force-dynamic";

const VALID: ScenarioId[] = ["surge", "discharge_round", "icu_pressure", "maternity_surge", "fill_facility"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("facility_admin", "national");
    const { id } = await ctx.params;
    if (!canManageFacility(user, id)) throw new HttpError(403, "You can only run scenarios at your own facility");

    const facility = getFacility(id);
    if (!facility) throw new HttpError(404, "Facility not found");

    const body = await readJson<{ scenario?: string }>(req);
    const scenario = body.scenario as ScenarioId;
    if (!VALID.includes(scenario)) throw new HttpError(400, `scenario must be one of: ${VALID.join(", ")}`);

    const result = await runScenario(scenario, id, `${user.name} (scenario)`);
    return json({ ok: true, ...result });
  } catch (err) {
    return fail(err);
  }
}
