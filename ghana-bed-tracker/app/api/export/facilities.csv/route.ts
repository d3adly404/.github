/**
 * GET /api/export/facilities.csv — flat export for MoH / GHS / DHMT analysts.
 * One row per facility with totals, ward-type breakdown and report freshness.
 */
import { listFacilities, nationalSummary } from "@/lib/queries";
import { isStale } from "@/lib/format";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const facilities = listFacilities({ sort: "region" });
  const summary = nationalSummary();

  const headers = [
    "facility_id",
    "facility_name",
    "region",
    "district",
    "town",
    "type",
    "ownership",
    "latitude",
    "longitude",
    "phone",
    "email",
    "staffed_beds",
    "occupied",
    "available",
    "occupancy_pct",
    "status",
    "icu_free",
    "maternity_free",
    "paediatric_free",
    "surgical_free",
    "emergency_free",
    "last_report_iso",
    "reported_by",
    "report_stale",
  ];

  const rows = facilities.map((f) => {
    const byCat = new Map((f.free_categories ?? []).map((c) => [c.category, c.available]));
    const status = f.available === 0 && f.capacity > 0 ? "full" : f.occupancy >= 90 ? "critical" : f.occupancy >= 70 ? "filling" : "available";
    return [
      f.id,
      f.name,
      f.region_name,
      f.district,
      f.town,
      f.type,
      f.ownership,
      f.lat,
      f.lon,
      f.phone,
      f.email,
      f.capacity,
      f.occupied,
      f.available,
      f.occupancy,
      status,
      byCat.get("icu") ?? 0,
      byCat.get("maternity") ?? 0,
      byCat.get("paediatric") ?? 0,
      byCat.get("surgical") ?? 0,
      byCat.get("emergency") ?? 0,
      new Date(f.last_report_at).toISOString(),
      f.reported_by ?? "",
      isStale(f.last_report_at) ? "yes" : "no",
    ];
  });

  const body = [
    `# GhanaBed facility export · generated ${new Date().toISOString()}`,
    `# national: ${summary.facilities} facilities, ${summary.capacity} beds, ${summary.occupied} occupied, ${summary.occupancy}% occupancy, ${summary.full} full`,
    headers.join(","),
    ...rows.map((r) => r.map(csvCell).join(",")),
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ghanabed-facilities-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
