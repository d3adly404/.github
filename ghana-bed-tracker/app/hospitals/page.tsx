import { Metadata } from "next";
import { Suspense } from "react";
import FacilityBrowser from "@/components/FacilityBrowser";
import { WARD_LABELS } from "@/lib/format";
import { facilityTypeOptions, listFacilities, listRegions } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Find a bed — hospitals by availability",
  description:
    "Search Ghana's hospitals by region, town and ward type, and see live inpatient bed availability before you travel.",
};

export const dynamic = "force-dynamic";

export default function HospitalsPage() {
  const facilities = listFacilities({ sort: "occupancy_desc" });
  const regions = listRegions();
  const types = facilityTypeOptions();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-title">Find a bed</p>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Which hospitals have beds right now?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Filter by region, facility type or ward specialty. Everything on this page updates live as ward staff report
            admissions and discharges — no refresh needed.
          </p>
        </div>
        <div className="flex gap-2 text-[11px]">
          <span className="pill bg-rose-500/10 text-rose-300 ring-rose-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Full
          </span>
          <span className="pill bg-amber-500/10 text-amber-300 ring-amber-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> 90%+
          </span>
          <span className="pill bg-emerald-500/10 text-emerald-300 ring-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Beds free
          </span>
        </div>
      </header>

      <Suspense fallback={<p className="text-sm text-slate-500">Loading facilities…</p>}>
        <FacilityBrowser
          initial={facilities}
          regions={regions.map((r) => ({ id: r.id, name: r.name }))}
          facilityTypes={types}
          wardCategories={Object.entries(WARD_LABELS).map(([id, label]) => ({ id, label }))}
        />
      </Suspense>
    </div>
  );
}
