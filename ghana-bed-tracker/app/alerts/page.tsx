import { Metadata } from "next";
import { Suspense } from "react";
import AlertsManager from "@/components/AlertsManager";
import { WARD_LABELS } from "@/lib/format";
import { listFacilities, listRegions } from "@/lib/queries";

export const metadata: Metadata = {
  title: "My alerts",
  description: "Manage your GhanaBed alerts — pause, edit or delete bed availability notifications.",
};

export const dynamic = "force-dynamic";

export default function AlertsPage() {
  const facilities = listFacilities({ sort: "name" });
  const regions = listRegions();

  return (
    <div className="space-y-6">
      <header>
        <p className="section-title">My alerts</p>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          Your bed availability notifications
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Everything you have subscribed to, on one screen. Pause an alert while you are admitted, tighten the quiet
          period, or delete it for good — no account or password required.
        </p>
      </header>

      <Suspense fallback={<p className="text-sm text-slate-500">Loading your alerts…</p>}>
        <AlertsManager
          facilities={facilities.map((f) => ({ id: f.id, name: f.name, region_id: f.region_id, region_name: f.region_name }))}
          regions={regions.map((r) => ({ id: r.id, name: r.name }))}
          wardCategories={Object.entries(WARD_LABELS).map(([id, label]) => ({ id, label }))}
        />
      </Suspense>
    </div>
  );
}
