"use client";

/**
 * Patient subscription form — the "tell me when a bed is free" flow.
 * Works for SMS, WhatsApp, e-mail, browser push and in-app alerts.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cx, wardLabel } from "@/lib/format";
import { registerPush } from "@/lib/push-client";
import type { ChannelId } from "@/lib/types";

export const TOKEN_KEY = "ghana_bed_token";

interface Props {
  facilities: { id: string; name: string; region_id: string; region_name: string }[];
  regions: { id: string; name: string }[];
  wardCategories: { id: string; label: string }[];
  defaultFacilityId?: string | null;
  compact?: boolean;
}

const CHANNELS: { id: ChannelId; label: string; hint: string; placeholder: string; icon: string }[] = [
  { id: "sms", label: "SMS", hint: "Works on any phone", placeholder: "024 412 3456", icon: "📱" },
  { id: "whatsapp", label: "WhatsApp", hint: "Rich alerts + map link", placeholder: "020 955 4311", icon: "💬" },
  { id: "email", label: "E-mail", hint: "Full detail + alternatives", placeholder: "you@example.com", icon: "✉️" },
  { id: "browser", label: "Browser push", hint: "This device, even when closed", placeholder: "No address needed", icon: "🔔" },
  { id: "inapp", label: "In-app only", hint: "No contact details stored", placeholder: "No address needed", icon: "🖥️" },
];

const EVENTS: { id: string; label: string; hint: string }[] = [
  { id: "bed_freed", label: "A bed becomes free", hint: "The alert most patients want" },
  { id: "facility_full", label: "The hospital runs full", hint: "Warn me before I travel" },
  { id: "ward_full", label: "My ward type runs full", hint: "e.g. maternity or ICU" },
  { id: "high_occupancy", label: "Occupancy crosses my threshold", hint: "Early warning" },
  { id: "any_change", label: "Every status change", hint: "Noisy — for carers & referrals" },
];

export default function SubscribeForm({ facilities, regions, wardCategories, defaultFacilityId, compact }: Props) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<ChannelId>("sms");
  const [contact, setContact] = useState("");
  const [scope, setScope] = useState<"facility" | "region" | "national">(defaultFacilityId ? "facility" : "facility");
  const [facilityId, setFacilityId] = useState(defaultFacilityId ?? facilities[0]?.id ?? "");
  const [regionId, setRegionId] = useState(regions[0]?.id ?? "");
  const [wardCategory, setWardCategory] = useState<string>("");
  const [events, setEvents] = useState<string[]>(["bed_freed", "facility_full"]);
  const [threshold, setThreshold] = useState(90);
  const [cooldown, setCooldown] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; push?: string } | null>(null);

  useEffect(() => {
    if (defaultFacilityId) {
      setScope("facility");
      setFacilityId(defaultFacilityId);
    }
  }, [defaultFacilityId]);

  const selectedFacility = useMemo(() => facilities.find((f) => f.id === facilityId), [facilities, facilityId]);
  const needsContact = channel === "sms" || channel === "whatsapp" || channel === "email";
  const channelMeta = CHANNELS.find((c) => c.id === channel)!;

  function toggleEvent(id: string) {
    setEvents((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (needsContact && !contact.trim()) {
      setError(`Enter the ${channelMeta.label.toLowerCase()} address we should send alerts to.`);
      return;
    }
    if (!events.length) {
      setError("Pick at least one alert type.");
      return;
    }
    setBusy(true);
    try {
      const existingToken = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          channel,
          contact,
          facilityId: scope === "facility" ? facilityId : null,
          regionId: scope === "region" ? regionId : null,
          wardCategory: wardCategory || null,
          notifyOn: events,
          threshold,
          cooldownMinutes: cooldown,
          token: existingToken ?? undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; token?: string; message?: string; subscription?: { id: number } };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save your alert");

      if (data.token && typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, data.token);

      let pushDetail: string | undefined;
      if (channel === "browser" && data.subscription?.id && data.token) {
        const push = await registerPush(data.subscription.id, data.token);
        pushDetail = push.detail;
      }

      setDone({ message: data.message ?? "Alert created.", push: pushDetail });
      setName("");
      setContact("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card card-pad border-emerald-500/30 bg-emerald-500/[0.07]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-300">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-200">Your alert is live</p>
            <p className="mt-1 text-xs leading-relaxed text-emerald-100/80">{done.message}</p>
            {done.push && <p className="mt-1 text-xs leading-relaxed text-emerald-100/70">{done.push}</p>}
            <p className="mt-2 text-[11px] text-emerald-100/60">
              Watching{" "}
              <strong className="text-emerald-100">
                {scope === "facility" ? selectedFacility?.name ?? "this facility" : scope === "region" ? `all facilities in ${regions.find((r) => r.id === regionId)?.name}` : "all facilities in Ghana"}
              </strong>
              {wardCategory ? ` · ${wardLabel(wardCategory)}` : ""} · {events.length} alert type{events.length === 1 ? "" : "s"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/alerts" className="btn-primary btn-sm">
                Manage my alerts
              </Link>
              <button className="btn-ghost btn-sm" onClick={() => setDone(null)}>
                Add another alert
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={cx("card", compact ? "p-4" : "card-pad")}>
      <div className="mb-4">
        <p className="section-title">Get alerted</p>
        <p className="mt-1 text-xs text-slate-400">
          We message you the moment a bed frees up — or warn you before you travel to a full hospital.
        </p>
      </div>

      <div className="grid gap-4">
        <div>
          <label className="label" htmlFor="sub-name">Your name</label>
          <input
            id="sub-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ama Serwaa"
            required
            minLength={2}
          />
        </div>

        <div>
          <span className="label">How should we reach you?</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannel(c.id)}
                className={cx(
                  "rounded-xl border px-3 py-2.5 text-left transition",
                  channel === c.id
                    ? "border-emerald-400/60 bg-emerald-500/12 ring-2 ring-emerald-400/20"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]",
                )}
              >
                <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-100">
                  <span aria-hidden>{c.icon}</span> {c.label}
                </span>
                <span className="mt-0.5 block text-[10.5px] leading-tight text-slate-500">{c.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {needsContact && (
          <div>
            <label className="label" htmlFor="sub-contact">
              {channel === "email" ? "E-mail address" : "Ghana mobile number"}
            </label>
            <input
              id="sub-contact"
              className="input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={channelMeta.placeholder}
              inputMode={channel === "email" ? "email" : "tel"}
              type={channel === "email" ? "email" : "tel"}
              required
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              {channel === "email"
                ? "Used only for these alerts. Unsubscribe from any message."
                : "Standard network rates apply. Reply STOP to opt out at any time."}
            </p>
          </div>
        )}

        <div>
          <span className="label">Watch</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(["facility", "region", "national"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-[11.5px] font-semibold capitalize transition",
                  scope === s ? "bg-white/12 text-white ring-1 ring-white/20" : "bg-white/[0.04] text-slate-400 hover:text-slate-200",
                )}
              >
                {s === "facility" ? "One hospital" : s === "region" ? "A whole region" : "All of Ghana"}
              </button>
            ))}
          </div>

          {scope === "facility" && (
            <select className="input" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {f.region_name}
                </option>
              ))}
            </select>
          )}
          {scope === "region" && (
            <select className="input" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} Region
                </option>
              ))}
            </select>
          )}
          {scope === "national" && (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11.5px] text-slate-400">
              You will be alerted for any tracked facility in Ghana — useful for referral officers and ambulance crews.
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="sub-ward">Ward type (optional)</label>
          <select id="sub-ward" className="input" value={wardCategory} onChange={(e) => setWardCategory(e.target.value)}>
            <option value="">Any ward in the facility</option>
            {wardCategories.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="label">Alert me when</span>
          <div className="grid gap-1.5">
            {EVENTS.map((ev) => (
              <label
                key={ev.id}
                className={cx(
                  "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition",
                  events.includes(ev.id)
                    ? "border-emerald-400/40 bg-emerald-500/[0.08]"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                  checked={events.includes(ev.id)}
                  onChange={() => toggleEvent(ev.id)}
                />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-slate-100">{ev.label}</span>
                  <span className="block text-[10.5px] text-slate-500">{ev.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="sub-threshold">
              Occupancy threshold · {threshold}%
            </label>
            <input
              id="sub-threshold"
              type="range"
              min={50}
              max={99}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <p className="mt-1 text-[10.5px] text-slate-500">Only used for the “high occupancy” alert.</p>
          </div>
          <div>
            <label className="label" htmlFor="sub-cooldown">
              Quiet period
            </label>
            <select id="sub-cooldown" className="input" value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))}>
              <option value={5}>At most every 5 minutes</option>
              <option value={15}>At most every 15 minutes</option>
              <option value={30}>At most every 30 minutes</option>
              <option value={60}>At most hourly</option>
              <option value={180}>At most every 3 hours</option>
            </select>
            <p className="mt-1 text-[10.5px] text-slate-500">Stops repeated alerts for the same situation.</p>
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs font-semibold text-rose-200">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Setting up your alert…" : `Create my ${channelMeta.label} alert`}
        </button>
        <p className="text-center text-[10.5px] leading-relaxed text-slate-500">
          Alerts are free. We store only what is needed to deliver them, and every message carries an unsubscribe path.
        </p>
      </div>
    </form>
  );
}
