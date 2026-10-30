"use client";

/** Live alert feed: server-rendered history with new events appended in place. */
import Link from "next/link";
import { useMemo } from "react";
import { EVENT_LABELS, cx, timeAgo } from "@/lib/format";
import { useLive } from "@/lib/live-client";
import { SeverityDot } from "./primitives";
import type { AlertEvent } from "@/lib/types";

interface Props {
  initial: (AlertEvent & { facility_name: string; region_name: string })[];
  limit?: number;
  title?: string;
  emptyHint?: string;
  facilityId?: string;
}

export default function AlertFeed({ initial, limit = 12, title = "Live alert feed", emptyHint, facilityId }: Props) {
  const live = useLive();

  const alerts = useMemo(() => {
    const merged: (AlertEvent & { facility_name?: string; region_name?: string })[] = [
      ...(live.alerts as (AlertEvent & { facility_name?: string; region_name?: string })[]),
      ...initial,
    ];
    const seen = new Set<string>();
    return merged
      .filter((a) => {
        const key = `${a.id}-${a.ts}-${a.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .filter((a) => (facilityId ? a.facility_id === facilityId : true))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);
  }, [initial, live.alerts, limit, facilityId]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 live-dot" />
          <p className="section-title">{title}</p>
        </div>
        <span className="text-[11px] text-slate-500">{alerts.length} events</span>
      </div>

      <div className="scroll-thin max-h-[30rem] divide-y divide-white/5 overflow-y-auto">
        {alerts.length === 0 && (
          <p className="px-5 py-10 text-center text-xs text-slate-500">
            {emptyHint ?? "No alerts yet. Events appear here the moment wards cross an alert threshold."}
          </p>
        )}
        {alerts.map((a) => (
          <div key={`${a.id}-${a.ts}`} className="px-5 py-3.5 transition hover:bg-white/[0.03]">
            <div className="flex items-start gap-3">
              <span className="mt-1.5">
                <SeverityDot severity={a.severity} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug text-slate-100">{a.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{a.message}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] uppercase tracking-wider text-slate-500">
                  <span className="rounded bg-white/5 px-1.5 py-0.5 font-semibold text-slate-400">
                    {EVENT_LABELS[a.type] ?? a.type}
                  </span>
                  {a.facility_name && (
                    <Link
                      href={`/hospitals/${a.facility_id}`}
                      className={cx("font-semibold text-slate-400 hover:text-emerald-300")}
                    >
                      {a.facility_name}
                    </Link>
                  )}
                  <span>{timeAgo(a.ts)}</span>
                  {a.notified > 0 && <span className="text-emerald-400/80">{a.notified} notified</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
