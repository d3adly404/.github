"use client";

/**
 * Notification outbox — the "what did patients actually receive?" screen.
 *
 * In simulator mode every entry shows the exact provider request that would have
 * been sent (Hubtel / Arkesel / SMTP / Meta Cloud API / Web Push), so the
 * delivery pipeline can be verified without outbound network access.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CHANNEL_LABELS, EVENT_LABELS, cx, formatDateTime, timeAgo } from "@/lib/format";
import { useLive } from "@/lib/live-client";
import type { NotificationRecord } from "@/lib/types";

interface Props {
  initial: (NotificationRecord & { facility_name: string | null })[];
  mode: string;
}

type Row = NotificationRecord & { facility_name: string | null };

const STATUS_TONE: Record<string, string> = {
  simulated: "bg-sky-500/12 text-sky-300 ring-sky-500/25",
  sent: "bg-emerald-500/12 text-emerald-300 ring-emerald-500/30",
  delivered: "bg-emerald-500/12 text-emerald-300 ring-emerald-500/30",
  queued: "bg-amber-500/12 text-amber-300 ring-amber-500/25",
  failed: "bg-rose-500/12 text-rose-300 ring-rose-500/30",
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "border-rose-500/35 bg-rose-500/[0.06]",
  warning: "border-amber-500/35 bg-amber-500/[0.06]",
  success: "border-emerald-500/35 bg-emerald-500/[0.06]",
  info: "border-sky-500/30 bg-sky-500/[0.05]",
};

function MessagePreview({ row }: { row: Row }) {
  const meta = useMemo(() => {
    if (!row.meta) return null;
    try {
      return JSON.parse(row.meta) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [row.meta]);

  if (row.channel === "sms") {
    return (
      <div className="mx-auto max-w-sm">
        <div className="rounded-2xl rounded-bl-sm bg-emerald-500/15 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-emerald-50 ring-1 ring-emerald-500/25">
          {row.body}
        </div>
        <p className="mt-1.5 text-center text-[10px] uppercase tracking-wider text-slate-600">
          SMS · {row.body.length} characters · {Math.ceil(row.body.length / 160)} segment(s) · to {row.recipient}
        </p>
      </div>
    );
  }

  if (row.channel === "whatsapp") {
    return (
      <div className="mx-auto max-w-sm">
        <div className="rounded-2xl rounded-tl-sm bg-[#1f3a2f] px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-line text-emerald-50 ring-1 ring-emerald-400/20">
          {row.body}
        </div>
        <p className="mt-1.5 text-center text-[10px] uppercase tracking-wider text-slate-600">
          WhatsApp · Meta Cloud API · to {row.recipient}
        </p>
      </div>
    );
  }

  if (row.channel === "email") {
    return (
      <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-900">
        <div className="border-b border-white/8 px-4 py-2.5 text-[11.5px] text-slate-400">
          <span className="font-semibold text-slate-300">Subject:</span> {row.title}
          <span className="ml-3 text-slate-600">To: {row.recipient}</span>
        </div>
        <p className="px-4 py-3 text-[12.5px] leading-relaxed text-slate-300">{row.body}</p>
      </div>
    );
  }

  if (row.channel === "browser") {
    return (
      <div className="mx-auto max-w-sm rounded-xl border border-white/12 bg-ink-800/80 p-3 shadow-lg">
        <div className="flex items-start gap-2.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-emerald-500/20 text-[11px]">🛏</span>
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-bold text-slate-100">{row.title}</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-400">{row.body}</p>
          </div>
        </div>
        <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-600">System notification · GhanaBed</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <p className="text-[12.5px] font-bold text-slate-100">{row.title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-400">{row.body}</p>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-600">In-app alert feed{meta ? " · published to connected sessions" : ""}</p>
    </div>
  );
}

export default function OutboxView({ initial, mode }: Props) {
  const live = useLive();
  const [rows, setRows] = useState<Row[]>(initial);
  const [channel, setChannel] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "80" });
      if (channel) params.set("channel", channel);
      const res = await fetch(`/api/notifications?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { notifications?: Row[] };
      setRows(data.notifications ?? []);
    } catch {
      /* keep the current list */
    }
  }, [channel]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh shortly after any alert lands on the live stream.
  useEffect(() => {
    if (live.lastEventKind !== "alert") return;
    const t = setTimeout(() => void refresh(), 700);
    return () => clearTimeout(t);
  }, [live.lastEventKind, live.updatedAt, refresh]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of rows) out[r.channel] = (out[r.channel] ?? 0) + 1;
    return out;
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="card card-pad flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-title">Delivery outbox</p>
          <p className="mt-1 text-xs text-slate-400">
            {mode === "live"
              ? "Messages are being delivered through the configured providers."
              : "Simulator mode — every message is rendered and stored exactly as it would be sent, with the provider request attached. No outbound calls are made."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ id: "", label: "All" }, ...Object.entries(CHANNEL_LABELS).map(([id, label]) => ({ id, label }))].map((c) => (
            <button
              key={c.id || "all"}
              onClick={() => setChannel(c.id)}
              className={cx(
                "rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition",
                channel === c.id ? "bg-white/12 text-white ring-1 ring-white/20" : "bg-white/[0.04] text-slate-400 hover:text-slate-200",
              )}
            >
              {c.label}
              {counts[c.id] ? <span className="ml-1.5 text-slate-500">{counts[c.id]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card card-pad py-14 text-center">
          <p className="text-sm font-semibold text-slate-200">No messages yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-500">
            Trigger an alert from the staff portal — run a scenario or admit a patient until a ward fills — and the
            resulting messages appear here instantly.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const open = expanded === r.id;
            let meta: Record<string, unknown> | null = null;
            if (r.meta) {
              try {
                meta = JSON.parse(r.meta) as Record<string, unknown>;
              } catch {
                meta = null;
              }
            }
            return (
              <li key={r.id} className={cx("card overflow-hidden border", SEVERITY_TONE[r.severity] ?? "border-white/8")}>
                <button
                  className="flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03]"
                  onClick={() => setExpanded(open ? null : r.id)}
                  aria-expanded={open}
                >
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-[15px]">
                    {r.channel === "sms" ? "📱" : r.channel === "whatsapp" ? "💬" : r.channel === "email" ? "✉️" : r.channel === "browser" ? "🔔" : "🖥️"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-bold text-slate-100">{r.title}</span>
                      <span className={cx("pill", STATUS_TONE[r.status] ?? STATUS_TONE.queued)}>{r.status}</span>
                    </span>
                    <span className="mt-1 block truncate text-[11.5px] text-slate-500">
                      {CHANNEL_LABELS[r.channel] ?? r.channel} · {r.provider} · to {r.recipient}
                      {r.facility_name ? ` · ${r.facility_name}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[11px] text-slate-500">{timeAgo(Number(r.created_at))}</span>
                    <span className="mt-1 block text-[10px] uppercase tracking-wider text-slate-600">
                      {EVENT_LABELS[r.event_type] ?? r.event_type}
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="space-y-4 border-t border-white/8 bg-ink-950/40 px-5 py-5">
                    <MessagePreview row={r} />

                    {r.error && (
                      <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-200">
                        Provider error: {r.error}
                      </p>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="section-title mb-2">Message detail</p>
                        <dl className="space-y-1 text-[11.5px] text-slate-400">
                          <div className="flex gap-2">
                            <dt className="w-24 shrink-0 text-slate-600">Created</dt>
                            <dd>{formatDateTime(Number(r.created_at))}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-24 shrink-0 text-slate-600">Event</dt>
                            <dd>{EVENT_LABELS[r.event_type] ?? r.event_type}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-24 shrink-0 text-slate-600">Severity</dt>
                            <dd className="capitalize">{r.severity}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-24 shrink-0 text-slate-600">Channel</dt>
                            <dd>{CHANNEL_LABELS[r.channel] ?? r.channel}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-24 shrink-0 text-slate-600">Provider</dt>
                            <dd>{r.provider}</dd>
                          </div>
                          {r.subscription_id && (
                            <div className="flex gap-2">
                              <dt className="w-24 shrink-0 text-slate-600">Subscription</dt>
                              <dd>#{r.subscription_id}</dd>
                            </div>
                          )}
                        </dl>
                      </div>

                      {meta && (
                        <div>
                          <p className="section-title mb-2">
                            {meta.mode === "simulator" ? "Provider request (simulated)" : "Provider response"}
                          </p>
                          <pre className="scroll-thin max-h-52 overflow-auto rounded-xl border border-white/10 bg-ink-950/80 p-3 font-mono text-[10.5px] leading-relaxed text-slate-300">
                            {JSON.stringify(meta, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
