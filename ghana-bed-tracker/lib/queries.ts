/**
 * Read-side queries: everything the UI needs about facilities, wards,
 * history, alerts and notifications.
 */
import { all, get, run } from "./db";
import { bedStatus, haversineKm, isStale, pct } from "./format";
import type {
  AlertEvent,
  AuditEntry,
  Facility,
  HistoryPoint,
  NationalSummary,
  NotificationRecord,
  RegionSummary,
  Subscription,
  Ward,
} from "./types";

export type SortKey =
  | "occupancy_desc"
  | "occupancy_asc"
  | "available_desc"
  | "name"
  | "region"
  | "distance"
  | "recent";

export interface FacilityFilters {
  search?: string;
  region?: string;
  type?: string;
  ownership?: string;
  /** free | filling | critical | full */
  status?: string;
  /** ward category that must have at least one free bed */
  category?: string;
  /** only facilities with any free bed */
  availableOnly?: boolean;
  sort?: SortKey;
  lat?: number;
  lon?: number;
  limit?: number;
}

const FACILITY_SELECT = `
  SELECT f.id, f.name, f.region_id, r.name AS region_name, f.district, f.town,
         f.type, f.ownership, f.lat, f.lon, f.phone, f.email,
         f.last_report_at, f.reported_by,
         COALESCE(SUM(w.capacity), 0) AS capacity,
         COALESCE(SUM(w.occupied), 0) AS occupied
  FROM facilities f
  JOIN regions r ON r.id = f.region_id
  LEFT JOIN wards w ON w.facility_id = f.id
`;

/** One grouped query instead of N per facility: which ward types have free beds. */
function attachFreeCategories(rows: (Facility & { distance_km?: number })[]): void {
  if (!rows.length) return;
  const free = all<{ facility_id: string; category: string; free: number }>(
    `SELECT facility_id, category, SUM(capacity - occupied) AS free
     FROM wards WHERE capacity > occupied GROUP BY facility_id, category`,
  );
  const map = new Map<string, { category: string; available: number }[]>();
  for (const r of free) {
    const list = map.get(r.facility_id) ?? [];
    list.push({ category: r.category, available: Number(r.free) });
    map.set(r.facility_id, list);
  }
  for (const row of rows) {
    const list = (map.get(row.id) ?? []).sort((a, b) => b.available - a.available);
    row.free_categories = list;
  }
}

function rowToFacility(row: Record<string, unknown>, lat?: number, lon?: number): Facility & { distance_km?: number } {
  const capacity = Number(row.capacity ?? 0);
  const occupied = Number(row.occupied ?? 0);
  const lastReportAt = Number(row.last_report_at ?? 0);
  const f = {
    id: String(row.id),
    name: String(row.name),
    region_id: String(row.region_id),
    region_name: String(row.region_name ?? ""),
    district: String(row.district),
    town: String(row.town),
    type: String(row.type) as Facility["type"],
    ownership: String(row.ownership) as Facility["ownership"],
    lat: Number(row.lat ?? 0),
    lon: Number(row.lon ?? 0),
    phone: String(row.phone),
    email: String(row.email),
    capacity,
    occupied,
    available: Math.max(0, capacity - occupied),
    occupancy: pct(occupied, capacity),
    last_report_at: lastReportAt,
    reported_by: row.reported_by == null ? null : String(row.reported_by),
    stale: isStale(lastReportAt),
  };
  if (lat !== undefined && lon !== undefined) {
    return { ...f, distance_km: haversineKm(lat, lon, f.lat, f.lon) };
  }
  return f;
}

