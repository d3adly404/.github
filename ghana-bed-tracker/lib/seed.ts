/**
 * Deterministic seed routine. Runs automatically when the database is empty so
 * the app is useful the moment it boots, and is reproducible across restarts.
 */
import { randomBytes, pbkdf2Sync } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { DEMO_USERS, FACILITIES, REGIONS, WARD_CATEGORIES } from "./seed-data";
import type { FacilityType, WardCategory } from "./types";

export const DEMO_PASSWORD = "BedTrack2026!";

/** mulberry32 — tiny deterministic PRNG. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
}

/** Facilities that start completely full, so alerting is demonstrable at once. */
const FULL_AT_START = new Set([
  "ridge-regional",
  "tema-general",
  "komfo-anokye",
  "cape-coast-teaching",
  "bolgatanga-regional",
]);

/** Facilities that start in the "critical" band (90–99%). */
const CRITICAL_AT_START = new Set([
  "korle-bu",
  "tamale-teaching",
  "ho-teaching",
  "effia-nkwanta",
  "sunyani-regional",
  "koforidua-regional",
  "tarkwa-government",
  "wa-regional",
]);

function wardsFor(type: FacilityType, totalBeds: number, r: () => number) {
  const eligible = WARD_CATEGORIES.filter((c) => !c.types || c.types.includes(type));
  const shareSum = eligible.reduce((acc, c) => acc + c.share, 0);
  const wards: { category: WardCategory; name: string; capacity: number }[] = [];
  let allocated = 0;

  for (const c of eligible) {
    const raw = (c.share / shareSum) * totalBeds;
    let capacity = Math.max(c.min, Math.round(raw * (0.9 + r() * 0.2)));
    if (type === "Psychiatric" && c.id !== "general_male" && c.id !== "general_female" && c.id !== "emergency" && c.id !== "isolation") {
      capacity = 0; // psych facilities only run general/emergency/isolation beds
    }
    if (capacity <= 0) continue;
    wards.push({ category: c.id as WardCategory, name: c.label, capacity });
    allocated += capacity;
  }

  // Reconcile rounding drift against the published bed complement.
  const drift = totalBeds - allocated;
  if (wards.length && drift !== 0) {
    wards.sort((a, b) => b.capacity - a.capacity);
    wards[0].capacity = Math.max(1, wards[0].capacity + drift);
  }
  return wards;
}

/** Plausible 10-digit Ghanaian landline: area code (0XX) + 7 digits, grouped 3+4. */
const AREA_CODES: Record<string, string> = {
  greater_accra: "030",
  ashanti: "032",
  western: "031",
  western_north: "031",
  central: "033",
  eastern: "034",
  volta: "036",
  oti: "036",
  northern: "037",
  savannah: "037",
  north_east: "037",
  upper_east: "038",
  upper_west: "039",
  bono: "035",
  bono_east: "035",
  ahafo: "035",
};

function phoneFor(id: string, region: string, r: () => number): string {
  const area = AREA_CODES[region] ?? "030";
  const seven = String(Math.floor(r() * 9_000_000) + 1_000_000);
  // Use the id hash only for variety; the format always stays valid.
  void id;
  return `${area} ${seven.slice(0, 3)} ${seven.slice(3)}`;
}

