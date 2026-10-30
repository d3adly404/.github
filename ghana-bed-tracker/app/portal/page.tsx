import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PortalConsole from "@/components/PortalConsole";
import { currentUser } from "@/lib/auth";
import { formatDateTime, timeAgo } from "@/lib/format";
import { notifyConfig } from "@/lib/notifications/config";
import { countSubscribers, getFacility, getWards, listAudit, listFacilities, listSubscriptions, recentAlerts } from "@/lib/queries";
import { SCENARIOS, simulatorStatus } from "@/lib/simulator";

export const metadata: Metadata = { title: "Staff portal" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ facility?: string }>;
}

export default async function PortalPage({ searchParams }: Props) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const all = listFacilities({ sort: "name" });

  // National users can pick any facility; staff are pinned to their own.
  const facilityId =
    user.role === "national" ? sp.facility ?? all[0]?.id ?? "" : user.facility_id ?? all[0]?.id ?? "";
  const facility = getFacility(facilityId);
  if (!facility) redirect("/login");

  const wards = getWards(facility.id);
  const subscribers = listSubscriptions({ facilityId: facility.id });
  const alerts = recentAlerts(8, facility.id);
  const audit = listAudit(12);
  const sim = simulatorStatus();
  const cfg = notifyConfig();
  const canBroadcast = user.role === "facility_admin" || user.role === "national";

  return (
    <div className="space-y-6">
      {user.role === "national" && (
        <form className="card card-pad flex flex-wrap items-end gap-3" action="/portal" method="get">
          <div className="min-w-[18rem] flex-1">
            <label className="label" htmlFor="facility">Facility</label>
            <select id="facility" name="facility" className="input" defaultValue={facility.id}>
              {all.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {f.region_name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-ghost">
            Open facility console
          </button>
          <p className="w-full text-[11px] text-slate-500">
            Signed in with national oversight — you can open any facility&apos;s reporting console.
          </p>
        </form>
      )}

      <PortalConsole
        facility={facility}
        wards={wards}
        role={user.role}
        userName={user.name}
        subscriberCount={countSubscribers(facility.id)}
        simulator={sim}
        scenarios={SCENARIOS}
        notifyMode={cfg.mode}
        canBroadcast={canBroadcast}
      />

      <section className="grid gap-5 lg:grid-cols-2">
        {/* Subscribers */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
            <p className="section-title">Patients watching this facility</p>
            <span className="text-[11px] text-slate-500">{subscribers.length} active</span>
          </div>
          {subscribers.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-500">
              Nobody has subscribed to this facility yet. Share the{" "}
              <Link href={`/hospitals/${facility.id}`} className="link">patient page</Link> link at the admissions desk.
            </p>
          ) : (
            <ul className="scroll-thin max-h-80 divide-y divide-white/5 overflow-y-auto">
              {subscribers.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[11px] font-bold uppercase text-slate-300">
                    {s.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-slate-100">{s.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {s.channel.toUpperCase()}
                      {s.contact.startsWith("browser:") || s.channel === "inapp" ? "" : ` · ${s.contact}`}
                      {s.ward_category ? ` · ${s.ward_category}` : ""} · {s.notify_on.split(",").length} alert type(s)
                    </span>
                  </span>
                  <span className="shrink-0 text-[10.5px] uppercase tracking-wider text-slate-600">
                    joined {timeAgo(s.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent alerts */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
            <p className="section-title">Alerts triggered here</p>
            <Link href="/portal/outbox" className="text-[11px] font-semibold text-emerald-300 hover:underline">
              Open outbox →
            </Link>
          </div>
          {alerts.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-500">
              No alerts yet. They fire automatically when a ward fills, frees a bed, or the facility crosses its
              occupancy threshold.
            </p>
          ) : (
            <ul className="scroll-thin max-h-80 divide-y divide-white/5 overflow-y-auto">
              {alerts.map((a) => (
                <li key={`${a.id}-${a.ts}`} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-semibold leading-snug text-slate-100">{a.title}</p>
                    <span className="shrink-0 text-[10.5px] uppercase tracking-wider text-slate-500">{timeAgo(a.ts)}</span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    {a.notified > 0 ? `${a.notified} subscriber(s) notified · ` : "no subscribers matched · "}
                    {formatDateTime(a.ts)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Audit */}
      <section className="card overflow-hidden">
        <div className="border-b border-white/8 px-5 py-3.5">
          <p className="section-title">Activity log</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Every occupancy change is attributable — who reported it, when, and why.
          </p>
        </div>
        {audit.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-slate-500">
            No activity recorded yet. Report a ward change above and it will appear here.
          </p>
        ) : (
          <ul className="scroll-thin max-h-72 divide-y divide-white/5 overflow-y-auto">
            {audit.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-[12px]">
                <span className="font-mono text-[10.5px] uppercase tracking-wider text-slate-600">{formatDateTime(entry.ts)}</span>
                <span className="font-semibold text-slate-200">{entry.actor}</span>
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {entry.action}
                </span>
                <span className="min-w-0 flex-1 text-slate-400">{entry.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
