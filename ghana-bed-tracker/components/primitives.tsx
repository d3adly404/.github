/** Presentational building blocks shared by every page. */
import Link from "next/link";
import { STATUS_META, bedStatus, cx, formatNumber, pct, timeAgo } from "@/lib/format";
import type { Severity } from "@/lib/types";

/* ── Status pill ─────────────────────────────────────────────────────────── */

export function StatusPill({ occupied, capacity, className }: { occupied: number; capacity: number; className?: string }) {
  const status = bedStatus(occupied, capacity);
  const meta = STATUS_META[status];
  return (
    <span className={cx("pill", meta.bg, meta.text, meta.ring, className)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {status === "full" ? "FULL" : `${Math.max(0, capacity - occupied)} free`}
    </span>
  );
}

export function SeverityDot({ severity }: { severity: Severity | string }) {
  const tone =
    severity === "critical"
      ? "bg-rose-500"
      : severity === "warning"
        ? "bg-amber-400"
        : severity === "success"
          ? "bg-emerald-400"
          : "bg-sky-400";
  return <span className={cx("h-2 w-2 shrink-0 rounded-full", tone)} />;
}

/* ── Occupancy bar ───────────────────────────────────────────────────────── */

export function OccupancyBar({
  occupied,
  capacity,
  height = "h-2",
  showTicks = false,
}: {
  occupied: number;
  capacity: number;
  height?: string;
  showTicks?: boolean;
}) {
  const status = bedStatus(occupied, capacity);
  const meta = STATUS_META[status];
  const width = Math.min(100, pct(occupied, capacity));
  return (
    <div className="w-full">
      <div className={cx("bar-track relative", height)} role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cx("h-full rounded-full transition-all duration-700 ease-out", meta.dot)}
          style={{ width: `${width}%` }}
        />
        {showTicks && (
          <>
            <span className="absolute inset-y-0 left-[70%] w-px bg-white/25" />
            <span className="absolute inset-y-0 left-[90%] w-px bg-white/40" />
          </>
        )}
      </div>
    </div>
  );
}

/* ── Bed grid (one square per bed) ───────────────────────────────────────── */

export function BedGrid({ occupied, capacity, max = 60 }: { occupied: number; capacity: number; max?: number }) {
  const shown = Math.min(capacity, max);
  const ratio = capacity ? occupied / capacity : 0;
  const filled = Math.round(shown * ratio);
  const status = bedStatus(occupied, capacity);
  const meta = STATUS_META[status];
  return (
    <div className="flex flex-wrap gap-[3px]" title={`${occupied} of ${capacity} beds occupied`}>
      {Array.from({ length: shown }).map((_, i) => (
        <span
          key={i}
          className={cx("h-2.5 w-2.5 rounded-[3px]", i < filled ? meta.dot : "bg-white/12")}
          aria-hidden={i >= filled}
        />
      ))}
      {capacity > max && <span className="ml-1 text-[10px] text-slate-500">+{capacity - max} more</span>}
    </div>
  );
}

/* ── Circular occupancy gauge ────────────────────────────────────────────── */

export function Gauge({ occupied, capacity, size = 132 }: { occupied: number; capacity: number; size?: number }) {
  const value = pct(occupied, capacity);
  const status = bedStatus(occupied, capacity);
  const meta = STATUS_META[status];
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={meta.hex}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.4,0,.2,1), stroke 500ms" }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-extrabold leading-none text-white">{value}%</p>
        <p className={cx("mt-1 text-[10px] font-bold uppercase tracking-[0.14em]", meta.text)}>{status === "full" ? "Full" : "Occupied"}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          {formatNumber(Math.max(0, capacity - occupied))} of {formatNumber(capacity)} free
        </p>
      </div>
    </div>
  );
}

/* ── Stat card ───────────────────────────────────────────────────────────── */

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  href?: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "bad"
          ? "text-rose-300"
          : "text-white";
  const inner = (
    <div className="card card-pad transition hover:border-white/15">
      <p className="section-title">{label}</p>
      <p className={cx("mt-2 text-3xl font-extrabold tracking-tight tabular-nums", toneClass)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/* ── Region breakdown table ──────────────────────────────────────────────── */

export function RegionTable({
  regions,
}: {
  regions: { region_id: string; region_name: string; facilities: number; capacity: number; occupied: number; available: number; occupancy: number; full: number }[];
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
        <p className="section-title">Occupancy by region</p>
        <span className="text-[11px] text-slate-500">{regions.length} regions reporting</span>
      </div>
      <div className="scroll-thin max-h-[26rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-ink-900/95 text-[11px] uppercase tracking-wider text-slate-500 backdrop-blur">
            <tr>
              <th className="px-5 py-2.5 text-left font-semibold">Region</th>
              <th className="px-3 py-2.5 text-right font-semibold">Facilities</th>
              <th className="px-3 py-2.5 text-right font-semibold">Beds free</th>
              <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Full</th>
              <th className="w-40 px-5 py-2.5 text-right font-semibold">Occupancy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {regions.map((r) => {
              const status = bedStatus(r.occupied, r.capacity);
              return (
                <tr key={r.region_id} className="transition hover:bg-white/[0.03]">
                  <td className="px-5 py-2.5">
                    <Link href={`/hospitals?region=${r.region_id}`} className="font-semibold text-slate-100 hover:text-emerald-300">
                      {r.region_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{r.facilities}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className={cx("font-bold", STATUS_META[status].text)}>{formatNumber(r.available)}</span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-400 sm:table-cell">
                    {r.full > 0 ? <span className="font-semibold text-rose-300">{r.full}</span> : "—"}
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center justify-end gap-2.5">
                      <span className="w-9 text-right text-xs font-bold tabular-nums text-slate-300">{r.occupancy}%</span>
                      <div className="w-20">
                        <OccupancyBar occupied={r.occupied} capacity={r.capacity} height="h-1.5" />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Misc ────────────────────────────────────────────────────────────────── */

export function UpdatedAgo({ ts, prefix = "Updated" }: { ts: number; prefix?: string }) {
  return (
    <span className="text-[11px] text-slate-500">
      {prefix} {timeAgo(ts)}
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card card-pad grid place-items-center py-14 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-slate-400">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
