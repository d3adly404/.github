/**
 * Live occupancy simulator + scenario injector.
 *
 * Ghana has no public real-time bed feed, so the demo keeps the picture moving
 * the way a real ward does: admissions through the day, discharges after
 * rounds, occasional surges. Every change flows through `updateWard()`, so
 * alerts, history and the live stream behave exactly as they would with a real
 * hospital information system connected.
 *
 * Turn it off (`SIMULATOR_ENABLED=false` or the toggle in the staff portal)
 * when you connect a real feed.
 */
import { all, get, run } from "./db";
import { updateWard } from "./beds";
import { getFacility } from "./queries";
import { setState, getState } from "./db";
import type { Facility } from "./types";

export type ScenarioId = "surge" | "discharge_round" | "icu_pressure" | "maternity_surge" | "fill_facility";

export const SCENARIOS: { id: ScenarioId; label: string; description: string }[] = [
  { id: "surge", label: "Emergency surge", description: "Road traffic incident: 8–18 patients arrive across emergency, surgical and general wards." },
  { id: "discharge_round", label: "Discharge round", description: "Consultant rounds free up 10–25% of occupied beds." },
  { id: "icu_pressure", label: "ICU / HDU pressure", description: "Critical care fills up completely — the hardest beds to find." },
  { id: "maternity_surge", label: "Maternity surge", description: "Obstetric referrals fill the maternity ward." },
  { id: "fill_facility", label: "Fill the facility", description: "Every ward reaches capacity — triggers the facility-wide FULL alert." },
];

interface SimState {
  timer?: ReturnType<typeof setInterval>;
  ticks: number;
  lastTickAt: number | null;
  lastEvent: string | null;
}

const g = globalThis as unknown as { __ghanabedSim?: SimState };

function state(): SimState {
  if (!g.__ghanabedSim) g.__ghanabedSim = { ticks: 0, lastTickAt: null, lastEvent: null };
  return g.__ghanabedSim;
}

export function simulatorEnabled(): boolean {
  const stored = getState("simulator_enabled");
  if (stored !== undefined) return stored === "true";
  return (process.env.SIMULATOR_ENABLED ?? "true").toLowerCase() !== "false";
}

export function intervalSeconds(): number {
  const stored = getState("simulator_interval");
  if (stored) return Math.max(5, Number(stored));
  return Math.max(5, Number(process.env.SIMULATOR_INTERVAL_SECONDS ?? 25));
}

export function simulatorStatus() {
  const s = state();
  return {
    enabled: simulatorEnabled(),
    running: Boolean(s.timer),
    intervalSeconds: intervalSeconds(),
    ticks: s.ticks,
    lastTickAt: s.lastTickAt,
    lastEvent: s.lastEvent,
  };
}

export function startSimulator(): void {
  const s = state();
  if (s.timer) clearInterval(s.timer);
  if (!simulatorEnabled()) {
    s.timer = undefined;
    return;
  }
  s.timer = setInterval(() => {
    void runTick().catch((err) => {
      s.lastEvent = `tick error: ${err instanceof Error ? err.message : String(err)}`;
    });
  }, intervalSeconds() * 1000);
  // Don't hold the Node process open just for the simulator.
  s.timer.unref?.();
}

export function stopSimulator(): void {
  const s = state();
  if (s.timer) clearInterval(s.timer);
  s.timer = undefined;
}

export function setSimulatorEnabled(enabled: boolean, interval?: number): void {
  setState("simulator_enabled", String(enabled));
  if (interval) setState("simulator_interval", String(Math.max(5, Math.floor(interval))));
  if (enabled) startSimulator();
  else stopSimulator();
}

/** Called from instrumentation.ts once the Node server boots. */
export function bootSimulator(): void {
  if (simulatorEnabled()) startSimulator();
}

function pick<T>(arr: T[], rand: () => number = Math.random): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** One simulation step: a handful of admissions/discharges across the country. */
export async function runTick(): Promise<{ changes: number; note: string }> {
  const s = state();
  const wardRows = all<{ id: number; facility_id: string; capacity: number; occupied: number }>(
    `SELECT w.id, w.facility_id, w.capacity, w.occupied
     FROM wards w JOIN facilities f ON f.id = w.facility_id
     WHERE w.capacity > 0`,
  );
  if (!wardRows.length) return { changes: 0, note: "no wards" };

  // Busier regions of the day admit more; nights see discharges and quiet.
  const hour = new Date().getHours();
  const dayPressure = hour >= 8 && hour <= 18 ? 1.35 : hour >= 22 || hour <= 5 ? 0.55 : 1;

  const changes = Math.max(1, Math.round((1 + Math.random() * 3) * dayPressure));
  let applied = 0;

  // Facility-level pressure, so referral magnets behave like referral magnets.
  const facilityRows = all<{ facility_id: string; capacity: number; occupied: number }>(
    `SELECT facility_id, COALESCE(SUM(capacity),0) AS capacity, COALESCE(SUM(occupied),0) AS occupied
     FROM wards GROUP BY facility_id`,
  );
  const facilityPressure = new Map(
    facilityRows.map((r) => [r.facility_id, Number(r.capacity) ? Number(r.occupied) / Number(r.capacity) : 0]),
  );

  for (let i = 0; i < changes; i++) {
    const ward = pick(wardRows);
    const occupancy = ward.capacity ? ward.occupied / ward.capacity : 0;

    // The fuller a ward is, the more likely the next event is a discharge.
    let admitProbability = Math.max(0.08, Math.min(0.85, 0.62 - (occupancy - 0.72) * 1.1));

    // Teaching/regional hospitals running at capacity are re-occupied almost as
    // fast as beds are freed — keep them hot so alerts reflect real pressure
    // instead of every facility drifting to a comfortable 80%.
    if ((facilityPressure.get(ward.facility_id) ?? 0) >= 0.97) {
      admitProbability = Math.max(admitProbability, 0.74);
    }
    const isAdmit = Math.random() < admitProbability;
    const magnitude = Math.random() < 0.82 ? 1 : Math.random() < 0.7 ? 2 : 3;

    const facility = getFacility(ward.facility_id);
    const actor = `${facility?.type ?? "Hospital"} ward system`;

    await updateWard({
      wardId: Number(ward.id),
      mode: "delta",
      delta: isAdmit ? magnitude : -magnitude,
      actor: "Simulator",
      source: "simulator",
    });
    applied += 1;
  }

  s.ticks += 1;
  s.lastTickAt = Date.now();
  s.lastEvent = `${applied} ward change${applied === 1 ? "" : "s"} applied`;

  // Occasional housekeeping: keep the history tables bounded.
  if (s.ticks % 60 === 0) pruneHistory();

  return { changes: applied, note: s.lastEvent };
}

