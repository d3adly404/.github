"use client";

/**
 * Ward table. Read-only for patients; with admit/discharge controls for signed-in
 * ward staff. Occupancy cells update live over the SSE stream.
 */
import { useMemo, useState } from "react";
import { STATUS_META, bedStatus, cx, formatNumber, timeAgo, wardLabel } from "@/lib/format";
import { useLive } from "@/lib/live-client";
import { BedGrid, OccupancyBar } from "./primitives";
import type { Ward } from "@/lib/types";

interface Props {
  facilityId: string;
  wards: Ward[];
  editable?: boolean;
  onUpdated?: (msg: string) => void;
  onError?: (msg: string) => void;
  actorName?: string;
}

export default function LiveWards({ facilityId, wards, editable, onUpdated, onError, actorName }: Props) {
  const live = useLive();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);

  const merged = useMemo(() => {
    const liveWards = live.wards[facilityId];
    if (!liveWards?.length) return wards;
    const map = new Map(liveWards.map((w) => [w.id, w]));
    return wards.map((w) => map.get(w.id) ?? w);
  }, [live.wards, facilityId, wards]);

  async function change(ward: Ward, delta: number, reason?: string) {
    setBusyId(ward.id);
    try {
      const res = await fetch(`/api/wards/${ward.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "delta", delta, reason }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        ward?: Ward;
        alerts?: { type: string; notified: number }[];
        notified?: number;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Update failed");

      setFlashId(ward.id);
      setTimeout(() => setFlashId((id) => (id === ward.id ? null : id)), 1400);

      const bits = [`${delta > 0 ? "Admitted" : "Discharged"} ${Math.abs(delta)} in ${wardLabel(ward.category)}`];
      if (data.alerts?.length) {
        bits.push(`${data.alerts.length} alert${data.alerts.length === 1 ? "" : "s"} triggered`);
      }
      if (data.notified) bits.push(`${data.notified} patient${data.notified === 1 ? "" : "s"} notified`);
      onUpdated?.(bits.join(" · "));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function setOccupied(ward: Ward, value: number) {
    setBusyId(ward.id);
    try {
      const res = await fetch(`/api/wards/${ward.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "set", occupied: value, reason: "Ward count reconciliation" }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; notified?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Update failed");
      onUpdated?.(`${wardLabel(ward.category)} set to ${value}/${ward.capacity} occupied${data.notified ? ` · ${data.notified} notified` : ""}`);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  const totals = merged.reduce(
    (acc, w) => ({ capacity: acc.capacity + w.capacity, occupied: acc.occupied + w.occupied, full: acc.full + (w.available === 0 && w.capacity > 0 ? 1 : 0) }),
    { capacity: 0, occupied: 0, full: 0 },
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5">
        <div>
          <p className="section-title">Ward-by-ward availability</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {merged.length} wards · {formatNumber(Math.max(0, totals.capacity - totals.occupied))} of{" "}
            {formatNumber(totals.capacity)} beds free
            {totals.full > 0 ? ` · ${totals.full} ward${totals.full === 1 ? "" : "s"} full` : ""}
          </p>
        </div>
        {editable && actorName && <span className="text-[11px] text-slate-500">Reporting as {actorName}</span>}
      </div>

      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="bg-white/[0.02] text-[10.5px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-2.5 text-left font-semibold">Ward</th>
              <th className="px-3 py-2.5 text-right font-semibold">Free</th>
              <th className="px-3 py-2.5 text-right font-semibold">Occupied</th>
              <th className="w-52 px-3 py-2.5 text-left font-semibold">Occupancy</th>
              <th className="hidden px-3 py-2.5 text-left font-semibold lg:table-cell">Beds</th>
              <th className="px-3 py-2.5 text-right font-semibold">Updated</th>
              {editable && <th className="px-5 py-2.5 text-right font-semibold">Admit / discharge</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {merged.map((w) => {
              const status = bedStatus(w.occupied, w.capacity);
              const meta = STATUS_META[status];
              return (
                <tr key={w.id} className={cx("transition hover:bg-white/[0.03]", flashId === w.id && "flash")}>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-100">{wardLabel(w.category)}</p>
                    {w.name !== wardLabel(w.category) && <p className="text-[11px] text-slate-500">{w.name}</p>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={cx("text-base font-extrabold tabular-nums", meta.text)}>{formatNumber(w.available)}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-400">
                    {formatNumber(w.occupied)}
                    <span className="text-slate-600">/{formatNumber(w.capacity)}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <OccupancyBar occupied={w.occupied} capacity={w.capacity} />
                      </div>
                      <span className="w-9 text-right text-[11px] font-bold tabular-nums text-slate-400">{w.occupancy}%</span>
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 lg:table-cell">
                    <BedGrid occupied={w.occupied} capacity={w.capacity} max={28} />
                  </td>
                  <td className="px-3 py-3 text-right text-[11px] text-slate-500">
                    <span className={cx(w.capacity > 0 && w.available === 0 ? "text-rose-400/90" : "")}>{timeAgo(w.updated_at)}</span>
                    {w.updated_by && <span className="mt-0.5 block truncate text-[10px] text-slate-600">{w.updated_by}</span>}
                  </td>
                  {editable && (
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          className="btn-ghost btn-sm"
                          disabled={busyId === w.id || w.occupied <= 0}
                          onClick={() => change(w, -1, "Discharge")}
                          title="Discharge one patient"
                        >
                          −1
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          disabled={busyId === w.id}
                          onClick={() => change(w, +1, "Admission")}
                          title="Admit one patient"
                        >
                          +1
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          disabled={busyId === w.id || w.capacity <= 0}
                          onClick={() => setOccupied(w, w.capacity)}
                          title="Mark this ward full"
                        >
                          Fill
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
