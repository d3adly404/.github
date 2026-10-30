import { Metadata } from "next";
import Link from "next/link";
import AlertFeed from "@/components/AlertFeed";
import FacilityMap from "@/components/FacilityMap";
import { OccupancyBar, RegionTable, StatCard, StatusPill } from "@/components/primitives";
import { currentUser } from "@/lib/auth";
import { STATUS_META, bedStatus, cx, formatNumber, timeAgo } from "@/lib/format";
import { listFacilities, nationalSummary, recentAlerts } from "@/lib/queries";
import { simulatorStatus } from "@/lib/simulator";

export const metadata: Metadata = {
  title: "National oversight",
  description: "Bed pressure across all 16 regions of Ghana, data-quality flags and CSV export for MoH / GHS oversight.",
};

export const dynamic = "force-dynamic";

export default async function NationalPage() {
  const user = await currentUser();
  const summary = nationalSummary();
  const facilities = listFacilities({ sort: "occupancy_desc" });
  const alerts = recentAlerts(16);
  const sim = simulatorStatus();

  const stale = facilities.filter((f) => f.stale);
  const full = facilities.filter((f) => f.capacity > 0 && f.available === 0);
  const critical = facilities.filter((f) => f.occupancy >= 90 && f.occupancy < 100);
  const icuFree = facilities.reduce((acc, f) => acc + (f.free_categories?.find((c) => c.category === "icu")?.available ?? 0), 0);
  const maternityFree = facilities.reduce(
    (acc, f) => acc + (f.free_categories?.find((c) => c.category === "maternity")?.available ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-title">National oversight</p>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Bed pressure across all 16 regions
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            The view a district/regional directorate or MoH ops room needs: where capacity is exhausted, which facilities
            have stopped reporting, and how many critical-care and maternity beds remain nationally.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/export/facilities.csv" className="btn-ghost btn-sm" download>
            Export CSV
          </a>
          <Link href="/portal" className="btn-ghost btn-sm">
            Staff portal
          </Link>
        </div>
      </header>

      {!user && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[12px] text-slate-400">
          Viewing in read-only mode.{" "}
          <Link href="/login" className="link">
            Sign in
          </Link>{" "}
          with a national account to open any facility&apos;s reporting console from here.
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="National occupancy" value={`${summary.occupancy}%`} sub={`${formatNumber(summary.occupied)} of ${formatNumber(summary.capacity)} beds`} tone={summary.occupancy >= 85 ? "warn" : "good"} />
        <StatCard label="Facilities at capacity" value={summary.full} sub={full[0] ? `incl. ${full[0].name}` : "None currently full"} tone={summary.full > 0 ? "bad" : "good"} />
        <StatCard label="ICU / HDU beds free" value={formatNumber(icuFree)} sub="Across all reporting facilities" tone={icuFree < 20 ? "bad" : "neutral"} />
        <StatCard label="Maternity beds free" value={formatNumber(maternityFree)} sub="Across all reporting facilities" tone={maternityFree < 40 ? "warn" : "good"} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <RegionTable regions={summary.regions} />
        <AlertFeed initial={alerts} limit={14} title="National alert feed" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <FacilityMap facilities={facilities} height={440} />

        <div className="space-y-5">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
              <p className="section-title">At capacity now</p>
              <span className="text-[11px] text-slate-500">{full.length} facilities</span>
            </div>
            {full.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-slate-500">
                No tracked facility is completely full — a good day for referrals.
              </p>
            ) : (
              <ul className="scroll-thin max-h-64 divide-y divide-white/5 overflow-y-auto">
                {full.map((f) => (
                  <li key={f.id} className="px-5 py-2.5">
                    <Link href={`/hospitals/${f.id}`} className="flex items-center justify-between gap-3 hover:text-emerald-300">
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-semibold text-slate-100">{f.name}</span>
                        <span className="block truncate text-[10.5px] text-slate-500">{f.town} · {f.region_name}</span>
                      </span>
                      <StatusPill occupied={f.occupied} capacity={f.capacity} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
              <p className="section-title">Data quality — stale reports</p>
              <span className="text-[11px] text-slate-500">{stale.length} flagged</span>
            </div>
            <p className="border-b border-white/8 px-5 py-2.5 text-[11px] text-slate-500">
              Facilities that have not reported in over 90 minutes. Patients see a stale-data warning on these pages.
            </p>
            {stale.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-slate-500">
                Every facility has reported within the last 90 minutes.
              </p>
            ) : (
              <ul className="scroll-thin max-h-64 divide-y divide-white/5 overflow-y-auto">
                {stale.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <Link href={`/hospitals/${f.id}`} className="min-w-0 hover:text-emerald-300">
                      <span className="block truncate text-[12.5px] font-semibold text-slate-100">{f.name}</span>
                      <span className="block truncate text-[10.5px] text-slate-500">{f.region_name} · {f.reported_by ?? "unknown reporter"}</span>
                    </Link>
                    <span className="shrink-0 text-[11px] font-semibold text-amber-400">{timeAgo(f.last_report_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5">
          <div>
            <p className="section-title">All facilities</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {facilities.length} facilities · sorted by pressure ·{" "}
              <a href="/api/export/facilities.csv" className="link">download CSV</a>
            </p>
          </div>
          <span className="text-[11px] text-slate-500">
            {sim.enabled ? `Demo simulator active (${sim.ticks} ticks)` : "Simulator paused — live feed only"}
          </span>
        </div>
        <div className="scroll-thin max-h-[32rem] overflow-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="sticky top-0 z-10 bg-ink-900/95 text-[10.5px] uppercase tracking-wider text-slate-500 backdrop-blur">
              <tr>
                <th className="px-5 py-2.5 text-left font-semibold">Facility</th>
                <th className="px-3 py-2.5 text-left font-semibold">Region</th>
                <th className="px-3 py-2.5 text-left font-semibold">Type</th>
                <th className="px-3 py-2.5 text-right font-semibold">Beds free</th>
                <th className="w-44 px-3 py-2.5 text-left font-semibold">Occupancy</th>
                <th className="px-3 py-2.5 text-right font-semibold">Reported</th>
                <th className="px-5 py-2.5 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {facilities.map((f) => {
                const meta = STATUS_META[bedStatus(f.occupied, f.capacity)];
                return (
                  <tr key={f.id} className="transition hover:bg-white/[0.03]">
                    <td className="px-5 py-2.5">
                      <Link href={`/hospitals/${f.id}`} className={cx("font-semibold hover:text-emerald-300", meta.text)}>
                        {f.name}
                      </Link>
                      <span className="block text-[10.5px] text-slate-500">{f.town} · {f.district}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-400">{f.region_name}</td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-400">{f.type}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={cx("font-bold tabular-nums", meta.text)}>{formatNumber(f.available)}</span>
                      <span className="block text-[10px] text-slate-600">of {formatNumber(f.capacity)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <OccupancyBar occupied={f.occupied} capacity={f.capacity} height="h-1.5" />
                        </div>
                        <span className="w-8 text-right text-[11px] font-bold tabular-nums text-slate-400">{f.occupancy}%</span>
                      </div>
                    </td>
                    <td className={cx("px-3 py-2.5 text-right text-[11px]", f.stale ? "font-semibold text-amber-400" : "text-slate-500")}>
                      {timeAgo(f.last_report_at)}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <StatusPill occupied={f.occupied} capacity={f.capacity} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {critical.length > 0 && (
        <section className="card card-pad">
          <p className="section-title mb-2">Watch list — {critical.length} facilities above 90%</p>
          <div className="flex flex-wrap gap-1.5">
            {critical.map((f) => (
              <Link
                key={f.id}
                href={`/hospitals/${f.id}`}
                className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-amber-200 ring-1 ring-amber-500/25 transition hover:bg-amber-500/20"
              >
                {f.name} · {f.occupancy}%
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
