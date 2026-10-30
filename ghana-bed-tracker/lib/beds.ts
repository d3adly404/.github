/**
 * Core write path for bed occupancy.
 *
 * Every mutation — a nurse tapping "admit", the demo simulator, or a scenario
 * injection — goes through `updateWard()` so that history, live streaming and
 * alert evaluation always stay consistent.
 */
import { get, run } from "./db";
import { pct } from "./format";
import { getFacility, getWard, getWards, nationalSummary } from "./queries";
import { broadcast } from "./realtime";
import { evaluateAndNotify, snapshot, type AlertRunResult, type WardChangeContext } from "./alerts";
import type { Facility, Ward } from "./types";

export interface UpdateWardInput {
  wardId: number;
  /** `set` writes an absolute occupied count, `delta` shifts it by +/- n. */
  mode: "set" | "delta";
  occupied?: number;
  delta?: number;
  capacity?: number;
  actor: string;
  source?: "staff" | "simulator" | "scenario";
  reason?: string;
  /** Skip alert evaluation (used when a scenario wants one combined alert). */
  silent?: boolean;
}

export interface UpdateWardResult {
  ward: Ward;
  facility: Facility;
  changed: boolean;
  alerts: AlertRunResult;
}

const HISTORY_MIN_INTERVAL_MS = 5 * 60_000;

function shouldRecordHistory(sql: string, id: unknown, force: boolean): boolean {
  if (force) return true;
  const last = get<{ ts: number }>(sql, [id]);
  if (!last) return true;
  return Date.now() - Number(last.ts) >= HISTORY_MIN_INTERVAL_MS;
}

function facilityAggregate(facilityId: string) {
  const row = get<{ capacity: number; occupied: number }>(
    `SELECT COALESCE(SUM(capacity),0) AS capacity, COALESCE(SUM(occupied),0) AS occupied
     FROM wards WHERE facility_id = ?`,
    [facilityId],
  );
  const capacity = Number(row?.capacity ?? 0);
  const occupied = Number(row?.occupied ?? 0);
  return snapshot(occupied, capacity);
}

export async function updateWard(input: UpdateWardInput): Promise<UpdateWardResult> {
  const source = input.source ?? "staff";
  const before = getWard(input.wardId);
  if (!before) throw new Error(`Ward ${input.wardId} not found`);

  const facilityBefore = getFacility(before.facility_id);
  if (!facilityBefore) throw new Error(`Facility ${before.facility_id} not found`);
  const facilitySnapshotBefore = facilityAggregate(before.facility_id);

  const newCapacity = input.capacity !== undefined ? Math.max(0, Math.floor(input.capacity)) : before.capacity;
  let nextOccupied: number;
  if (input.mode === "set") {
    nextOccupied = Math.floor(input.occupied ?? before.occupied);
  } else {
    nextOccupied = before.occupied + Math.floor(input.delta ?? 0);
  }
  nextOccupied = Math.max(0, Math.min(newCapacity, nextOccupied));

  const changed = nextOccupied !== before.occupied || newCapacity !== before.capacity;
  const now = Date.now();

  run(`UPDATE wards SET capacity = ?, occupied = ?, updated_at = ?, updated_by = ? WHERE id = ?`, [
    newCapacity,
    nextOccupied,
    now,
    input.actor,
    input.wardId,
  ]);

  const recordHistory = shouldRecordHistory(
    `SELECT ts FROM ward_history WHERE ward_id = ? ORDER BY ts DESC LIMIT 1`,
    input.wardId,
    source === "staff" || source === "scenario",
  );
  if (recordHistory) {
    run(`INSERT INTO ward_history(ward_id, capacity, occupied, ts) VALUES(?,?,?,?)`, [
      input.wardId,
      newCapacity,
      nextOccupied,
      now,
    ]);
  }

  // Facility bookkeeping.
  run(`UPDATE facilities SET last_report_at = ?, reported_by = ? WHERE id = ?`, [now, input.actor, before.facility_id]);
  const facilitySnapshotAfter = facilityAggregate(before.facility_id);
  const recordFacilityHistory = shouldRecordHistory(
    `SELECT ts FROM facility_history WHERE facility_id = ? ORDER BY ts DESC LIMIT 1`,
    before.facility_id,
    source === "staff" || source === "scenario",
  );
  if (recordFacilityHistory) {
    run(`INSERT INTO facility_history(facility_id, capacity, occupied, ts) VALUES(?,?,?,?)`, [
      before.facility_id,
      facilitySnapshotAfter.capacity,
      facilitySnapshotAfter.occupied,
      now,
    ]);
  }

  const wardAfter = getWard(input.wardId)!;
  const facilityAfter = getFacility(before.facility_id)!;

  if (source !== "staff" || input.reason) {
    run(`INSERT INTO audit_log(actor, action, entity, detail, ts) VALUES(?,?,?,?,?)`, [
      input.actor,
      changed ? "ward_update" : "ward_noop",
      `ward:${input.wardId}`,
      `${wardAfter.name} @ ${facilityAfter.name}: ${before.occupied}→${nextOccupied} occupied (capacity ${newCapacity})${
        input.reason ? ` — ${input.reason}` : ""
      } [${source}]`,
      now,
    ]);
  }

  let alerts: AlertRunResult = {
    events: [],
    delivery: { attempted: 0, sent: 0, simulated: 0, failed: 0, channels: {} },
  };

  if (changed && !input.silent) {
    const ctx: WardChangeContext = {
      facility: facilityBefore,
      ward: wardAfter,
      wardBefore: snapshot(before.occupied, before.capacity),
      wardAfter: snapshot(wardAfter.occupied, wardAfter.capacity),
      facilityBefore: facilitySnapshotBefore,
      facilityAfter: facilitySnapshotAfter,
      actor: input.actor,
      source,
    };
    alerts = await evaluateAndNotify(ctx);
  }

  // Push the new state to every connected browser.
  broadcast({ kind: "ward", ward: wardAfter, facility: facilityAfter });
  broadcast({ kind: "facility", facility: facilityAfter });
  broadcast({ kind: "summary", summary: nationalSummary() });

  return { ward: wardAfter, facility: facilityAfter, changed, alerts };
}

/** Convenience: admit n patients into a ward. */
export function admit(wardId: number, n: number, actor: string, source: "staff" | "simulator" | "scenario" = "staff") {
  return updateWard({ wardId, mode: "delta", delta: n, actor, source });
}

/** Convenience: discharge n patients from a ward. */
export function discharge(wardId: number, n: number, actor: string, source: "staff" | "simulator" | "scenario" = "staff") {
  return updateWard({ wardId, mode: "delta", delta: -n, actor, source });
}

/** Sets the physical bed complement of a ward (e.g. a side ward is opened). */
export function setCapacity(wardId: number, capacity: number, actor: string) {
  return updateWard({ wardId, mode: "set", capacity, actor, source: "staff", reason: "capacity change" });
}

/** Re-publishes the current national picture to all connected clients. */
export function publishSummary(): void {
  broadcast({ kind: "summary", summary: nationalSummary() });
}

export function facilityWardSummary(facilityId: string) {
  const wards = getWards(facilityId);
  const capacity = wards.reduce((a, w) => a + w.capacity, 0);
  const occupied = wards.reduce((a, w) => a + w.occupied, 0);
  return { wards, capacity, occupied, available: Math.max(0, capacity - occupied), occupancy: pct(occupied, capacity) };
}
