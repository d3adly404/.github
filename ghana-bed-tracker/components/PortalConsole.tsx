"use client";

/**
 * Staff console: report occupancy, inject a scenario for drills, toggle the
 * demo simulator and broadcast a notice to subscribed patients.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LiveWards from "./LiveWards";
import { Gauge, StatCard, StatusPill } from "./primitives";
import { cx, formatNumber, timeAgo } from "@/lib/format";
import type { Facility, Role, Ward } from "@/lib/types";

interface Props {
  facility: Facility;
  wards: Ward[];
  role: Role;
  userName: string;
  subscriberCount: number;
  simulator: { enabled: boolean; running: boolean; intervalSeconds: number; ticks: number; lastTickAt: number | null };
  scenarios: { id: string; label: string; description: string }[];
  notifyMode: string;
  canBroadcast: boolean;
}

export default function PortalConsole({
  facility,
  wards,
  role,
  userName,
  subscriberCount,
  simulator,
  scenarios,
  notifyMode,
  canBroadcast,
}: Props) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [simOn, setSimOn] = useState(simulator.enabled);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");

  const totals = wards.reduce(
    (acc, w) => ({ capacity: acc.capacity + w.capacity, occupied: acc.occupied + w.occupied, full: acc.full + (w.available === 0 && w.capacity > 0 ? 1 : 0) }),
    { capacity: 0, occupied: 0, full: 0 },
  );
  const available = Math.max(0, totals.capacity - totals.occupied);

  function flash(msg: string) {
    setNotice(msg);
    setError(null);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 6000);
  }

  async function runScenario(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/${facility.id}/scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: id }),
      });
      const data = (await res.json()) as { ok?: boolean; note?: string; error?: string; changed?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Scenario failed");
      flash(`${data.note} · ${data.changed} wards updated · subscribers notified automatically`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scenario failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggleSimulator() {
    setBusy("simulator");
    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !simOn }),
      });
      const data = (await res.json()) as { ok?: boolean; status?: { enabled: boolean }; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not change simulator state");
      setSimOn(Boolean(data.status?.enabled));
      flash(data.status?.enabled ? "Simulator resumed — occupancy will drift realistically." : "Simulator paused — only real staff updates will change counts.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change simulator state");
    } finally {
      setBusy(null);
    }
  }

  async function tickNow() {
    setBusy("tick");
    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tick: true }),
      });
      const data = (await res.json()) as { ok?: boolean; changes?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Tick failed");
      flash(`Applied ${data.changes} simulated ward change${data.changes === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tick failed");
    } finally {
      setBusy(null);
    }
  }

  async function sendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    setBusy("broadcast");
    setError(null);
    try {
      const res = await fetch(`/api/facilities/${facility.id}/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: broadcastTitle, message: broadcastBody }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; delivery?: { attempted: number; channels: Record<string, number> } };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Broadcast failed");
      const channels = Object.entries(data.delivery?.channels ?? {})
        .map(([c, n]) => `${n} ${c}`)
        .join(", ");
      flash(`Broadcast delivered to ${data.delivery?.attempted ?? 0} subscriber(s)${channels ? ` (${channels})` : ""}.`);
      setBroadcastTitle("");
      setBroadcastBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Broadcast failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="slide-up flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-200">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-200">{error}</div>
      )}

      {/* Facility summary */}
      <section className="card relative overflow-hidden p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold tracking-tight text-white">{facility.name}</h1>
              <StatusPill occupied={facility.occupied} capacity={facility.capacity} />
            </div>
            <p className="mt-1.5 text-sm text-slate-400">
              {facility.town} · {facility.region_name} Region · signed in as{" "}
              <span className="font-semibold text-slate-200">{userName}</span> ({role.replace("_", " ")})
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {subscriberCount} patient alert{subscriberCount === 1 ? "" : "s"} are watching this facility ·{" "}
              {notifyMode === "live" ? "messages deliver through configured providers" : "messages render in the simulator outbox"} ·{" "}
              last report {timeAgo(facility.last_report_at)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/hospitals/${facility.id}`} className="btn-ghost btn-sm">
                View patient page
              </Link>
              <Link href="/portal/outbox" className="btn-ghost btn-sm">
                Notification outbox
              </Link>
              {role === "national" && (
                <Link href="/national" className="btn-ghost btn-sm">
                  National oversight
                </Link>
              )}
            </div>
          </div>
          <Gauge occupied={totals.occupied} capacity={totals.capacity} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Beds free" value={formatNumber(available)} sub={`of ${formatNumber(totals.capacity)} staffed`} tone={available === 0 ? "bad" : "good"} />
        <StatCard label="Occupancy" value={`${facility.occupancy}%`} sub={facility.occupancy >= 90 ? "Above alert threshold" : "Within normal range"} tone={facility.occupancy >= 90 ? "warn" : "neutral"} />
        <StatCard label="Wards at capacity" value={totals.full} sub={`of ${wards.length} reporting wards`} tone={totals.full > 0 ? "bad" : "good"} />
        <StatCard label="Patients alerted" value={subscriberCount} sub="Subscribers for this facility" />
      </section>

      {/* Ward reporting */}
      <LiveWards
        facilityId={facility.id}
        wards={wards}
        editable
        actorName={userName}
        onUpdated={flash}
        onError={(m) => setError(m)}
      />

      <section className="grid gap-5 lg:grid-cols-2">
        {/* Scenarios */}
        <div className="card card-pad">
          <p className="section-title">Drills &amp; scenario injector</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Apply a scripted pressure event to this facility. Alerts fire exactly as they would for real admissions —
            useful for training ward staff and testing the notification pipeline.
          </p>
          <div className="mt-4 space-y-2">
            {scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => runScenario(s.id)}
                disabled={busy !== null || !canBroadcast}
                className={cx(
                  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-left transition",
                  busy === s.id ? "opacity-60" : "hover:border-amber-400/40 hover:bg-amber-500/10",
                )}
              >
                <span className="block text-[13px] font-bold text-slate-100">
                  {s.label}
                  {busy === s.id && <span className="ml-2 text-[11px] font-semibold text-amber-300">running…</span>}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{s.description}</span>
              </button>
            ))}
          </div>
          {!canBroadcast && (
            <p className="mt-3 text-[11px] text-slate-500">
              Ward staff can report counts; scenarios and broadcasts need a facility administrator or national account.
            </p>
          )}
        </div>

        <div className="space-y-5">
          {/* Broadcast */}
          <form onSubmit={sendBroadcast} className="card card-pad">
            <p className="section-title">Broadcast to subscribers</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
              Send a one-off notice to everyone watching this facility — for example “maternity closed for sterilisation
              until 18:00” or “please use the alternative entrance”.
            </p>
            <div className="mt-4 space-y-3">
              <input
                className="input"
                placeholder="Headline (e.g. Maternity ward temporarily closed)"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                maxLength={90}
                disabled={!canBroadcast}
                required
              />
              <textarea
                className="input min-h-[86px] resize-y"
                placeholder="Message patients will receive on their chosen channel…"
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                maxLength={480}
                disabled={!canBroadcast}
                required
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">{broadcastBody.length}/480 characters</span>
                <button type="submit" className="btn-primary btn-sm" disabled={busy !== null || !canBroadcast}>
                  {busy === "broadcast" ? "Sending…" : `Send to ${subscriberCount} subscriber${subscriberCount === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </form>

          {/* Simulator */}
          <div className="card card-pad">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="section-title">Demo occupancy simulator</p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  Generates realistic admissions and discharges across all tracked facilities every{" "}
                  {simulator.intervalSeconds}s, so the alerting pipeline can be demonstrated end to end. Turn it off when
                  a real HIS/GHS feed is connected.
                </p>
              </div>
              <button
                onClick={toggleSimulator}
                disabled={busy !== null || role === "ward_staff"}
                role="switch"
                aria-checked={simOn}
                className={cx(
                  "relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40",
                  simOn ? "bg-emerald-500/80" : "bg-white/15",
                )}
              >
                <span
                  className={cx(
                    "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                    simOn ? "left-6" : "left-1",
                  )}
                />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button onClick={tickNow} disabled={busy !== null} className="btn-ghost btn-sm">
                {busy === "tick" ? "Applying…" : "Run one tick now"}
              </button>
              <span className="text-[11px] text-slate-500">
                {simulator.ticks} ticks applied
                {simulator.lastTickAt ? ` · last ${timeAgo(simulator.lastTickAt)}` : ""}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
