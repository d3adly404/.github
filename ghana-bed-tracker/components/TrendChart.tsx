/**
 * Dependency-free SVG trend chart: occupied beds over time with capacity and
 * threshold reference lines. Rendered on the server, refreshed by live updates.
 */
import { STATUS_META, bedStatus, cx, formatClock } from "@/lib/format";
import type { HistoryPoint } from "@/lib/types";

interface Props {
  history: HistoryPoint[];
  capacity: number;
  threshold?: number;
  height?: number;
  className?: string;
}

export default function TrendChart({ history, capacity, threshold = 90, height = 168, className }: Props) {
  const w = 720;
  const padL = 34;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;

  if (!history.length) {
    return (
      <div className={cx("card card-pad text-center text-xs text-slate-500", className)}>
        No occupancy history recorded yet. It builds up as wards report changes.
      </div>
    );
  }

  const maxCap = Math.max(capacity, ...history.map((h) => h.capacity), 1);
  const t0 = history[0].ts;
  const t1 = history[history.length - 1].ts;
  const span = Math.max(1, t1 - t0);

  const x = (ts: number) => padL + ((ts - t0) / span) * innerW;
  const y = (v: number) => padT + innerH - (v / maxCap) * innerH;

  const linePath = history.map((h, i) => `${i === 0 ? "M" : "L"}${x(h.ts).toFixed(1)},${y(h.occupied).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(t1).toFixed(1)},${y(0).toFixed(1)} L${x(t0).toFixed(1)},${y(0).toFixed(1)} Z`;

  const last = history[history.length - 1];
  const status = bedStatus(last.occupied, last.capacity || capacity);
  const meta = STATUS_META[status];
  const thresholdY = y((threshold / 100) * maxCap);
  const capacityY = y(maxCap);

  // Four evenly spaced time labels.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, ts: t0 + f * span }));
  const yTicks = [0, 0.5, 1].map((f) => ({ f, v: Math.round(maxCap * f) }));

  return (
    <div className={cx("card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-5 py-3">
        <div>
          <p className="section-title">Occupancy trend</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {formatClock(t0)} → {formatClock(t1)} · {history.length} samples
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className={cx("h-1.5 w-4 rounded-full", meta.dot)} /> occupied
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 bg-white/40" /> capacity
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 border-t border-dashed border-amber-400/70" /> {threshold}% alert
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none" role="img"
        aria-label={`Occupancy trend from ${formatClock(t0)} to ${formatClock(t1)}`}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={meta.hex} stopOpacity="0.34" />
            <stop offset="100%" stopColor={meta.hex} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((t) => (
          <g key={t.f}>
            <line x1={padL} x2={w - padR} y1={y(t.v)} y2={y(t.v)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
            <text x={padL - 8} y={y(t.v) + 3.5} textAnchor="end" fontSize="9.5" fill="#64748b">
              {t.v}
            </text>
          </g>
        ))}

        <line x1={padL} x2={w - padR} y1={capacityY} y2={capacityY} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        <line
          x1={padL}
          x2={w - padR}
          y1={thresholdY}
          y2={thresholdY}
          stroke="rgba(251,191,36,0.6)"
          strokeWidth="1"
          strokeDasharray="5 4"
        />

        <path d={areaPath} fill="url(#areaFill)" />
        <path d={linePath} fill="none" stroke={meta.hex} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(t1)} cy={y(last.occupied)} r="3.6" fill={meta.hex} stroke="#05090f" strokeWidth="1.6" />

        {ticks.map((t) => (
          <text key={t.f} x={x(t.ts)} y={height - 6} textAnchor={t.f === 0 ? "start" : t.f === 1 ? "end" : "middle"} fontSize="9.5" fill="#64748b">
            {formatClock(t.ts)}
          </text>
        ))}
      </svg>
    </div>
  );
}
