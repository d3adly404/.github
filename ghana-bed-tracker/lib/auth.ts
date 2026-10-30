/**
 * Session management + role based access control.
 *
 * Deliberately dependency-free: a random opaque session id stored in SQLite and
 * presented in an httpOnly cookie. No JWT signing keys to rotate.
 */
import { cookies } from "next/headers";
import { get, run } from "./db";
import { newSalt, randomToken, verifyPassword, hashPassword } from "./password";
import { listFacilities } from "./queries";
import type { Role, SessionUser } from "./types";

export const SESSION_COOKIE = "ghana_bed_session";
const SESSION_TTL_MS = 12 * 3_600_000; // 12 hours

interface UserRow {
  id: number;
  username: string;
  name: string;
  password_hash: string;
  salt: string;
  role: Role;
  facility_id: string | null;
}

export function authenticate(username: string, password: string): { userId: number; token: string } | null {
  const row = get<UserRow>(
    `SELECT id, username, name, password_hash, salt, role, facility_id FROM users WHERE username = ?`,
    [username.trim().toLowerCase()],
  );
  if (!row) return null;
  if (!verifyPassword(password, row.salt, row.password_hash)) return null;

  const token = randomToken();
  const now = Date.now();
  run(`INSERT INTO sessions(id, user_id, created_at, expires_at) VALUES(?,?,?,?)`, [
    token,
    Number(row.id),
    now,
    now + SESSION_TTL_MS,
  ]);
  run(`DELETE FROM sessions WHERE expires_at < ?`, [now]);
  return { userId: Number(row.id), token };
}

export function destroySession(token: string): void {
  run(`DELETE FROM sessions WHERE id = ?`, [token]);
}

export function createUser(
  username: string,
  name: string,
  password: string,
  role: Role,
  facilityId: string | null,
): void {
  const salt = newSalt();
  run(
    `INSERT INTO users(username, name, password_hash, salt, role, facility_id) VALUES(?,?,?,?,?,?)`,
    [username.trim().toLowerCase(), name, hashPassword(password, salt), salt, role, facilityId],
  );
}

/** Resolves the signed-in user (if any) from the request cookies. */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = get<UserRow & { expires_at: number }>(
    `SELECT u.id, u.username, u.name, u.password_hash, u.salt, u.role, u.facility_id, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [token],
  );
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    destroySession(token);
    return null;
  }

  const user: SessionUser = {
    id: Number(row.id),
    username: String(row.username),
    name: String(row.name),
    role: String(row.role) as Role,
    facility_id: row.facility_id == null ? null : String(row.facility_id),
  };
  if (user.facility_id) {
    const f = listFacilities({ search: undefined }).find((x) => x.id === user.facility_id);
    user.facility_name = f?.name ?? null;
    user.region_name = f?.region_name ?? null;
  }
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in required");
  if (!roles.includes(user.role)) throw new HttpError(403, "Your role cannot perform this action");
  return user;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Facility admins may only act on their own facility; national users on any. */
export function canManageFacility(user: SessionUser, facilityId: string): boolean {
  if (user.role === "national") return true;
  return user.facility_id === facilityId;
}
