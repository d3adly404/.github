/**
 * GET /api/stream — Server-Sent Events feed of live bed updates.
 *
 * Emits `summary` (national rollup), `facility`, `ward` and `alert` events.
 * Clients reconnect automatically (EventSource) with a 3s retry.
 */
import { createEventStream, sseHeaders } from "@/lib/realtime";
import { listFacilities, nationalSummary, recentAlerts } from "@/lib/queries";
import type { StreamMessage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facility");

  const initial: StreamMessage[] = [{ kind: "summary", summary: nationalSummary() }];

  if (facilityId) {
    const facility = listFacilities().find((f) => f.id === facilityId);
    if (facility) initial.push({ kind: "facility", facility });
  } else {
    // A brand-new visitor gets the current top-pressure facilities immediately.
    for (const facility of listFacilities().slice(0, 12)) {
      initial.push({ kind: "facility", facility });
    }
  }

  for (const alert of recentAlerts(8)) {
    initial.push({ kind: "alert", alert });
  }

  return new Response(createEventStream(initial), { headers: sseHeaders });
}
