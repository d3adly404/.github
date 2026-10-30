"use client";

/**
 * Patient-facing facility browser: search, filter by region / ward type /
 * pressure, sort by distance, and watch results update live.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import HospitalCard from "./HospitalCard";
import { EmptyState } from "./primitives";
import { cx, wardLabel } from "@/lib/format";
import type { Facility } from "@/lib/types";

interface Props {
  initial: Facility[];
  regions: { id: string; name: string }[];
  facilityTypes: string[];
  wardCategories: { id: string; label: string }[];
}

const STATUS_TABS = [
  { id: "", label: "All" },
  { id: "available", label: "Beds free" },
  { id: "critical", label: "Almost full" },
  { id: "full", label: "Full" },
];

export default function FacilityBrowser({ initial, regions, facilityTypes, wardCategories }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [region, setRegion] = useState(searchParams.get("region") ?? "");
  const [type, setType] = useState(searchParams.get("type") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? (searchParams.get("available") ? "available" : ""));
  const [sort, setSort] = useState(searchParams.get("sort") ?? "");
  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null);
  const [results, setResults] = useState<Facility[]>(initial);
  const [loading, setLoading] = useState(false);
  const [geoState, setGeoState] = useState<"idle" | "locating" | "error" | "on">("idle");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the address bar shareable.
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (region) params.set("region", region);
    if (type) params.set("type", type);
    if (category) params.set("category", category);
    if (status === "available") params.set("available", "1");
    else if (status) params.set("status", status);
    if (sort) params.set("sort", sort);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [q, region, type, category, status, sort, pathname, router]);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (region) params.set("region", region);
      if (type) params.set("type", type);
      if (category) params.set("category", category);
      if (status === "available") params.set("available", "1");
      else if (status) params.set("status", status);
      if (geo) {
        params.set("lat", String(geo.lat));
        params.set("lon", String(geo.lon));
      }
      params.set("sort", sort || (geo ? "distance" : "occupancy_desc"));
      const res = await fetch(`/api/facilities?${params.toString()}`);
      const data = (await res.json()) as { facilities: Facility[] };
      setResults(data.facilities ?? []);
    } catch {
      /* keep the previous results on a network hiccup */
    } finally {
      setLoading(false);
    }
  }, [q, region, type, category, status, sort, geo]);

  // Debounced re-query as filters change.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(fetchResults, q ? 260 : 0);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [fetchResults, q]);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoState("error");
      return;
    }
    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGeoState("on");
        setSort("distance");
      },
      () => setGeoState("error"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }

  function clearAll() {
    setQ("");
    setRegion("");
    setType("");
    setCategory("");
    setStatus("");
    setSort("");
    setGeo(null);
    setGeoState("idle");
  }

  const stats = useMemo(() => {
    const capacity = results.reduce((a, f) => a + f.capacity, 0);
    const available = results.reduce((a, f) => a + f.available, 0);
    const full = results.filter((f) => f.capacity > 0 && f.available === 0).length;
    return { capacity, available, full };
  }, [results]);

  const hasFilters = Boolean(q || region || type || category || status || geo);

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="card card-pad space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
            </svg>
            <input
              className="input pl-10"
              placeholder="Search hospital, town or district — e.g. Korle Bu, Tamale, maternity"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search facilities"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={useMyLocation}
              className={cx("btn-ghost shrink-0", geoState === "on" && "border-emerald-400/50 bg-emerald-500/12 text-emerald-200")}
              title="Sort facilities by distance from your current location"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" strokeLinejoin="round" />
                <circle cx="12" cy="10" r="2.6" />
              </svg>
              {geoState === "locating" ? "Locating…" : geoState === "on" ? "Near me ✓" : "Near me"}
            </button>
            {hasFilters && (
              <button type="button" onClick={clearAll} className="btn-ghost shrink-0">
                Clear
              </button>
            )}
          </div>
        </div>

        {geoState === "error" && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-200">
            Location was blocked or unavailable. You can still search by region or town.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatus(t.id)}
              className={cx(
                "rounded-lg px-3 py-1.5 text-[12px] font-semibold transition",
                status === t.id ? "bg-white/12 text-white ring-1 ring-white/20" : "bg-white/[0.04] text-slate-400 hover:text-slate-200",
              )}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          <select className="input w-auto min-w-[9.5rem] py-1.5 text-[12px]" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select className="input w-auto min-w-[9rem] py-1.5 text-[12px]" value={type} onChange={(e) => setType(e.target.value)} aria-label="Facility type">
            <option value="">All types</option>
            {facilityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select className="input w-auto min-w-[11rem] py-1.5 text-[12px]" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Ward type with a free bed">
            <option value="">Any ward type</option>
            {wardCategories.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label} has a free bed
              </option>
            ))}
          </select>
          <select className="input w-auto min-w-[10rem] py-1.5 text-[12px]" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="">{geo ? "Sort: nearest first" : "Sort: most pressure"}</option>
            <option value="available_desc">Most beds free</option>
            <option value="occupancy_asc">Least occupied</option>
            <option value="occupancy_desc">Most occupied</option>
            <option value="name">Name (A–Z)</option>
            <option value="recent">Recently reported</option>
            {geo && <option value="distance">Nearest to me</option>}
          </select>
        </div>
      </div>

      {/* Result summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-sm text-slate-300">
          <span className="font-bold text-white">{results.length}</span> facilit{results.length === 1 ? "y" : "ies"}
          {category && <> with a free <span className="font-semibold text-emerald-300">{wardLabel(category)}</span> bed</>}
          {region && <> in <span className="font-semibold">{regions.find((r) => r.id === region)?.name}</span></>}
        </p>
        <div className="flex items-center gap-4 text-[11.5px] text-slate-500">
          <span>
            <span className="font-bold text-emerald-300">{stats.available.toLocaleString()}</span> beds free
          </span>
          <span>
            <span className="font-bold text-rose-300">{stats.full}</span> full
          </span>
          {loading && <span className="text-slate-400">updating…</span>}
        </div>
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <EmptyState
          title="No facilities match those filters"
          hint="Try clearing the ward-type filter, widening to the whole region, or searching for a nearby town."
          action={
            <button className="btn-primary btn-sm" onClick={clearAll}>
              Clear all filters
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((f) => (
            <HospitalCard key={f.id} facility={f} compact />
          ))}
        </div>
      )}
    </div>
  );
}
