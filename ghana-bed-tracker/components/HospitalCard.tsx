"use client";

import Link from "next/link";
import { STATUS_META, bedStatus, cx, formatKm, formatNumber, timeAgo, wardLabel } from "@/lib/format";
import { useLive } from "@/lib/live-client";
import { OccupancyBar, StatusPill } from "./primitives";
import type { Facility, Ward } from "@/lib/types";

interface Props {
  facility: Facility & { distance_km?: number };
  wards?: Ward[];
  compact?: boolean;
}

export default function HospitalCard({ facility, wards = [], compact = false }: Props) {
  const live = useLive();
  const f = live.facilities[facility.id] ?? facility;
  const liveWards = live.wards[facility.id]?.length ? live.wards[facility.id] : wards;
  const status = bedStatus(f.occupied, f.capacity);
  const meta = STATUS_META[status];

  const freeByCategory = (
    liveWards.length
      ? liveWards
          .filter((w) => w.available > 0)
          .sort((a, b) => b.available - a.available)
          .slice(0, compact ? 3 : 4)
          .map((w) => ({ key: `w-${w.id}`, label: wardLabel(w.category), available: w.available }))
      : (f.free_categories ?? [])
          .slice(0, compact ? 3 : 4)
          .map((c) => ({ key: `c-${c.category}`, label: wardLabel(c.category), available: c.available }))
  );

  return (
    <Link
      href={`/hospitals/${f.id}`}
      className={cx(
        "card group relative block overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.055]",
        status === "full" && "ring-1 ring-rose-500/25",
      )}
    >
      <span className={cx("absolute inset-x-0 top-0 h-[3px]", meta.dot)} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold leading-tight text-slate-100 group-hover:text-white">{f.name}</h3>
          <p className="mt-1 truncate text-xs text-slate-400">
            {f.town} · {f.region_name} · {f.type}
          </p>
        </div>
        <StatusPill occupied={f.occupied} capacity={f.capacity} className="shrink-0" />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className={cx("text-3xl font-extrabold leading-none tabular-nums", meta.text)}>
            {formatNumber(f.available)}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">
            beds free of {formatNumber(f.capacity)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-slate-200">{f.occupancy}%</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">occupied</p>
        </div>
      </div>

      <div className="mt-3">
        <OccupancyBar occupied={f.occupied} capacity={f.capacity} showTicks />
      </div>

      {freeByCategory.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {freeByCategory.map((w) => (
            <span
              key={w.key}
              className="rounded-lg bg-white/[0.05] px-2 py-1 text-[10.5px] font-semibold text-slate-300 ring-1 ring-white/8"
              title={`${w.available} free in ${w.label}`}
            >
              {w.label} · {w.available}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-3 text-[11px] text-slate-500">
        <span className={cx(f.stale && "text-amber-400/90")}>
          {f.stale ? `Report stale · ${timeAgo(f.last_report_at)}` : `Updated ${timeAgo(f.last_report_at)}`}
        </span>
        {typeof f.distance_km === "number" && (
          <span className="font-semibold text-slate-400">{formatKm(f.distance_km)} away</span>
        )}
      </div>
    </Link>
  );
}
