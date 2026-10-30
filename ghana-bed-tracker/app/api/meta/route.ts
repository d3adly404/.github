/** GET /api/meta — reference data for the filter bars and forms. */
import { json } from "@/lib/api";
import { facilityTypeOptions, listRegions, ownershipOptions } from "@/lib/queries";
import { WARD_LABELS } from "@/lib/format";
import { SCENARIOS, simulatorStatus } from "@/lib/simulator";
import { providerStatus, notifyConfig } from "@/lib/notifications/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = notifyConfig();
  return json({
    regions: listRegions(),
    facilityTypes: facilityTypeOptions(),
    ownerships: ownershipOptions(),
    wardCategories: Object.entries(WARD_LABELS).map(([id, label]) => ({ id, label })),
    scenarios: SCENARIOS,
    simulator: simulatorStatus(),
    notifications: { mode: cfg.mode, providers: providerStatus() },
  });
}
