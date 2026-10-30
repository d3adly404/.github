import { Metadata } from "next";
import Link from "next/link";
import AlertFeed from "@/components/AlertFeed";
import FacilityMap from "@/components/FacilityMap";
import SubscribeForm, { TOKEN_KEY } from "@/components/SubscribeForm";
import { OccupancyBar, RegionTable, StatCard, StatusPill } from "@/components/primitives";
import { STATUS_META, WARD_LABELS, bedStatus, cx, formatNumber, timeAgo } from "@/lib/format";
import { listFacilities, listRegions, nationalSummary, recentAlerts } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Live hospital bed availability across Ghana",
};

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const summary = nationalSummary();
  const facilities = listFacilities();
  const worst = facilities.filter((f) => f.capacity > 0).slice(0, 6);
  const freest = [...facilities].sort((a, b) => b.available - a.available || a.occupancy - b.occupancy).slice(0, 6);
  const fullFacilities = facilities.filter((f) => f.capacity > 0 && f.available === 0);
  const alerts = recentAlerts(14);
  const regions = listRegions();

  return (
    <div className="space-y-8">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="card relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot" />
              {summary.facilities} facilities reporting live · {summary.regions.length} regions
            </div>
            <h1 className="text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl lg:text-[2.7rem]">
              Know if there is a bed
              <span className="block bg-gradient-to-r from-emerald-300 via-emerald-200 to-amber-200 bg-clip-text text-transparent">
                before you travel.
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
              GhanaBed tracks inpatient bed availability across Ghana in real time and alerts patients by SMS, WhatsApp,
              e-mail or browser the moment a bed frees up — or warns them a hospital has run full, with the nearest
              alternatives and how far away they are.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href="/hospitals" className="btn-primary">
                Find a bed near me
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <a href="#subscribe" className="btn-ghost">
                Set up an alert
              </a>
              <Link href="/portal" className="btn-ghost">
                I&apos;m hospital staff
              </Link>
            </div>
          </div>

          <div className="card border-white/10 bg-ink-900/50 p-5">
            <p className="section-title mb-4">National bed picture</p>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className={cx("text-5xl font-extrabold leading-none tabular-nums", summary.available === 0 ? "text-rose-300" : "text-emerald-300")}>
                  {formatNumber(summary.available)}
                </p>
                <p className="mt-1.5 text-xs uppercase tracking-wider text-slate-500">
                  beds free right now
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums text-slate-200">{summary.occupancy}%</p>
                <p className="text-[11px] text-slate-500">occupied nationally</p>
              </div>
            </div>
            <div className="mt-4">
              <OccupancyBar occupied={summary.occupied} capacity={summary.capacity} height="h-2.5" showTicks />
              <p className="mt-2 text-[11px] text-slate-500">
                {formatNumber(summary.occupied)} occupied of {formatNumber(summary.capacity)} staffed beds
              </p>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2.5 border-t border-white/8 pt-4 text-center">
              <div>
                <p className="text-xl font-extrabold tabular-nums text-rose-300">{summary.full}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Facilities full</p>
              </div>
              <div>
                <p className="text-xl font-extrabold tabular-nums text-amber-300">{summary.critical}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">At 90%+</p>
              </div>
              <div>
                <p className="text-xl font-extrabold tabular-nums text-slate-300">{summary.stale}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Stale reports</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stat strip ───────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Beds available"
          value={formatNumber(summary.available)}
          sub={`${summary.occupancy}% national occupancy`}
          tone={summary.available < summary.capacity * 0.1 ? "bad" : "good"}
        />
        <StatCard
          label="Hospitals with no beds"
          value={summary.full}
          sub={fullFacilities.length ? fullFacilities[0].name : "None — every facility has capacity"}
          tone={summary.full > 0 ? "bad" : "good"}
          href="/hospitals?status=full"
        />
        <StatCard
          label="Almost full (90%+)"
          value={summary.critical}
          sub="Expect admission delays at these"
          tone="warn"
          href="/hospitals?status=critical"
        />
        <StatCard
          label="Facilities tracked"
          value={summary.facilities}
          sub={`${summary.stale} with a stale report (>90 min)`}
          href="/national"
        />
      </section>

      {/* ── Map + feed ───────────────────────────────────────────── */}
      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <FacilityMap facilities={facilities} height={460} />
        <AlertFeed initial={alerts} limit={12} />
      </section>

      {/* ── Pressure lists ───────────────────────────────────────── */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
            <p className="section-title">Under most pressure</p>
            <Link href="/hospitals?status=critical" className="text-[11px] font-semibold text-emerald-300 hover:underline">
              See all
            </Link>
          </div>
          <ul className="divide-y divide-white/5">
            {worst.map((f) => {
              const meta = STATUS_META[bedStatus(f.occupied, f.capacity)];
              return (
                <li key={f.id}>
                  <Link href={`/hospitals/${f.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-white/[0.04]">
                    <span className={cx("h-9 w-1 shrink-0 rounded-full", meta.dot)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-slate-100">{f.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {f.town} · {f.region_name} · updated {timeAgo(f.last_report_at)}
                      </span>
                      <span className="mt-2 block">
                        <OccupancyBar occupied={f.occupied} capacity={f.capacity} height="h-1.5" />
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={cx("block text-lg font-extrabold tabular-nums", meta.text)}>
                        {f.available === 0 ? "FULL" : f.available}
                      </span>
                      <span className="block text-[10px] uppercase tracking-wider text-slate-500">{f.occupancy}%</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
            <p className="section-title">Most beds free right now</p>
            <Link href="/hospitals?available=1&sort=available_desc" className="text-[11px] font-semibold text-emerald-300 hover:underline">
              See all
            </Link>
          </div>
          <ul className="divide-y divide-white/5">
            {freest.map((f) => (
              <li key={f.id}>
                <Link href={`/hospitals/${f.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-white/[0.04]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-slate-100">{f.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {f.town} · {f.region_name} · {f.type}
                    </span>
                  </span>
                  <StatusPill occupied={f.occupied} capacity={f.capacity} />
                  <span className="w-14 shrink-0 text-right text-sm font-bold tabular-nums text-slate-300">
                    {formatNumber(f.available)}
                    <span className="block text-[10px] font-medium text-slate-600">of {formatNumber(f.capacity)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Regions ──────────────────────────────────────────────── */}
      <section>
        <RegionTable regions={summary.regions} />
      </section>

      {/* ── Subscribe ────────────────────────────────────────────── */}
      <section id="subscribe" className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <div className="card card-pad">
          <p className="section-title">Never queue for a bed you cannot get</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white">
            Tell me when a bed frees up
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Choose a hospital (or a whole region), pick how we should reach you, and GhanaBed messages you the instant
            the situation changes. When a facility is full we also send the nearest hospitals that have beds, with
            distances and admissions numbers.
          </p>
          <ul className="mt-5 space-y-2.5 text-[13px] text-slate-300">
            {[
              ["SMS", "Delivered on Hubtel with Arkesel as fallback — works on any phone, no data needed."],
              ["WhatsApp", "Rich alerts with the facility link, sent through the Meta WhatsApp Cloud API."],
              ["E-mail", "Full detail: ward breakdown, alternatives and admission contacts."],
              ["Browser push", "Web Push (VAPID) alerts that reach the device even with the tab closed."],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                <span>
                  <strong className="font-semibold text-slate-100">{title}</strong>
                  <span className="text-slate-400"> — {body}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-slate-400">
            <p className="mb-1 font-semibold text-slate-300">For ambulance crews &amp; referral officers</p>
            Subscribe at national scope with “every status change” to get a continuous feed of bed releases across all
            regions, or use the <Link href="/national" className="link">national oversight view</Link> for the whole
            picture on one screen.
          </div>
        </div>

        <SubscribeForm
          facilities={facilities.map((f) => ({ id: f.id, name: f.name, region_id: f.region_id, region_name: f.region_name }))}
          regions={regions.map((r) => ({ id: r.id, name: r.name }))}
          wardCategories={Object.entries(WARD_LABELS).map(([id, label]) => ({ id, label }))}
        />
      </section>

      {/* ── Ward categories explainer ────────────────────────────── */}
      <section className="card card-pad">
        <p className="section-title mb-3">Tracked ward types</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(WARD_LABELS).map(([id, label]) => (
            <Link
              key={id}
              href={`/hospitals?category=${id}&available=1`}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-200"
            >
              {label}
            </Link>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
          Your alert link is stored in this browser (<code className="text-slate-400">{TOKEN_KEY}</code>) so you can
          pause, edit or delete it later from <Link href="/alerts" className="link">My alerts</Link>.
        </p>
      </section>
    </div>
  );
}