export function listFacilities(filters: FacilityFilters = {}): (Facility & { distance_km?: number })[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.search) {
    where.push("(f.name LIKE ? OR f.town LIKE ? OR f.district LIKE ? OR r.name LIKE ?)");
    const q = `%${filters.search}%`;
    params.push(q, q, q, q);
  }
  if (filters.region) {
    where.push("f.region_id = ?");
    params.push(filters.region);
  }
  if (filters.type) {
    where.push("f.type = ?");
    params.push(filters.type);
  }
  if (filters.ownership) {
    where.push("f.ownership = ?");
    params.push(filters.ownership);
  }
  if (filters.category) {
    where.push(
      "EXISTS (SELECT 1 FROM wards cw WHERE cw.facility_id = f.id AND cw.category = ? AND cw.occupied < cw.capacity)",
    );
    params.push(filters.category);
  }

  const sql = `${FACILITY_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} GROUP BY f.id`;
  let rows = all<Record<string, unknown>>(sql, params).map((r) => rowToFacility(r, filters.lat, filters.lon));
  attachFreeCategories(rows);

  if (filters.availableOnly) rows = rows.filter((f) => f.available > 0);
  if (filters.status) rows = rows.filter((f) => bedStatus(f.occupied, f.capacity) === filters.status);

  switch (filters.sort) {
    case "occupancy_asc":
      rows.sort((a, b) => a.occupancy - b.occupancy || b.available - a.available);
      break;
    case "available_desc":
      rows.sort((a, b) => b.available - a.available || a.occupancy - b.occupancy);
      break;
    case "name":
      rows.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "region":
      rows.sort((a, b) => a.region_name.localeCompare(b.region_name) || b.occupancy - a.occupancy);
      break;
    case "recent":
      rows.sort((a, b) => b.last_report_at - a.last_report_at);
      break;
    case "distance":
      rows.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
      break;
    default:
      // Worst pressure first — that is what the national dashboard cares about.
      rows.sort((a, b) => b.occupancy - a.occupancy || a.name.localeCompare(b.name));
  }

  return filters.limit ? rows.slice(0, filters.limit) : rows;
}

export function getFacility(id: string): (Facility & { distance_km?: number }) | undefined {
  const row = get<Record<string, unknown>>(`${FACILITY_SELECT} WHERE f.id = ? GROUP BY f.id`, [id]);
  if (!row) return undefined;
  const facility = rowToFacility(row);
  attachFreeCategories([facility]);
  return facility;
}

export function getWards(facilityId: string): Ward[] {
  const rows = all<Record<string, unknown>>(
    `SELECT id, facility_id, category, name, capacity, occupied, updated_at, updated_by
     FROM wards WHERE facility_id = ? ORDER BY
       CASE category
         WHEN 'emergency' THEN 0 WHEN 'icu' THEN 1 WHEN 'maternity' THEN 2
         WHEN 'paediatric' THEN 3 WHEN 'surgical' THEN 4 WHEN 'orthopaedic' THEN 5
         WHEN 'general_male' THEN 6 WHEN 'general_female' THEN 7 ELSE 8
       END, name`,
    [facilityId],
  );
  return rows.map((r) => {
    const capacity = Number(r.capacity);
    const occupied = Number(r.occupied);
    return {
      id: Number(r.id),
      facility_id: String(r.facility_id),
      category: String(r.category) as Ward["category"],
      name: String(r.name),
      capacity,
      occupied,
      available: Math.max(0, capacity - occupied),
      occupancy: pct(occupied, capacity),
      updated_at: Number(r.updated_at),
      updated_by: r.updated_by == null ? null : String(r.updated_by),
    };
  });
}

export function getWard(wardId: number): Ward | undefined {
  const r = get<Record<string, unknown>>(
    `SELECT w.id, w.facility_id, w.category, w.name, w.capacity, w.occupied, w.updated_at, w.updated_by,
            f.name AS facility_name
     FROM wards w JOIN facilities f ON f.id = w.facility_id WHERE w.id = ?`,
    [wardId],
  );
  if (!r) return undefined;
  const capacity = Number(r.capacity);
  const occupied = Number(r.occupied);
  return {
    id: Number(r.id),
    facility_id: String(r.facility_id),
    facility_name: String(r.facility_name),
    category: String(r.category) as Ward["category"],
    name: String(r.name),
    capacity,
    occupied,
    available: Math.max(0, capacity - occupied),
    occupancy: pct(occupied, capacity),
    updated_at: Number(r.updated_at),
    updated_by: r.updated_by == null ? null : String(r.updated_by),
  };
}

