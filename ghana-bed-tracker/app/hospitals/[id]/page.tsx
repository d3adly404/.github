import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AlertFeed from "@/components/AlertFeed";
import FacilityMap from "@/components/FacilityMap";
import LiveWards from "@/components/LiveWards";
import SubscribeForm from "@/components/SubscribeForm";
import TrendChart from "@/components/TrendChart";
import { Gauge, StatCard, StatusPill } from "@/components/primitives";
import { STATUS_META, WARD_LABELS, bedStatus, cx, formatKm, formatNumber, haversineKm, timeAgo } from "@/lib/format";
import {
  countSubscribers,
  facilityHistory,
  getFacility,
  getWards,
  listFacilities,
  listRegions,
  recentAlerts,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const facility = getFacility(id);
  if (!facility) return { title: "Facility not found" };
  return {
    title: `${facility.name} — bed availability`,
    description: `${facility.available} of ${facility.capacity} inpatient beds free at ${facility.name}, ${facility.town} (${facility.region_name}). Live occupancy by ward.`,
  };
}

export default async function FacilityPage({ params }: Props) {
  const { id } = await params;
  const facility = getFacility(id);
  if (!facility) notFound();

  const wards = getWards(id);
  const history = facilityHistory(id, 24);
  const alerts = recentAlerts(12, id);
  const subscribers = countSubscribers(id);
  const regions = listRegions();
  const status = bedStatus(facility.occupied, facility.capacity);
  const meta = STATUS_META[status];

  // Nearest facilities that actually have beds — the actionable alternative list.
  const alternatives = listFacilities({ availableOnly: true, sort: "occupancy_asc" })
    .filter((f) => f.id !== facility.id)
    .map((f) => ({ ...f, distance_km: haversineKm(facility.lat, facility.lon, f.lat, f.lon) }))
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, 6);

  const mapFacilities = [facility, ...alternatives.slice(0, 14)];
  const icu = wards.find((w) => w.category === "icu");
  const maternity = wards.find((w) => w.category === "maternity");
  const emergency = wards.find((w) => w.category === "emergency");

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-[11.5px] text-slate-500">
        <Link href="/" className="hover:text-slate-300">Dashboard</Link>
        <span>/</span>
        <Link href="/hospitals" className="hover:text-slate-300">Find a bed</Link>
        <span>/</span>
        <Link href={`/hospitals?region=${facility.region_id}`} className="hover:text-slate-300">{facility.region_name}</Link>
        <span>/</span>
        <span className="truncate text-slate-300">{facility.name}</span>
      </nav>

      {/* Header */}
      <header className={cx("card relative overflow-hidden p-6", status === "full" && "ring-1 ring-rose-500/30")}>
        <span className={cx("absolute inset-y-0 left-0 w-1.5", meta.dot)} />
        <div className="grid gap-6 pl-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{facility.name}</h1>
              <StatusPill occupied={facility.occupied} capacity={facility.capacity} />
            </div>
            <p className="mt-2 text-sm text-slate-400">
              {facility.town} · {facility.district} District · {facility.region_name} Region
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              {[facility.type, facility.ownership, `${facility.capacity} staffed beds`].map((chip) => (
                <span key={chip} className="rounded-lg bg-white/[0.05] px-2.5 py-1 font-semibold text-slate-300 ring-1 ring-white/8">
                  {chip}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-slate-400">
              <a href={`tel:${facility.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 font-semibold text-slate-200 hover:text-emerald-300">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
                </svg>
                {facility.phone}
              </a>
              <a href={`mailto:${facility.email}`} className="hover:text-emerald-300">{facility.email}</a>
              <span className={cx(facility.stale ? "text-amber-400" : "text-slate-500")}>
                {facility.stale ? `⚠ report stale — last updated ${timeAgo(facility.last_report_at)}` : `Updated ${timeAgo(facility.last_report_at)}`}
              </span>
              {facility.reported_by && <span className="text-slate-600">by {facility.reported_by}</span>}
            </div>
          </div>
          <Gauge occupied={facility.occupied} capacity={facility.capacity} />
        </div>

        {status === "full" && (
          <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
            <p className="text-sm font-bold text-rose-200">
              This hospital has no free inpatient beds right now.
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-rose-100/80">
              Subscribe below and we will message you the moment a bed is released — usually within minutes for
              high-turnover wards. The nearest facilities with free beds are listed further down this page. For an
              emergency, call {facility.phone} or dial 112.
            </p>
          </div>
        )}
      </header>

      {/* Key numbers */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Beds free" value={formatNumber(facility.available)} sub={`of ${formatNumber(facility.capacity)} staffed`} tone={facility.available === 0 ? "bad" : "good"} />
        <StatCard label="Occupancy" value={`${facility.occupancy}%`} sub={status === "full" ? "At capacity" : status === "critical" ? "Above the 90% alert line" : "Within normal range"} tone={status === "full" ? "bad" : status === "critical" ? "warn" : "neutral"} />
        <StatCard
          label={icu ? "ICU / HDU free" : "Emergency free"}
          value={icu ? formatNumber(icu.available) : emergency ? formatNumber(emergency.available) : "—"}
          sub={icu ? `${icu.occupied}/${icu.capacity} critical care beds occupied` : emergency ? `${emergency.occupied}/${emergency.capacity} observation beds occupied` : "No critical care unit recorded"}
          tone={icu && icu.available === 0 ? "bad" : "neutral"}
        />
        <StatCard
          label="Maternity free"
          value={maternity ? formatNumber(maternity.available) : "—"}
          sub={maternity ? `${maternity.occupied}/${maternity.capacity} beds occupied` : "No maternity ward recorded"}
          tone={maternity && maternity.available === 0 ? "bad" : "neutral"}
        />
      </section>

      {/* Wards */}
      <LiveWards facilityId={facility.id} wards={wards} />

      {/* Trend + alerts */}
      <section className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <TrendChart history={history} capacity={facility.capacity} />
        <AlertFeed
          initial={alerts}
          limit={10}
          facilityId={facility.id}
          title="Alerts for this facility"
          emptyHint="No alerts recorded for this facility yet. Subscribers are notified whenever a ward runs full or frees a bed."
        />
      </section>

      {/* Alternatives */}
      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-white/8 px-5 py-3.5">
            <p className="section-title">
              {facility.available === 0 ? "Nearest hospitals with beds" : "Other nearby options"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Straight-line distance from {facility.town}. Always phone ahead to confirm.
            </p>
          </div>
          <ul className="divide-y divide-white/5">
            {alternatives.map((a) => {
              const aMeta = STATUS_META[bedStatus(a.occupied, a.capacity)];
              return (
                <li key={a.id}>
                  <Link href={`/hospitals/${a.id}`} className="flex items-center gap-4 px-5 py-3 transition hover:bg-white/[0.04]">
                    <span className={cx("h-8 w-1 shrink-0 rounded-full", aMeta.dot)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-slate-100">{a.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {a.town} · {a.region_name} · {formatKm(a.distance_km)} away
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={cx("block text-base font-extrabold tabular-nums", aMeta.text)}>{a.available}</span>
                      <span className="block text-[10px] uppercase tracking-wider text-slate-500">beds free</span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {alternatives.length === 0 && (
              <li className="px-5 py-8 text-center text-xs text-slate-500">
                No other tracked facility currently reports a free bed. Call {facility.phone} and ask to be placed on the
                waiting list, or dial 112 for ambulance triage.
              </li>
            )}
          </ul>
        </div>

        <FacilityMap
          facilities={mapFacilities}
          center={[facility.lat, facility.lon]}
          zoom={9}
          height={420}
        />
      </section>

      {/* Subscribe */}
      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="card card-pad">
          <p className="section-title">Alerts for this hospital</p>
          <h2 className="mt-2 text-xl font-extrabold tracking-tight text-white">
            Message me when {facility.name.split(" ")[0]} has a bed
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            {subscribers} {subscribers === 1 ? "person is" : "people are"} already watching this facility. Alerts fire
            the moment a ward releases a bed, and warn you if the hospital runs full while you are on your way.
          </p>
          <div className="mt-5 space-y-2 text-[12.5px] text-slate-400">
            <p className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              Choose a ward type to track only that ward (for example maternity or ICU).
            </p>
            <p className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              Set a quiet period so you are not messaged repeatedly for the same situation.
            </p>
            <p className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              Every SMS and WhatsApp alert carries an unsubscribe path — no account needed.
            </p>
          </div>
        </div>

        <SubscribeForm
          facilities={listFacilities().map((f) => ({ id: f.id, name: f.name, region_id: f.region_id, region_name: f.region_name }))}
          regions={regions.map((r) => ({ id: r.id, name: r.name }))}
          wardCategories={Object.entries(WARD_LABELS).map(([wid, label]) => ({ id: wid, label }))}
          defaultFacilityId={facility.id}
        />
      </section>
    </div>
  );
}
