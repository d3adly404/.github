"use client";

/**
 * Leaflet map of facility pressure. Loaded client-side only (the tiles come from
 * OpenStreetMap in the visitor's browser) and degrades to a text list if the
 * map library or tiles are unavailable.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import { STATUS_META, bedStatus, cx } from "@/lib/format";
import type { Facility } from "@/lib/types";

interface Props {
  facilities: Facility[];
  height?: number;
  center?: [number, number];
  zoom?: number;
}

interface Marker {
  marker: { setLatLng: (ll: [number, number]) => void; remove: () => void; setZIndexOffset: (n: number) => void };
  el: HTMLElement;
}

export default function FacilityMap({ facilities, height = 420, center = [7.95, -1.05], zoom = 7 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !containerRef.current || mapRef.current) return;

        const map = L.map(containerRef.current, {
          center,
          zoom,
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: false,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
        mapRef.current = map;
        setReady(true);

        // Keep markers in sync with live facility updates.
        const sync = () => {
          if (!mapRef.current) return;
          const seen = new Set<string>();
          for (const f of facilities) {
            seen.add(f.id);
            const status = bedStatus(f.occupied, f.capacity);
            const meta = STATUS_META[status];
            const size = 18 + Math.min(16, Math.round(f.capacity / 120));
            const html = `<div class="bed-marker" style="width:${size}px;height:${size}px;background:${meta.hex}">${
              status === "full" ? "!" : f.available
            }</div>`;
            const existing = markersRef.current.get(f.id);
            if (existing) {
              existing.el.innerHTML = html;
              existing.marker.setLatLng([f.lat, f.lon]);
              continue;
            }
            const icon = L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
            const marker = L.marker([f.lat, f.lon], { icon, title: f.name }).addTo(map as never);
            marker.bindPopup(
              `<div style="min-width:190px">
                 <strong style="font-size:13px;color:#f8fafc">${f.name}</strong>
                 <div style="margin-top:3px;color:#94a3b8;font-size:11px">${f.town}, ${f.region_name}</div>
                 <div style="margin-top:8px;font-size:12px;color:${meta.hex};font-weight:700">
                   ${status === "full" ? "FULL — no beds" : `${f.available} bed${f.available === 1 ? "" : "s"} free`}
                 </div>
                 <div style="color:#94a3b8;font-size:11px;margin-top:2px">${f.occupancy}% occupied of ${f.capacity} beds</div>
                 <a href="/hospitals/${f.id}" style="display:inline-block;margin-top:9px;font-size:11px;font-weight:700;color:#34d399">Open facility →</a>
               </div>`,
            );
            const el = (marker as unknown as { _icon: HTMLElement })._icon;
            markersRef.current.set(f.id, { marker: marker as never, el });
          }
          for (const [id, m] of markersRef.current) {
            if (!seen.has(id)) {
              m.marker.remove();
              markersRef.current.delete(id);
            }
          }
        };
        (map as unknown as { __sync?: () => void }).__sync = sync;
        sync();
      } catch (err) {
        console.warn("[map] unavailable:", err);
        setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render marker contents whenever the facility list changes.
  useEffect(() => {
    const map = mapRef.current as { __sync?: () => void } | null;
    if (map?.__sync) map.__sync();
  }, [facilities, ready]);

  if (failed) {
    return (
      <div className="card card-pad">
        <p className="section-title mb-3">Facility map</p>
        <p className="mb-3 text-xs text-slate-500">
          The interactive map could not load (offline or blocked tiles). Here is the same data as a list:
        </p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {facilities.slice(0, 12).map((f) => {
            const meta = STATUS_META[bedStatus(f.occupied, f.capacity)];
            return (
              <li key={f.id}>
                <Link href={`/hospitals/${f.id}`} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-xs hover:bg-white/[0.08]">
                  <span className="truncate text-slate-200">{f.name}</span>
                  <span className={cx("ml-2 shrink-0 font-bold tabular-nums", meta.text)}>
                    {f.available === 0 ? "FULL" : `${f.available} free`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-5 py-3.5">
        <p className="section-title">Where the pressure is</p>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
          {(["free", "filling", "critical", "full"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={cx("h-2 w-2 rounded-full", STATUS_META[s].dot)} />
              {s === "free" ? "available" : s === "filling" ? "filling" : s === "critical" ? "almost full" : "full"}
            </span>
          ))}
        </div>
      </div>
      <div ref={containerRef} style={{ height }} className="w-full" aria-label="Map of Ghana hospital bed availability" />
    </div>
  );
}
