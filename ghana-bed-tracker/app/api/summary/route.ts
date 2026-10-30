/** GET /api/summary — national rollup (used by the dashboard + widgets). */
import { json } from "@/lib/api";
import { listFacilities, nationalSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const summary = nationalSummary();
  const worst = url.searchParams.get("worst")
    ? listFacilities({ sort: "occupancy_desc", limit: Number(url.searchParams.get("worst")) })
    : undefined;
  const mostAvailable = url.searchParams.get("available")
    ? listFacilities({ availableOnly: true, sort: "available_desc", limit: Number(url.searchParams.get("available")) })
    : undefined;
  return json({ summary, worst, mostAvailable });
}