export function seedDatabase(db: DatabaseSync): void {
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const reg of REGIONS) {
      db.prepare("INSERT OR IGNORE INTO regions(id, name, capital) VALUES(?,?,?)").run(
        reg.id,
        reg.name,
        reg.capital,
      );
    }

    for (const f of FACILITIES) {
      const r = rng(hashSeed(f.id));
      const phone = phoneFor(f.id, f.region, r);
      const email = `bedoffice@${f.id}.health.gh`;

      // Target occupancy for the seeded "now" snapshot.
      let target: number;
      if (FULL_AT_START.has(f.id)) target = 1;
      else if (CRITICAL_AT_START.has(f.id)) target = 0.9 + r() * 0.08;
      else target = 0.55 + r() * 0.35;

      const wards = wardsFor(f.type, f.beds, r);

      db.prepare(
        `INSERT OR IGNORE INTO facilities
         (id, name, region_id, district, town, type, ownership, lat, lon, phone, email, last_report_at, reported_by)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        f.id,
        f.name,
        f.region,
        f.district,
        f.town,
        f.type,
        f.ownership,
        f.lat,
        f.lon,
        phone,
        email,
        now - Math.floor(r() * 45 * 60_000),
        "Ward Charge Nurse",
      );

      const forceFull = FULL_AT_START.has(f.id);
      const insWard = db.prepare(
        `INSERT INTO wards(facility_id, category, name, capacity, occupied, updated_at, updated_by)
         VALUES(?,?,?,?,?,?,?)`,
      );
      const insWardHist = db.prepare(
        `INSERT INTO ward_history(ward_id, capacity, occupied, ts) VALUES(?,?,?,?)`,
      );

      const wardIds: number[] = [];
      for (const w of wards) {
        // Per-ward noise around the facility target; ICU/isolation run hotter.
        // Facilities in FULL_AT_START are pinned to capacity in every ward so the
        // "no beds available" state — and its alerts — are demonstrable on boot.
        const skew = w.category === "icu" || w.category === "emergency" ? 0.06 : 0;
        const occ = forceFull
          ? w.capacity
          : Math.min(
              w.capacity,
              Math.max(0, Math.round(w.capacity * Math.min(1, target + skew + (r() - 0.5) * 0.12))),
            );
        const res = insWard.run(f.id, w.category, w.name, w.capacity, occ, now - Math.floor(r() * 30 * 60_000), "Ward Charge Nurse") as unknown as {
          lastInsertRowid: number | bigint;
        };
        const wardId = Number(res.lastInsertRowid);
        wardIds.push(wardId);

        // 12 hours of ward history at 1-hour resolution.
        for (let i = 12; i >= 1; i--) {
          const ts = now - i * 3_600_000;
          const drift = Math.round(Math.sin(i / 2 + r()) * w.capacity * 0.08);
          const past = Math.max(0, Math.min(w.capacity, occ + drift));
          insWardHist.run(wardId, w.capacity, past, ts);
        }
      }

      // 24 hours of facility history at 30-minute resolution with a day/night rhythm.
      const capacity = wards.reduce((a, w) => a + w.capacity, 0);
      const occupiedNow = db
        .prepare("SELECT COALESCE(SUM(occupied),0) AS n FROM wards WHERE facility_id = ?")
        .get(f.id) as { n: number };
      const occupied = Number(occupiedNow.n);
      const insFacHist = db.prepare(
        `INSERT INTO facility_history(facility_id, capacity, occupied, ts) VALUES(?,?,?,?)`,
      );
      for (let i = 48; i >= 1; i--) {
        const ts = now - i * 1_800_000;
        const hour = new Date(ts).getHours();
        // Beds fill through the morning, ease slightly after evening rounds.
        const rhythm = Math.sin(((hour - 6) / 24) * Math.PI * 2) * 0.05;
        const past = Math.max(
          0,
          Math.min(capacity, Math.round(capacity * (target + rhythm) + (r() - 0.5) * capacity * 0.03)),
        );
        insFacHist.run(f.id, capacity, past, ts);
      }
      insFacHist.run(f.id, capacity, occupied, now);
    }

    // ── Demo staff accounts ───────────────────────────────────────
    for (const u of DEMO_USERS) {
      const salt = randomBytes(16).toString("hex");
      db.prepare(
        `INSERT OR IGNORE INTO users(username, name, password_hash, salt, role, facility_id)
         VALUES(?,?,?,?,?,?)`,
      ).run(u.username, u.name, hashPassword(DEMO_PASSWORD, salt), salt, u.role, u.facility);
    }

    // ── Demo patient subscriptions + a pre-populated notification outbox ──
    const demoSubs: {
      name: string;
      channel: string;
      contact: string;
      facility: string | null;
      region: string | null;
      ward: string | null;
      notifyOn: string;
      cooldown: number;
    }[] = [
      { name: "Ama Serwaa", channel: "sms", contact: "+233244120987", facility: "korle-bu", region: null, ward: "maternity", notifyOn: "bed_freed,facility_full,ward_full", cooldown: 15 },
      { name: "Kofi Asante", channel: "whatsapp", contact: "+233209554311", facility: "komfo-anokye", region: null, ward: null, notifyOn: "bed_freed,facility_full,high_occupancy", cooldown: 15 },
      { name: "Gifty Appiah", channel: "email", contact: "gifty.appiah@example.com", facility: null, region: "greater_accra", ward: null, notifyOn: "bed_freed,facility_full", cooldown: 30 },
      { name: "Ibrahim Fuseini", channel: "sms", contact: "+233541778230", facility: "tamale-teaching", region: null, ward: "icu", notifyOn: "bed_freed,ward_full,any_change", cooldown: 10 },
      { name: "Efua Nyarko", channel: "browser", contact: "browser:demo-efua", facility: "ridge-regional", region: null, ward: null, notifyOn: "bed_freed,facility_full", cooldown: 15 },
    ];

    const insSub = db.prepare(
      `INSERT INTO subscriptions
       (token, name, channel, contact, facility_id, region_id, ward_category, notify_on, threshold, cooldown_minutes, active, verified, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,1,1,?)`,
    );
    for (const s of demoSubs) {
      insSub.run(
        `demo-${hashSeed(s.contact).toString(36)}`,
        s.name,
        s.channel,
        s.contact,
        s.facility,
        s.region,
        s.ward,
        s.notifyOn,
        90,
        s.cooldown,
        now - 86_400_000,
      );
    }

    seedOutbox(db, now);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** A handful of historic alerts + delivered messages so the UI is never empty. */
function seedOutbox(db: DatabaseSync, now: number): void {
  const facilities = db
    .prepare("SELECT id, name FROM facilities WHERE id IN ('ridge-regional','komfo-anokye','korle-bu','tamale-teaching','cape-coast-teaching')")
    .all() as { id: string; name: string }[];
  const byId = new Map(facilities.map((f) => [f.id, f.name]));

  const events: [string, string, string, number, number][] = [
    ["ridge-regional", "facility_full", "critical", now - 3 * 3_600_000, 4],
    ["komfo-anokye", "high_occupancy", "warning", now - 5 * 3_600_000, 3],
    ["korle-bu", "ward_freed", "success", now - 6 * 3_600_000, 6],
    ["tamale-teaching", "facility_full", "critical", now - 9 * 3_600_000, 2],
    ["cape-coast-teaching", "occupancy_recovered", "info", now - 14 * 3_600_000, 2],
  ];

  const insAlert = db.prepare(
    `INSERT INTO alert_events(facility_id, ward_id, type, severity, title, message, notified, ts)
     VALUES(?,?,?,?,?,?,?,?)`,
  );
  const insNote = db.prepare(
    `INSERT INTO notification_log(subscription_id, channel, provider, recipient, event_type, severity, title, body, facility_id, status, created_at)
     VALUES(NULL,?,?,?,?,?,?,?,?,?,?)`,
  );

  for (const [fid, type, severity, ts, notified] of events) {
    const name = byId.get(fid) ?? "Hospital";
    const titles: Record<string, string> = {
      facility_full: `${name} is currently FULL`,
      ward_freed: `A bed has been freed at ${name}`,
      high_occupancy: `${name} has reached 90%+ occupancy`,
      occupancy_recovered: `Bed pressure easing at ${name}`,
    };
    const bodies: Record<string, string> = {
      facility_full: `All inpatient beds at ${name} are occupied. Nearest facilities with free beds are being listed in the GhanaBed app. Reply STOP to unsubscribe.`,
      ward_freed: `${name} has a free bed again. Please call the admissions desk on arrival to hold it.`,
      high_occupancy: `${name} is above 90% occupancy. Expect delays; consider an alternative facility.`,
      occupancy_recovered: `${name} occupancy has dropped below the alert threshold.`,
    };
    insAlert.run(fid, null, type, severity, titles[type], bodies[type], notified, ts);

    const channels: [string, string][] =
      severity === "critical"
        ? [["sms", "hubtel"], ["whatsapp", "meta-cloud"], ["email", "smtp"], ["inapp", "ghanabed"]]
        : [["sms", "hubtel"], ["inapp", "ghanabed"]];
    for (let i = 0; i < channels.length; i++) {
      const [channel, provider] = channels[i];
      const recipients: Record<string, string> = {
        sms: "+233244120987",
        whatsapp: "+233209554311",
        email: "gifty.appiah@example.com",
        inapp: "GhanaBed web session",
      };
      insNote.run(
        channel,
        provider,
        recipients[channel],
        type,
        severity,
        titles[type],
        bodies[type],
        fid,
        "simulated",
        ts + i * 400,
      );
    }
  }
}
