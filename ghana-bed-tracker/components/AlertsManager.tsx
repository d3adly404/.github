"use client";

/**
 * "My alerts" — a patient's own subscriptions and delivery history.
 * Identity is the unguessable token stored in the browser (no password needed),
 * which is also what every SMS/WhatsApp/e-mail unsubscribe link carries.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SubscribeForm, { TOKEN_KEY } from "./SubscribeForm";
import { EmptyState, SeverityDot } from "./primitives";
import { CHANNEL_LABELS, EVENT_LABELS, cx, formatDateTime, timeAgo, wardLabel } from "@/lib/format";
import { registerPush } from "@/lib/push-client";
import { useLive } from "@/lib/live-client";
import type { NotificationRecord, Subscription } from "@/lib/types";

interface Props {
  facilities: { id: string; name: string; region_id: string; region_name: string }[];
  regions: { id: string; name: string }[];
  wardCategories: { id: string; label: string }[];
}

type SubView = Subscription & {
  facility_name: string | null;
  region_name: string | null;
  ward_label: string;
  channel_label: string;
  events: string[];
};

export default function AlertsManager({ facilities, regions, wardCategories }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [subs, setSubs] = useState<SubView[]>([]);
  const [notes, setNotes] = useState<(NotificationRecord & { facility_name: string | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useLive();

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const [subsRes, notesRes] = await Promise.all([
        fetch(`/api/subscriptions?token=${encodeURIComponent(t)}`),
        fetch(`/api/notifications?token=${encodeURIComponent(t)}&limit=25`),
      ]);
      const subsData = (await subsRes.json()) as { subscriptions?: SubView[] };
      const notesData = (await notesRes.json()) as { notifications?: (NotificationRecord & { facility_name: string | null })[] };
      setSubs(subsData.subscriptions ?? []);
      setNotes(notesRes.ok ? notesData.notifications ?? [] : []);
    } catch {
      setError("Could not load your alerts. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("token");
    const stored = localStorage.getItem(TOKEN_KEY);
    const t = fromUrl || stored;
    if (fromUrl && fromUrl !== stored) localStorage.setItem(TOKEN_KEY, fromUrl);
    if (t) {
      setToken(t);
      void load(t);
    } else {
      setLoading(false);
    }
  }, [load]);

  // Refresh the delivery list when new messages arrive on the live stream.
  useEffect(() => {
    if (token && live.lastEventKind === "alert") {
      const t = setTimeout(() => void load(token), 900);
      return () => clearTimeout(t);
    }
  }, [token, live.lastEventKind, live.updatedAt, load]);

  async function patch(id: number, body: Record<string, unknown>, message: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/subscriptions/${id}?token=${encodeURIComponent(token ?? "")}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, token }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Update failed");
      setNotice(message);
      await load(token!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/subscriptions/${id}?token=${encodeURIComponent(token ?? "")}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not delete");
      setNotice("Alert deleted. You will no longer be messaged.");
      await load(token!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusyId(null);
    }
  }

  async function enablePush(id: number) {
    setBusyId(id);
    const res = await registerPush(id, token!);
    setNotice(res.detail);
    if (res.mode === "web-push") await load(token!);
    setBusyId(null);
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading your alerts…</p>;
  }

  if (!token || (!subs.length && !loading)) {
    return (
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="card card-pad">
          <p className="section-title">No alerts yet</p>
          <h2 className="mt-2 text-xl font-extrabold tracking-tight text-white">Set up your first alert</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Tell us how to reach you and which hospital (or region) matters. We message you the moment a bed frees up —
            and warn you before you travel to a hospital that has run full.
          </p>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Already subscribed on another device? Open the link from any alert message we sent you — it carries your
            personal manage-alerts token.
          </p>
          {error && <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
        </div>
        <SubscribeForm facilities={facilities} regions={regions} wardCategories={wardCategories} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="slide-up flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 font-bold opacity-70 hover:opacity-100" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">{error}</div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {subs.map((s) => {
          const scope = s.facility_id
            ? s.facility_name ?? "Facility"
            : s.region_id
              ? `${regions.find((r) => r.id === s.region_id)?.name ?? s.region_name ?? "Region"} Region (all facilities)`
              : "All facilities in Ghana";
          return (
            <article
              key={s.id}
              className={cx("card card-pad transition", !s.active && "opacity-60")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-slate-100">{scope}</p>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    {CHANNEL_LABELS[s.channel] ?? s.channel} · {s.contact.startsWith("browser:") || s.channel === "inapp" ? "this device" : s.contact}
                    {s.ward_category ? ` · ${wardLabel(s.ward_category)}` : " · any ward"}
                  </p>
                </div>
                <span
                  className={cx(
                    "pill shrink-0",
                    s.active ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30" : "bg-white/5 text-slate-400 ring-white/10",
                  )}
                >
                  <span className={cx("h-1.5 w-1.5 rounded-full", s.active ? "bg-emerald-400" : "bg-slate-500")} />
                  {s.active ? "Active" : "Paused"}
                </span>
              </div>

              <div className="mt-3.5 flex flex-wrap gap-1.5">
                {s.events.map((e) => (
                  <span key={e} className="rounded-lg bg-white/[0.05] px-2 py-1 text-[10.5px] font-semibold text-slate-300 ring-1 ring-white/8">
                    {EVENT_LABELS[e] ?? e}
                  </span>
                ))}
              </div>

              <dl className="mt-3.5 grid grid-cols-2 gap-2 border-t border-white/8 pt-3 text-[11px] text-slate-500">
                <div>
                  <dt className="uppercase tracking-wider">Threshold</dt>
                  <dd className="mt-0.5 font-semibold text-slate-300">{s.threshold}% occupancy</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wider">Quiet period</dt>
                  <dd className="mt-0.5 font-semibold text-slate-300">{s.cooldown_minutes} min</dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="btn-ghost btn-sm"
                  disabled={busyId === s.id}
                  onClick={() => patch(s.id, { active: !s.active }, s.active ? "Alert paused." : "Alert resumed.")}
                >
                  {s.active ? "Pause" : "Resume"}
                </button>
                {s.channel === "browser" && (
                  <button className="btn-ghost btn-sm" disabled={busyId === s.id} onClick={() => enablePush(s.id)}>
                    Enable device push
                  </button>
                )}
                <label className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
                  Quiet period
                  <select
                    className="input w-auto py-1 text-[11px]"
                    value={s.cooldown_minutes}
                    disabled={busyId === s.id}
                    onChange={(e) => patch(s.id, { cooldownMinutes: Number(e.target.value) }, "Quiet period updated.")}
                  >
                    {[5, 15, 30, 60, 180].map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn-ghost btn-sm border-rose-500/25 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                  disabled={busyId === s.id}
                  onClick={() => remove(s.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
            <p className="section-title">Messages we sent you</p>
            <span className="text-[11px] text-slate-500">{notes.length} recent</span>
          </div>
          {notes.length === 0 ? (
            <EmptyState
              title="No alerts delivered yet"
              hint="You will see every SMS, WhatsApp, e-mail and push message here the moment it is sent."
            />
          ) : (
            <ul className="scroll-thin max-h-[28rem] divide-y divide-white/5 overflow-y-auto">
              {notes.map((n) => (
                <li key={n.id} className="px-5 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5">
                      <SeverityDot severity={n.severity} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-slate-100">{n.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">{n.body}</p>
                      <p className="mt-1.5 text-[10.5px] uppercase tracking-wider text-slate-500">
                        {CHANNEL_LABELS[n.channel] ?? n.channel} · {n.provider} · {n.status} · {formatDateTime(Number(n.created_at))}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <SubscribeForm facilities={facilities} regions={regions} wardCategories={wardCategories} compact />
          <div className="card card-pad">
            <p className="section-title mb-2">Your alert link</p>
            <p className="break-all rounded-xl bg-ink-900/70 px-3 py-2.5 font-mono text-[11px] text-slate-400 ring-1 ring-white/8">
              /alerts?token={token}
            </p>
            <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
              Keep this link — it is how you manage alerts from any device, and it is included in every message we send.
              Anyone with the link can change these alerts, so do not share it publicly.
            </p>
            <Link href="/hospitals" className="btn-ghost btn-sm mt-3 w-full">
              Browse hospitals
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
