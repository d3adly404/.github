/**
 * Simulator control (staff only).
 * GET  /api/simulator              → status
 * POST /api/simulator              → { enabled?, intervalSeconds?, tick? }
 */
import { fail, json, readJson } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { intervalSeconds, runTick, setSimulatorEnabled, simulatorStatus, startSimulator } from "@/lib/simulator";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(simulatorStatus());
}

export async function POST(req: Request) {
  try {
    await requireRole("facility_admin", "national");
    const body = await readJson<{ enabled?: boolean; intervalSeconds?: number; tick?: boolean }>(req);

    if (body.tick) {
      const result = await runTick();
      return json({ ok: true, ...result, status: simulatorStatus() });
    }

    if (body.enabled !== undefined) {
      setSimulatorEnabled(Boolean(body.enabled), body.intervalSeconds ?? intervalSeconds());
    } else if (body.intervalSeconds !== undefined) {
      setSimulatorEnabled(simulatorStatus().enabled, Number(body.intervalSeconds));
      startSimulator();
    }

    return json({ ok: true, status: simulatorStatus() });
  } catch (err) {
    return fail(err);
  }
}
