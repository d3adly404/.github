/** Formatting + domain helpers shared by the server and the browser. */
import type { WardCategory } from "./types";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function pct(occupied: number, capacity: number): number {
  if (!capacity) return 0;
  return Math.round((occupied / capacity) * 100);
}

export type BedStatus = "free" | "filling" | "critical" | "full";

export function bedStatus(occupied: number, capacity: number): BedStatus {
  if (capacity === 0) return "free";
  const p = (occupied / capacity) * 100;
  if (p >= 100) return "full";
  if (p >= 90) return "critical";
  if (p >= 70) return "filling";
  return "free";
}

export const STATUS_META: Record<BedStatus, { label: string; text: string; bg: string; ring: string; dot: string; hex: string }> = {
  free: {
    label: "Beds available",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
    dot: "bg-emerald-400",
    hex: "#34d399",
  },
  filling: {
    label: "Filling up",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/30",
    dot: "bg-amber-400",
    hex: "#fbbf24",
  },
  critical: {
    label: "Almost full",
    text: "text-orange-300",
    bg: "bg-orange-500/10",
    ring: "ring-orange-500/30",
    dot: "bg-orange-400",
    hex: "#fb923c",
  },
  full: {
    label: "FULL — no beds",
    text: "text-rose-300",
    bg: "bg-rose-500/10",
    ring: "ring-rose-500/40",
    dot: "bg-rose-500",
    hex: "#f43f5e",
  },
};

export const WARD_LABELS: Record<string, string> = {
  general_male: "General — Male",
  general_female: "General — Female",
  maternity: "Maternity / Obstetrics",
  paediatric: "Paediatric",
  surgical: "Surgical",
  emergency: "Emergency / Observation",
  icu: "ICU / HDU",
  isolation: "Isolation",
  orthopaedic: "Orthopaedic",
};

export function wardLabel(category: WardCategory | string | null): string {
  if (!category) return "Any ward";
  return WARD_LABELS[category] ?? category;
}

export const EVENT_LABELS: Record<string, string> = {
  facility_full: "Facility full",
  facility_reopened: "Beds reopened",
  ward_full: "Ward full",
  ward_freed: "Bed freed",
  high_occupancy: "High occupancy",
  occupancy_recovered: "Pressure easing",
  broadcast: "Facility broadcast",
  stale_report: "Stale report",
};

export const CHANNEL_LABELS: Record<string, string> = {
  inapp: "In-app",
  browser: "Browser push",
  sms: "SMS",
  email: "E-mail",
  whatsapp: "WhatsApp",
};

/** Ghana is on GMT year-round, so Africa/Accra == UTC. */
const TZ = "Africa/Accra";

export function timeAgo(ts: number, now = Date.now()): string {
  const secs = Math.max(0, Math.floor((now - ts) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatClock(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(ts));
}

export function formatDateTime(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(ts));
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date(ts));
}

/** Reports older than this are flagged as stale for data-quality oversight. */
export const STALE_AFTER_MS = 90 * 60_000;

export function isStale(lastReportAt: number, now = Date.now()): boolean {
  return now - lastReportAt > STALE_AFTER_MS;
}

/**
 * Normalise a Ghanaian phone number to international format.
 * Accepts 0244123456, 244123456, +233244123456, 00233244123456.
 */
export function normalizeGhPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  let cleaned = digits.replace(/^\+/, "");
  if (cleaned.startsWith("00")) cleaned = cleaned.slice(2);
  if (cleaned.startsWith("233")) cleaned = cleaned.slice(3);
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);
  if (!/^[2-5]\d{8}$/.test(cleaned)) return null;
  return `+233${cleaned}`;
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

/** Great-circle distance in kilometres. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** Compact Ghana cedi / number formatting. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