export function nationalSummary(): NationalSummary {
  const facilities = listFacilities();
  const capacity = facilities.reduce((a, f) => a + f.capacity, 0);
  const occupied = facilities.reduce((a, f) => a + f.occupied, 0);

  const byRegion = new Map<string, RegionSummary>();
  for (const f of facilities) {
    const key = f.region_id;
    const cur =
      byRegion.get(key) ??
      ({
        region_id: key,
        region_name: f.region_name,
        facilities: 0,
        capacity: 0,
        occupied: 0,
        available: 0,
        occupancy: 0,
        full: 0,
      } as RegionSummary);
    cur.facilities += 1;
    cur.capacity += f.capacity;
    cur.occupied += f.occupied;
    cur.available += f.available;
    cur.full += f.available === 0 ? 1 : 0;
    byRegion.set(key, cur);
  }
  const regions = [...byRegion.values()].map((r) => ({ ...r, occupancy: pct(r.occupied, r.capacity) }));
  regions.sort((a, b) => b.occupancy - a.occupancy);

  return {
    facilities: facilities.length,
    capacity,
    occupied,
    available: Math.max(0, capacity - occupied),
    occupancy: pct(occupied, capacity),
    full: facilities.filter((f) => f.available === 0 && f.capacity > 0).length,
    critical: facilities.filter((f) => f.capacity > 0 && f.occupancy >= 90 && f.occupancy < 100).length,
    stale: facilities.filter((f) => f.stale).length,
    regions,
    updated_at: Date.now(),
  };
}

export function facilityHistory(facilityId: string, hours = 24): HistoryPoint[] {
  const since = Date.now() - hours * 3_600_000;
  return all<HistoryPoint>(
    `SELECT ts, capacity, occupied FROM facility_history
     WHERE facility_id = ? AND ts >= ? ORDER BY ts ASC`,
    [facilityId, since],
  ).map((r) => ({ ts: Number(r.ts), capacity: Number(r.capacity), occupied: Number(r.occupied) }));
}

export function wardHistory(wardId: number, hours = 12): HistoryPoint[] {
  const since = Date.now() - hours * 3_600_000;
  return all<HistoryPoint>(
    `SELECT ts, capacity, occupied FROM ward_history WHERE ward_id = ? AND ts >= ? ORDER BY ts ASC`,
    [wardId, since],
  ).map((r) => ({ ts: Number(r.ts), capacity: Number(r.capacity), occupied: Number(r.occupied) }));
}

export function recentAlerts(limit = 30, facilityId?: string): (AlertEvent & { facility_name: string; region_name: string })[] {
  const sql = `SELECT a.id, a.facility_id, a.ward_id, a.type, a.severity, a.title, a.message, a.notified, a.ts,
                      f.name AS facility_name, r.name AS region_name
               FROM alert_events a
               JOIN facilities f ON f.id = a.facility_id
               JOIN regions r ON r.id = f.region_id
               ${facilityId ? "WHERE a.facility_id = ?" : ""}
               ORDER BY a.ts DESC LIMIT ?`;
  const params = facilityId ? [facilityId, limit] : [limit];
  return all<AlertEvent & { facility_name: string; region_name: string }>(sql, params).map((r) => ({
    ...r,
    id: Number(r.id),
    ts: Number(r.ts),
    ward_id: r.ward_id == null ? null : Number(r.ward_id),
    notified: Number(r.notified),
  }));
}

export function listNotifications(limit = 60, facilityId?: string, channel?: string): (NotificationRecord & { facility_name: string | null })[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (facilityId) {
    where.push("n.facility_id = ?");
    params.push(facilityId);
  }
  if (channel) {
    where.push("n.channel = ?");
    params.push(channel);
  }
  const sql = `SELECT n.id, n.subscription_id, n.channel, n.provider, n.recipient, n.event_type, n.severity,
                      n.title, n.body, n.facility_id, n.status, n.error, n.meta, n.created_at,
                      f.name AS facility_name
               FROM notification_log n LEFT JOIN facilities f ON f.id = n.facility_id
               ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
               ORDER BY n.created_at DESC, n.id DESC LIMIT ?`;
  params.push(limit);
  return all<NotificationRecord & { facility_name: string | null }>(sql, params).map((r) => ({
    ...r,
    id: Number(r.id),
    subscription_id: r.subscription_id == null ? null : Number(r.subscription_id),
    created_at: Number(r.created_at),
  }));
}

