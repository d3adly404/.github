# 🛏️ GhanaBed — hospital bed availability & patient alerting for Ghana

**Know if there is a bed before you travel.**

GhanaBed is a full-stack web app that tracks inpatient bed availability across Ghana's 16 regions in real time and
notifies patients the moment a bed frees up — or warns them that a hospital has run full, with the nearest facilities
that still have beds and how far away they are.

Built as a Next.js 16 (App Router) application with a zero-dependency SQLite store, Server-Sent Events for live updates,
and a pluggable notification pipeline covering **SMS (Hubtel + Arkesel fallback), WhatsApp (Meta Cloud API), e-mail
(SMTP), Web Push (VAPID) and in-app alerts**.

> ⚠️ **Data notice** — this repository ships with *illustrative* facility data (real hospital names, towns, regions and
> coordinates; plausible but synthetic bed counts, phone numbers and e-mail addresses). It is **not** an official Ghana
> Health Service or Ministry of Health feed. Connecting a real feed is a drop-in replacement for the write path described
> in [Going to production](#going-to-production).

---

## Contents

- [What it does](#what-it-does)
- [Quickstart](#quickstart)
- [Demo accounts](#demo-accounts)
- [Screens](#screens)
- [How alerting works](#how-alerting-works)
- [Notification channels](#notification-channels)
- [Architecture](#architecture)
- [Data model](#data-model)
- [API reference](#api-reference)
- [Configuration](#configuration)
- [Going to production](#going-to-production)
- [Project structure](#project-structure)

---

## What it does

**For patients and their families**

- Search hospitals by name, town, district or region; filter by facility type and ward specialty.
- See live bed counts per facility **and per ward** (maternity, ICU/HDU, paediatric, surgical, emergency, isolation…).
- Sort by *nearest to me* using browser geolocation, or by "most beds free".
- Subscribe to alerts scoped to **one hospital**, **a whole region**, or **all of Ghana**, optionally narrowed to a ward
  type, with a configurable occupancy threshold and a quiet period so nobody gets spammed.
- Get told *immediately* when: a bed is freed, a ward runs full, the whole facility runs full, or occupancy crosses the
  threshold. When a facility is full the message includes the nearest hospitals with free beds, distances and phone
  numbers.
- Manage every alert from a token link — no account, no password. Pause, edit or delete from any device.

**For hospital ward staff and administrators**

- One-tap admit / discharge / "fill ward" reporting that updates every patient screen in the country within a second.
- Full attribution: every change is written to an audit log with actor, timestamp and reason.
- Scenario injector for drills and training: *emergency surge*, *discharge round*, *ICU pressure*, *maternity surge*,
  *fill the facility*.
- Broadcast a free-text notice to everyone subscribed to the facility (e.g. "maternity closed for sterilisation until
  18:00").
- Notification outbox showing exactly what each patient received, on which channel, through which provider — including
  the simulated provider request payloads for verification.

**For MoH / GHS / DHMT oversight**

- National dashboard: beds free, occupancy, facilities at capacity, ICU and maternity headroom, regions ranked by
  pressure.
- Data-quality flags for facilities that have not reported in over 90 minutes (patients see a stale-data warning too).
- Interactive map of pressure across the country, and a CSV export of the full facility table for analysts.

---

## Quickstart

Requires **Node.js 22.5+** (for the built-in `node:sqlite` module). No database server, no Docker, no migrations.

```bash
npm install
npm run dev
# → http://localhost:3000
```

That's it. On first boot the app creates `data/bedtracker.sqlite`, seeds 85 facilities across all 16 regions with ward
level detail and 24h of history, creates the demo staff accounts, and starts the occupancy simulator.

Other commands:

```bash
npm run build && npm start   # production build + serve
npm run typecheck            # tsc --noEmit
npm run db:reset             # delete the SQLite file so the next boot re-seeds
```

Environment configuration is **optional** — copy `.env.example` to `.env.local` only when you want live delivery:

```bash
cp .env.example .env.local
```

---

## Demo accounts

All demo accounts use the password `BedTrack2026!` (also listed as one-tap buttons on the sign-in page).

| Username        | Role             | Scope                        |
| --------------- | ---------------- | ---------------------------- |
| `moh.national`  | National oversight | Every facility + CSV export |
| `korlebu.admin` | Facility admin   | Korle Bu Teaching Hospital   |
| `korlebu.ward`  | Ward staff       | Korle Bu Teaching Hospital   |
| `kath.admin`    | Facility admin   | Komfo Anokye Teaching Hospital |
| `tamale.ward`   | Ward staff       | Tamale Teaching Hospital     |
| `ridge.admin`   | Facility admin   | Ridge Regional Hospital      |

Role rules: ward staff report counts; facility administrators can also run scenarios and broadcast; national users can
open any facility's console.

---

## Screens

| Route              | Who      | What                                                                 |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `/`                | Public   | National dashboard: headline numbers, map, region table, live alert feed, subscribe form |
| `/hospitals`       | Public   | Search & filter browser with "near me" sorting; updates live          |
| `/hospitals/[id]`  | Public   | Facility detail: gauge, ward table, 24h trend chart, nearest alternatives, subscribe |
| `/alerts`          | Patient  | Manage subscriptions + see every message sent to you                  |
| `/national`        | Oversight| Regional rollup, at-capacity list, stale-report flags, full facility table, CSV |
| `/login`           | Staff    | Sign in                                                               |
| `/portal`          | Staff    | Ward reporting console, scenarios, broadcasts, subscribers, audit log |
| `/portal/outbox`   | Staff    | Notification outbox with per-channel message previews and provider payloads |

---

## How alerting works

Every occupancy mutation — a nurse tapping **+1**, the demo simulator, or a drill scenario — flows through one function,
`updateWard()` in [`lib/beds.ts`](lib/beds.ts). That guarantees history, live streaming and alert evaluation never drift
apart:

```
ward change
   └─ lib/beds.ts  updateWard()
        ├─ UPDATE wards + ward_history + facility_history (throttled)
        ├─ lib/alerts.ts  detectEvents()      before/after → events
        │      facility_full · facility_reopened · ward_full · ward_freed
        │      high_occupancy · occupancy_recovered
        ├─ match subscriptions (scope → ward → event → cooldown)
        ├─ lib/notifications/dispatch.ts      render per channel → adapter → log
        └─ lib/realtime.ts  broadcast()       SSE → every open browser
```

**Event detection** compares the ward *and* its parent facility before/after, so it only fires on genuine transitions
(a bed freeing up, a ward hitting zero) rather than on every keystroke.

**Subscription matching** walks four gates:

1. **Scope** — specific facility → else region → else national.
2. **Ward type** — if the patient picked one, ward-level events must be for that ward (facility-level events always pass).
3. **Event preference** — `bed_freed`, `facility_full`, `ward_full`, `high_occupancy`, `any_change`.
4. **Cooldown** — the same event type won't re-notify inside the patient's quiet period (5 min – 3 h).

**Message content** is rendered per channel from one template module
([`lib/notifications/templates.ts`](lib/notifications/templates.ts)): a 160-char-friendly SMS with an opt-out, a
formatted WhatsApp message, a full HTML e-mail, a push payload, and an in-app card. Critical alerts are enriched with the
three nearest facilities that have free beds, their distances and admissions numbers.

---

## Notification channels

| Channel        | Provider                                   | Ready out of the box | Notes |
| -------------- | ------------------------------------------ | -------------------- | ----- |
| SMS            | Hubtel (primary) → Arkesel (fallback)      | simulated            | Ghanaian numbers validated & normalised to `+233…`; automatic provider failover |
| WhatsApp       | Meta WhatsApp Cloud API                    | simulated            | Sends formatted text messages to `+233…` numbers |
| E-mail         | Any SMTP host (nodemailer)                 | simulated            | Dark HTML template with facility table + manage link |
| Browser push   | Web Push / VAPID (`web-push`) + service worker | in-tab fallback  | Works while the tab is open without keys; add VAPID keys for closed-tab delivery |
| In-app         | SSE stream                                 | ✅ always            | Powers the live feed, toasts and the alert widgets |

### Simulator mode (default)

`NOTIFY_MODE=simulator` means **no outbound network calls**. Every message is still rendered exactly as it would be
delivered, stored in the outbox, and shown with the precise provider request that *would* have been sent — endpoint,
method, redacted auth headers and body. This makes the whole pipeline verifiable offline and safe for demos.

Switch to real delivery:

```bash
NOTIFY_MODE=live
HUBTEL_CLIENT_ID=…        HUBTEL_CLIENT_SECRET=…
ARKESEL_API_KEY=…                              # optional SMS fallback
SMTP_HOST=…  SMTP_PORT=587 SMTP_USER=… SMTP_PASSWORD=…
WHATSAPP_TOKEN=…  WHATSAPP_PHONE_NUMBER_ID=…
VAPID_PUBLIC_KEY=…  VAPID_PRIVATE_KEY=…        # npx web-push generate-vapid-keys
```

Failed deliveries are recorded with the provider error rather than dropped, so ops can see exactly what happened.

---

## Architecture

- **Next.js 16 App Router** — server components read SQLite directly; client components subscribe to live updates.
- **`node:sqlite`** — the built-in Node 22 module. No ORM, no native build step, no database server. Wrapped in a tiny
  typed helper ([`lib/db.ts`](lib/db.ts)) with `all/get/run/tx`.
- **Server-Sent Events** — one shared `EventSource` per browser tab
  ([`lib/live-client.ts`](lib/live-client.ts)) fed by an in-process pub/sub ([`lib/realtime.ts`](lib/realtime.ts)).
  Swap that module for Redis pub/sub to scale horizontally; call sites don't change.
- **Auth** — PBKDF2-SHA256 password hashing, opaque session ids in SQLite, httpOnly cookies, role-based access
  ([`lib/auth.ts`](lib/auth.ts)). No auth framework to configure.
- **Tailwind CSS v4** — dark, high-contrast UI tuned for a ward desktop and a phone in daylight, with Ghana-inspired
  accents.
- **Leaflet + OpenStreetMap** — pressure map, loaded client-side with a graceful text-list fallback if tiles are blocked.
- **No chart library** — the occupancy trend is hand-rolled SVG.

---

## Data model

| Table              | Purpose |
| ------------------ | ------- |
| `regions`          | Ghana's 16 regions |
| `facilities`       | Hospital registry: location, type, ownership, contact, last report time/by |
| `wards`            | Current capacity/occupied per ward category — the live source of truth |
| `ward_history`     | Ward-level occupancy samples (7-day retention) |
| `facility_history` | Facility-level occupancy samples for the trend chart (7-day retention) |
| `subscriptions`    | Patient alert rules: channel, contact, scope, events, threshold, cooldown, push payload |
| `notification_log` | Every message produced, with channel, provider, status, error and provider payload |
| `alert_events`     | Detected transitions (facility full, bed freed, threshold crossing…) |
| `users`            | Staff accounts with role and facility binding |
| `sessions`         | Opaque session tokens with expiry |
| `audit_log`        | Attribution trail for every occupancy change |
| `app_state`        | Runtime settings (simulator on/off, interval) |

Seeded ward mix is derived from each facility's type and bed complement — teaching hospitals get orthopaedic and ICU
wards, district hospitals don't, psychiatric facilities run general/emergency/isolation beds only. Seeding is
deterministic, so a fresh clone always starts from the same picture.

---

## API reference

| Method   | Route                              | Auth        | Description |
| -------- | ---------------------------------- | ----------- | ----------- |
| `GET`    | `/api/facilities`                  | public      | Filter/sort/search facilities (`q, region, type, status, category, available, sort, lat, lon, limit`) |
| `GET`    | `/api/facilities/:id`              | public      | Facility + wards + ward history + 24h trend + alerts + subscriber count |
| `GET`    | `/api/summary`                     | public      | National rollup, worst facilities, most-available facilities |
| `GET`    | `/api/alerts`                      | public      | Recent alert events (`facility`, `limit`) |
| `GET`    | `/api/meta`                        | public      | Regions, types, ward categories, scenarios, simulator + provider status |
| `GET`    | `/api/stream`                      | public      | SSE: `summary`, `facility`, `ward`, `alert` events |
| `GET`    | `/api/export/facilities.csv`       | public      | CSV export for analysts |
| `POST`   | `/api/subscriptions`               | public      | Create a patient alert (validates Ghana numbers/e-mail) |
| `GET`    | `/api/subscriptions?token=…`       | token       | List a patient's own alerts |
| `PATCH`  | `/api/subscriptions/:id`           | token/staff | Pause/resume, change threshold, cooldown or scope |
| `DELETE` | `/api/subscriptions/:id`           | token/staff | Unsubscribe |
| `GET`    | `/api/notifications?token=…`       | token       | A patient's own message history |
| `GET`    | `/api/notifications`               | staff       | Full delivery outbox |
| `POST`   | `/api/push/subscribe`              | token       | Attach a browser PushSubscription |
| `GET`    | `/api/push/vapid`                  | public      | Public VAPID key |
| `POST`   | `/api/auth/login` / `logout`       | public      | Session management |
| `GET`    | `/api/auth/me`                     | staff       | Current user |
| `PATCH`  | `/api/wards/:id`                   | staff       | Admit/discharge (`mode:'delta'`) or reconcile (`mode:'set'`) |
| `POST`   | `/api/facilities/:id/broadcast`    | admin       | Message all subscribers of a facility |
| `POST`   | `/api/facilities/:id/scenario`     | admin       | Run a drill scenario |
| `GET/POST` | `/api/simulator`                 | admin       | Status / enable / disable / run one tick |

---

## Configuration

All variables are documented in [`.env.example`](.env.example). The important ones:

| Variable                     | Default     | Purpose |
| ---------------------------- | ----------- | ------- |
| `DB_PATH`                    | `./data/bedtracker.sqlite` | SQLite location |
| `DB_SEED`                    | `true`      | `true` seeds when empty; `force` reseeds every boot |
| `NOTIFY_MODE`                | `simulator` | `simulator` or `live` delivery |
| `SIMULATOR_ENABLED`          | `true`      | Demo occupancy churn (also toggleable in the portal) |
| `SIMULATOR_INTERVAL_SECONDS` | `25`        | How often the simulator runs |
| `APP_BASE_URL`               | `http://localhost:3000` | Used for manage-alerts links inside messages |
| `APP_SECRET`                 | —           | Set a long random value in production |

---

## Going to production

The simulator exists because Ghana has no public real-time bed feed yet. Replacing it is a contained change:

1. **Turn the simulator off** — `SIMULATOR_ENABLED=false`, or the toggle in `/portal`.
2. **Feed `updateWard()`** from your source of truth. Anything that calls
   `updateWard({ wardId, mode, occupied|delta, actor, source })` inherits history, streaming and alerting for free:
   - an HL7 FHIR / ADT integration (ADT^A01 admit, ADT^A03 discharge),
   - a DHIMS2 / GHS facility-registry sync for the facility table,
   - a ward tablet or kiosk posting to `PATCH /api/wards/:id`.
3. **Set `NOTIFY_MODE=live`** with real Hubtel/Arkesel, SMTP and WhatsApp credentials, and generate VAPID keys for
   closed-tab push.
4. **Scale out** — move the SQLite file to Postgres behind the same query layer, and swap the in-process pub/sub in
   `lib/realtime.ts` for Redis pub/sub so every node can fan out to its own SSE clients.
5. **Harden** — provision staff accounts from the facility registry, put the app behind your SSO, add rate limiting to
   `POST /api/subscriptions`, and wire `notification_log` failures into your monitoring.
6. **Opt-out handling** — inbound `STOP` replies from the SMS provider should `PATCH` the matching subscription to
   `active = 0` (the webhook handler is the one piece intentionally left to your provider account).

---

## Project structure

```
app/
  page.tsx                     national dashboard
  hospitals/page.tsx           search & filter browser
  hospitals/[id]/page.tsx      facility detail
  alerts/page.tsx              patient alert manager
  national/page.tsx            oversight + CSV export
  login/page.tsx               staff sign-in
  portal/page.tsx              ward reporting console
  portal/outbox/page.tsx       notification outbox
  api/…                        22 route handlers (see API reference)
components/
  FacilityBrowser  HospitalCard  LiveWards  TrendChart  Gauge
  FacilityMap  AlertFeed  LiveAlertToasts  SubscribeForm
  AlertsManager  PortalConsole  OutboxView  LoginForm  primitives
lib/
  beds.ts          the single write path for occupancy
  alerts.ts        event detection + subscription matching
  simulator.ts     demo churn + scenario injector
  queries.ts       read-side queries and aggregations
  db.ts            SQLite schema, helpers, auto-seed
  seed.ts          deterministic seeding
  seed-data.ts     regions + 85 Ghanaian facilities
  realtime.ts      SSE pub/sub
  live-client.ts   browser-side shared EventSource store
  auth.ts          sessions + RBAC
  password.ts      PBKDF2 hashing
  format.ts        occupancy, status, time, phone helpers
  push-client.ts   Web Push registration
  notifications/
    config.ts      env-driven provider config
    channels.ts    in-app · browser · SMS · e-mail · WhatsApp adapters
    dispatch.ts    render → deliver → log → broadcast
    templates.ts   per-channel message copy
public/sw.js       service worker for push notifications
scripts/reset-db.mjs
```

---

## Licence & disclaimer

Provided as a reference implementation for discussion with Ghana Health Service, MoH and facility partners. Facility
data is illustrative. Always confirm with a facility's admissions desk before travelling; in an emergency call **112**.
