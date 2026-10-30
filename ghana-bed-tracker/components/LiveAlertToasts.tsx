"use client";

/**
 * Toasts for alerts that arrive while the patient is browsing — the browser-side
 * half of the "notify me when a bed frees up" promise.
 */
import { useEffect, useRef, useState } from "react";
import { useLive } from "@/lib/live-client";
import { cx, timeAgo } from "@/lib/format";
import type { AlertEvent } from "@/lib/types";

const TONE: Record<string, string> = {
  critical: "border-rose-500/40 bg-rose-950/80 text-rose-100",
  warning: "border-amber-500/40 bg-amber-950/80 text-amber-100",
  success: "border-emerald-500/40 bg-emerald-950/80 text-emerald-100",
  info: "border-sky-500/40 bg-sky-950/80 text-sky-100",
};

export default function LiveAlertToasts() {
  const live = useLive();
  const [toasts, setToasts] = useState<AlertEvent[]>([]);
  const seen = useRef<Set<number>>(new Set());
  const primed = useRef(false);

  // Ignore everything already in the feed when the page first loads.
  useEffect(() => {
    if (!primed.current) {
      for (const a of live.alerts) seen.current.add(a.id);
      primed.current = true;
    }
  }, [live.alerts]);

  useEffect(() => {
    if (!primed.current) return;
    for (const alert of live.alerts) {
      if (!alert?.id || seen.current.has(alert.id)) continue;
      seen.current.add(alert.id);
      // Only interrupt the visitor for events that actually matter to them.
      if (alert.severity === "info") continue;
      setToasts((prev) => [alert, ...prev].slice(0, 3));
      const id = alert.id;
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 9000);
    }
  }, [live.alerts, live.updatedAt]);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(23rem,calc(100vw-2rem))] flex-col gap-2.5">
      {toasts.map((t) => (
        <div
          key={`${t.id}-${t.ts}`}
          className={cx(
            "slide-up pointer-events-auto rounded-2xl border p-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.95)] backdrop-blur",
            TONE[t.severity] ?? TONE.info,
          )}
          role="status"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-snug">{t.title}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed opacity-85">{t.message}</p>
              <p className="mt-1.5 text-[10px] uppercase tracking-wider opacity-60">
                {t.region_name ?? ""} · {timeAgo(t.ts)}
              </p>
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="ml-auto shrink-0 rounded-md p-1 opacity-60 transition hover:opacity-100"
              aria-label="Dismiss"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