function pruneHistory(): void {
  const cutoff = Date.now() - 7 * 86_400_000;
  const a = run(`DELETE FROM ward_history WHERE ts < ?`, [cutoff]);
  const b = run(`DELETE FROM facility_history WHERE ts < ?`, [cutoff]);
  run(`DELETE FROM notification_log WHERE created_at < ?`, [Date.now() - 30 * 86_400_000]);
  run(`DELETE FROM alert_events WHERE ts < ?`, [Date.now() - 30 * 86_400_000]);
  run(`DELETE FROM sessions WHERE expires_at < ?`, [Date.now()]);
  state().lastEvent = `pruned ${a.changes + b.changes} history rows`;
}

/** Applies a scripted scenario to one facility — great for demos and training. */
export async function runScenario(
  scenario: ScenarioId,
  facilityId: string,
  actor: string,
): Promise<{ changed: number; facility: Facility; note: string }> {
  const facility = getFacility(facilityId);
  if (!facility) throw new Error("Unknown facility");

  const wards = all<{ id: number; category: string; capacity: number; occupied: number; name: string }>(
    `SELECT id, category, capacity, occupied, name FROM wards WHERE facility_id = ? AND capacity > 0`,
    [facilityId],
  );
  let changed = 0;

  const apply = async (wardId: number, delta: number, reason: string) => {
    const res = await updateWard({
      wardId,
      mode: "delta",
      delta,
      actor,
      source: "scenario",
      reason,
    });
    if (res.changed) changed += 1;
  };

  const inCategories = (cats: string[]) => wards.filter((w) => cats.includes(w.category));

  switch (scenario) {
    case "surge": {
      const targets = inCategories(["emergency", "surgical", "general_male", "general_female", "orthopaedic"]);
      let remaining = 8 + Math.floor(Math.random() * 11);
      let guard = 0;
      while (remaining > 0 && targets.length && guard++ < 40) {
        const ward = pick(targets);
        const n = Math.min(remaining, 1 + Math.floor(Math.random() * 3));
        await apply(Number(ward.id), n, "Trauma surge — RTA admissions");
        remaining -= n;
      }
      return { changed, facility: getFacility(facilityId)!, note: `Trauma surge: ${changed} wards affected` };
    }
    case "discharge_round": {
      for (const w of wards) {
        if (w.occupied <= 0) continue;
        const freed = Math.max(1, Math.round(w.occupied * (0.1 + Math.random() * 0.15)));
        await apply(Number(w.id), -freed, "Consultant discharge round");
      }
      return { changed, facility: getFacility(facilityId)!, note: `Discharge round: ${changed} wards affected` };
    }
    case "icu_pressure": {
      for (const w of inCategories(["icu", "emergency"])) {
        await apply(Number(w.id), w.capacity, "Critical care referrals");
      }
      return { changed, facility: getFacility(facilityId)!, note: `ICU/HDU filled: ${changed} wards affected` };
    }
    case "maternity_surge": {
      for (const w of inCategories(["maternity"])) {
        await apply(Number(w.id), Math.ceil(w.capacity * 0.6), "Obstetric referrals from CHAG clinics");
      }
      if (!inCategories(["maternity"]).length) {
        for (const w of inCategories(["general_female"]).slice(0, 1)) {
          await apply(Number(w.id), Math.ceil(w.capacity * 0.5), "Obstetric overflow into female ward");
        }
      }
      return { changed, facility: getFacility(facilityId)!, note: `Maternity surge: ${changed} wards affected` };
    }
    case "fill_facility": {
      for (const w of wards) await apply(Number(w.id), w.capacity, "Facility at capacity (drill)");
      return { changed, facility: getFacility(facilityId)!, note: `Facility filled: ${changed} wards affected` };
    }
    default:
      return { changed, facility, note: "Unknown scenario" };
  }
}

/** Small helper used by the portal: how "under pressure" is this facility? */
export function pressureIndex(facility: Facility): number {
  const row = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM wards WHERE facility_id = ? AND capacity > 0 AND occupied >= capacity`,
    [facility.id],
  );
  return Number(row?.n ?? 0);
}