export function listSubscriptions(opts: { token?: string; facilityId?: string } = {}): Subscription[] {
  if (opts.token) {
    return all<Record<string, unknown>>(`SELECT * FROM subscriptions WHERE token = ? ORDER BY created_at DESC`, [
      opts.token,
    ]).map(normalizeSub);
  }
  if (opts.facilityId) {
    return all<Record<string, unknown>>(
      `SELECT * FROM subscriptions WHERE facility_id = ? AND active = 1 ORDER BY created_at DESC`,
      [opts.facilityId],
    ).map(normalizeSub);
  }
  return all<Record<string, unknown>>(`SELECT * FROM subscriptions ORDER BY created_at DESC`).map(normalizeSub);
}

function normalizeSub(r: Record<string, unknown>): Subscription {
  return {
    id: Number(r.id),
    token: String(r.token),
    name: String(r.name),
    channel: String(r.channel) as Subscription["channel"],
    contact: String(r.contact),
    facility_id: r.facility_id == null ? null : String(r.facility_id),
    region_id: r.region_id == null ? null : String(r.region_id),
    ward_category: r.ward_category == null ? null : String(r.ward_category),
    notify_on: String(r.notify_on),
    threshold: Number(r.threshold),
    cooldown_minutes: Number(r.cooldown_minutes),
    active: Number(r.active),
    verified: Number(r.verified),
    created_at: Number(r.created_at),
    push_subscription: r.push_subscription == null ? null : String(r.push_subscription),
  };
}

export function listRegions(): { id: string; name: string; capital: string }[] {
  return all<{ id: string; name: string; capital: string }>(`SELECT id, name, capital FROM regions ORDER BY name`);
}

export function listAudit(limit = 40, facilityId?: string): AuditEntry[] {
  const sql = facilityId
    ? `SELECT id, actor, action, entity, detail, ts FROM audit_log WHERE entity = ? OR entity LIKE ? ORDER BY ts DESC LIMIT ?`
    : `SELECT id, actor, action, entity, detail, ts FROM audit_log ORDER BY ts DESC LIMIT ?`;
  const params = facilityId ? [facilityId, `ward:${facilityId}%`, limit] : [limit];
  return all<AuditEntry>(sql, params).map((r) => ({ ...r, id: Number(r.id), ts: Number(r.ts) }));
}

export function facilityTypeOptions(): string[] {
  return all<{ type: string }>(`SELECT DISTINCT type FROM facilities ORDER BY type`).map((r) => r.type);
}

export function ownershipOptions(): string[] {
  return all<{ ownership: string }>(`SELECT DISTINCT ownership FROM facilities ORDER BY ownership`).map(
    (r) => r.ownership,
  );
}

/** Nearest facilities with free beds — used inside "facility full" alerts. */
export function nearestAvailable(lat: number, lon: number, excludeId: string, count = 3) {
  return listFacilities({ availableOnly: true, status: "free" })
    .filter((f) => f.id !== excludeId)
    .map((f) => ({ ...f, distance_km: haversineKm(lat, lon, f.lat, f.lon) }))
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, count);
}

export function countSubscribers(facilityId: string): number {
  const row = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM subscriptions WHERE active = 1 AND (facility_id = ? OR facility_id IS NULL)`,
    [facilityId],
  );
  return Number(row?.n ?? 0);
}

export function touchFacilityReport(facilityId: string, actor: string): void {
  run(`UPDATE facilities SET last_report_at = ?, reported_by = ? WHERE id = ?`, [Date.now(), actor, facilityId]);
}
