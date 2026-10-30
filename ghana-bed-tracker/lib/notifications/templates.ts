/**
 * Message templates for every alert type, rendered per channel.
 *
 * SMS is written for a 160-character-friendly Ghanaian audience: plain
 * language, the facility name first, an action, and an opt-out.
 */
import { formatKm, wardLabel } from "../format";
import type { AlertEventType, Facility, Severity, Ward } from "../types";

export interface Alternative {
  name: string;
  town: string;
  region_name?: string;
  available: number;
  distance_km?: number;
  phone?: string;
}

export interface RenderInput {
  event: AlertEventType;
  facility: Facility;
  ward?: Ward | null;
  alternatives?: Alternative[];
  /** Patient-facing unsubscribe/manage link token. */
  token?: string;
  threshold?: number;
  /** Used by the manual facility broadcast feature. */
  customTitle?: string;
  customBody?: string;
  baseUrl?: string;
  recipientName?: string;
}

export interface RenderedMessage {
  title: string;
  body: string;
  severity: Severity;
  sms: string;
  subject: string;
  html: string;
  whatsapp: string;
}

function alternativesLine(alts: Alternative[] | undefined): string {
  if (!alts?.length) return "";
  return alts
    .map((a) => {
      const dist = typeof a.distance_km === "number" ? ` (${formatKm(a.distance_km)} away)` : "";
      return `${a.name}, ${a.town}${dist} — ${a.available} free`;
    })
    .join(" | ");
}

export function severityFor(event: AlertEventType): Severity {
  switch (event) {
    case "facility_full":
    case "ward_full":
      return "critical";
    case "high_occupancy":
      return "warning";
    case "facility_reopened":
    case "ward_freed":
      return "success";
    default:
      return "info";
  }
}

export function renderMessage(input: RenderInput): RenderedMessage {
  const { facility: f, ward: w, event, threshold = 90, baseUrl = "http://localhost:3000" } = input;
  const alts = alternativesLine(input.alternatives);
  const wardSuffix = w ? ` — ${wardLabel(w.category)}` : "";
  const manage = `${baseUrl}/alerts?token=${input.token ?? ""}`;

  if (input.customBody || input.customTitle) {
    const title = input.customTitle ?? `Message from ${f.name}`;
    const body = input.customBody ?? "";
    return {
      title,
      body,
      severity: "info",
      sms: `${title}. ${body} Manage alerts: ${manage}`.slice(0, 480),
      subject: title,
      html: wrapHtml(title, body, f, alts, manage),
      whatsapp: `*${title}*\n\n${body}\n\n_${f.name}, ${f.town}_\nManage alerts: ${manage}`,
    };
  }

  switch (event) {
    case "facility_full": {
      const title = `${f.name} is FULL — no beds available`;
      const body = `All ${f.capacity} inpatient beds at ${f.name} (${f.town}, ${f.region_name}) are occupied as of now.${
        alts ? ` Nearest facilities with free beds: ${alts}.` : ""
      } Call ${f.phone} before travelling.`;
      const sms = `GHANABED: ${f.name} is FULL (0/${f.capacity} beds free).${
        alts ? ` Try: ${alts}.` : ""
      } Call ${f.phone}. Stop: reply STOP`.slice(0, 480);
      return { title, body, severity: "critical", sms, subject: title, html: wrapHtml(title, body, f, alts, manage), whatsapp: `🔴 *${title}*\n\n${body}` };
    }
    case "facility_reopened": {
      const title = `${f.name} now has ${f.available} free bed${f.available === 1 ? "" : "s"}`;
      const body = `${f.name} (${f.town}) is no longer full: ${f.available} of ${f.capacity} beds are free (occupancy ${f.occupancy}%). Beds are held on a first-come basis — call ${f.phone} before travelling.`;
      const sms = `GHANABED: ${f.name} has ${f.available} free bed(s) again (${f.occupancy}% full). Call ${f.phone}. Stop: reply STOP`.slice(0, 480);
      return { title, body, severity: "success", sms, subject: title, html: wrapHtml(title, body, f, alts, manage), whatsapp: `🟢 *${title}*\n\n${body}` };
    }
    case "ward_full": {
      const title = `${wardLabel(w!.category)} at ${f.name} is full`;
      const body = `The ${wardLabel(w!.category)}${wardSuffix && w ? "" : ""} at ${f.name} has no free beds (${w!.capacity}/${w!.capacity} occupied).${
        alts ? ` Alternatives nearby: ${alts}.` : ""
      }`;
      const sms = `GHANABED: ${wardLabel(w!.category)} at ${f.name} is FULL. ${alts ? `Try: ${alts}.` : ""} Call ${f.phone}. Stop: reply STOP`.slice(0, 480);
      return { title, body, severity: "critical", sms, subject: title, html: wrapHtml(title, body, f, alts, manage), whatsapp: `🔴 *${title}*\n\n${body}` };
    }
    case "ward_freed": {
      const title = `A bed has been freed at ${f.name}${w ? ` (${wardLabel(w.category)})` : ""}`;
      const body = `${w ? `${wardLabel(w.category)} now has ${w.available} of ${w.capacity} beds free` : `${f.available} of ${f.capacity} beds are free`} at ${f.name}, ${f.town}. Facility occupancy is ${f.occupancy}%. Call ${f.phone} to confirm admission.`;
      const sms = `GHANABED: Bed free at ${f.name}${w ? ` (${wardLabel(w.category)})` : ""} — ${f.available}/${f.capacity} beds available. Call ${f.phone}. Stop: reply STOP`.slice(0, 480);
      return { title, body, severity: "success", sms, subject: title, html: wrapHtml(title, body, f, alts, manage), whatsapp: `🟢 *${title}*\n\n${body}` };
    }
    case "high_occupancy": {
      const title = `${f.name} has reached ${f.occupancy}% occupancy`;
      const body = `${f.name} (${f.town}, ${f.region_name}) is above the ${threshold}% alert threshold with only ${f.available} bed(s) free.${
        alts ? ` Consider: ${alts}.` : ""
      }`;
      const sms = `GHANABED: ${f.name} is ${f.occupancy}% full (${f.available} beds left). Expect delays. ${alts ? `Alt: ${alts}.` : ""} Stop: reply STOP`.slice(0, 480);
      return { title, body, severity: "warning", sms, subject: title, html: wrapHtml(title, body, f, alts, manage), whatsapp: `🟠 *${title}*\n\n${body}` };
    }
    case "occupancy_recovered": {
      const title = `Bed pressure easing at ${f.name}`;
      const body = `${f.name} has dropped back to ${f.occupancy}% occupancy (${f.available} beds free), below the ${threshold}% alert threshold.`;
      const sms = `GHANABED: ${f.name} now ${f.occupancy}% full, ${f.available} beds free. Stop: reply STOP`.slice(0, 480);
      return { title, body, severity: "info", sms, subject: title, html: wrapHtml(title, body, f, alts, manage), whatsapp: `🔵 *${title}*\n\n${body}` };
    }
    case "stale_report": {
      const title = `${f.name} has not reported bed counts recently`;
      const body = `The last ward report from ${f.name} is older than the data-quality window. Figures shown to patients may be out of date.`;
      const sms = `GHANABED (staff): ${f.name} report is stale. Update ward counts in the GhanaBed portal.`.slice(0, 480);
      return { title, body, severity: "warning", sms, subject: title, html: wrapHtml(title, body, f, alts, manage), whatsapp: `⚠️ *${title}*\n\n${body}` };
    }
    default: {
      const title = `Update from ${f.name}`;
      const body = `${f.name}: ${f.available} of ${f.capacity} beds free (occupancy ${f.occupancy}%).`;
      const sms = `GHANABED: ${f.name} ${f.available}/${f.capacity} beds free. Stop: reply STOP`.slice(0, 480);
      return { title, body, severity: "info", sms, subject: title, html: wrapHtml(title, body, f, alts, manage), whatsapp: `*${title}*\n\n${body}` };
    }
  }
}

