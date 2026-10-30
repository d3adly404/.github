/**
 * GET /api/facilities — searchable, filterable hospital list with live totals.
 * Query params: q, region, type, ownership, status, category, available, sort,
 *               lat, lon, limit
 */
import { json } from "@/lib/api";
import { boolParam, intParam } from "@/lib/api";
import { listFacilities, nationalSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  const facilities = listFacilities({
    search: sp.get("q") ?? undefined,
    region: sp.get("region") ?? undefined,
    type: sp.get("type") ?? undefined,
    ownership: sp.get("ownership") ?? undefined,
    status: sp.get("status") ?? undefined,
    category: sp.get("category") ?? undefined,
    availableOnly: boolParam(sp.get("available")),
    sort: (sp.get("sort") as never) ?? undefined,
    lat: sp.get("lat") ? Number(sp.get("lat")) : undefined,
    lon: sp.get("lon") ? Number(sp.get("lon")) : undefined,
    limit: sp.get("limit") ? intParam(sp.get("limit"), 0) || undefined : undefined,
  });

  return json({
    count: facilities.length,
    facilities,
    summary: sp.get("includeSummary") ? nationalSummary() : undefined,
  });
}
