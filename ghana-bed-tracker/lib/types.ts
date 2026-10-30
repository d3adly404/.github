/**
 * Shared domain types for GhanaBed.
 */

export type RegionId = string;

export type FacilityType =
  | "Teaching"
  | "Regional"
  | "Municipal"
  | "District"
  | "Specialist"
  | "Private"
  | "Psychiatric"
  | "Military"
  | "Mission";

export type Ownership =
  | "Government (GHS)"
  | "Government (MoH)"
  | "Military"
  | "Private"
  | "Mission (CHAG)"
  | "University";

export type WardCategory =
  | "general_male"
  | "general_female"
  | "paediatric"
  | "maternity"
  | "surgical"
  | "emergency"
  | "icu"
  | "isolation"
  | "orthopaedic";

export interface Region {
  id: RegionId;
  name: string;
  capital: string;
}

export interface Facility {
  id: string;
  name: string;
  region_id: string;
  region_name: string;
  district: string;
  town: string;
  type: FacilityType;
  ownership: Ownership;
  lat: number;
  lon: number;
  phone: string;
  email: string;
  capacity: number;
  occupied: number;
  available: number;
  occupancy: number;
  last_report_at: number;
  reported_by: string | null;
  stale: boolean;
  /** Ward categories that currently have at least one free bed. */
  free_categories?: { category: string; available: number }[];
  /** Straight-line distance from the searcher, when a location is supplied. */
  distance_km?: number;
}

export interface Ward {
  id: number;
  facility_id: string;
  facility_name?: string;
  category: WardCategory;
  name: string;
  capacity: number;
  occupied: number;
  available: number;
  occupancy: number;
  updated_at: number;
  updated_by: string | null;
}

export interface HistoryPoint {
  ts: number;
  capacity: number;
  occupied: number;
}

export type ChannelId = "inapp" | "browser" | "sms" | "email" | "whatsapp";

export type NotifyOn =
  | "bed_freed"
  | "facility_full"
  | "ward_full"
  | "high_occupancy"
  | "any_change";

export interface Subscription {
  id: number;
  token: string;
  name: string;
  channel: ChannelId;
  contact: string;
  facility_id: string | null;
  region_id: string | null;
  ward_category: string | null;
  notify_on: string;
  threshold: number;
  cooldown_minutes: number;
  active: number;
  verified: number;
  created_at: number;
  push_subscription?: string | null;
}

export interface NotificationRecord {
  id: number;
  subscription_id: number | null;
  channel: ChannelId;
  provider: string;
  recipient: string;
  event_type: string;
  severity: Severity;
  title: string;
  body: string;
  facility_id: string | null;
  status: "queued" | "simulated" | "sent" | "delivered" | "failed";
  error: string | null;
  meta: string | null;
  created_at: number;
  facility_name?: string | null;
  facility_region?: string | null;
}

export type Severity = "info" | "warning" | "critical" | "success";

export type AlertEventType =
  | "facility_full"
  | "facility_reopened"
  | "ward_full"
  | "ward_freed"
  | "high_occupancy"
  | "occupancy_recovered"
  | "broadcast"
  | "stale_report";

export interface AlertEvent {
  id: number;
  facility_id: string;
  ward_id: number | null;
  type: AlertEventType;
  severity: Severity;
  title: string;
  message: string;
  notified: number;
  ts: number;
  facility_name?: string;
  region_name?: string;
}

export type Role = "ward_staff" | "facility_admin" | "national";

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
  facility_id: string | null;
}

export interface SessionUser extends User {
  facility_name?: string | null;
  region_name?: string | null;
}

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  entity: string;
  detail: string;
  ts: number;
}

/** Payload pushed to browsers over the SSE stream. */
export type StreamMessage =
  | { kind: "facility"; facility: Facility }
  | { kind: "ward"; ward: Ward; facility: Facility }
  | { kind: "alert"; alert: Omit<AlertEvent, "id"> & { id?: number } }
  | { kind: "summary"; summary: NationalSummary }
  | { kind: "ping"; ts: number };

export interface RegionSummary {
  region_id: string;
  region_name: string;
  facilities: number;
  capacity: number;
  occupied: number;
  available: number;
  occupancy: number;
  full: number;
}

export interface NationalSummary {
  facilities: number;
  capacity: number;
  occupied: number;
  available: number;
  occupancy: number;
  full: number;
  critical: number;
  stale: number;
  regions: RegionSummary[];
  updated_at: number;
}