function wrapHtml(title: string, body: string, f: Facility, alts: string, manage: string): string {
  const bar = f.available === 0 ? "#f43f5e" : f.occupancy >= 90 ? "#fb923c" : f.occupancy >= 70 ? "#fbbf24" : "#34d399";
  return `<!doctype html>
<html><body style="margin:0;background:#0b1220;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e2e8f0">
  <div style="max-width:560px;margin:0 auto;background:#111a2e;border-radius:14px;overflow:hidden;border:1px solid #1e293b">
    <div style="height:5px;background:${bar}"></div>
    <div style="padding:24px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8">GhanaBed alert</p>
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#f8fafc">${title}</h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#cbd5e1">${body}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#94a3b8;margin-bottom:18px">
        <tr><td style="padding:6px 0">Facility</td><td style="padding:6px 0;text-align:right;color:#e2e8f0">${f.name}</td></tr>
        <tr><td style="padding:6px 0">Location</td><td style="padding:6px 0;text-align:right;color:#e2e8f0">${f.town}, ${f.region_name}</td></tr>
        <tr><td style="padding:6px 0">Beds free</td><td style="padding:6px 0;text-align:right;color:#e2e8f0">${f.available} of ${f.capacity} (${f.occupancy}% occupied)</td></tr>
        <tr><td style="padding:6px 0">Admissions desk</td><td style="padding:6px 0;text-align:right;color:#e2e8f0">${f.phone}</td></tr>
      </table>
      <a href="${manage}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-size:14px;font-weight:600">Manage my alerts</a>
    </div>
    <div style="padding:16px 24px;background:#0b1220;font-size:12px;color:#64748b;line-height:1.6">
      Bed counts are reported by facility ward staff and update continuously. Always call the admissions desk before travelling.<br/>
      You are receiving this because you subscribed on GhanaBed. <a href="${manage}" style="color:#94a3b8">Unsubscribe</a>.
    </div>
  </div>
</body></html>`;
}
