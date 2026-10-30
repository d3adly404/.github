/** POST /api/auth/login — staff sign-in, sets the httpOnly session cookie. */
import { fail, json, readJson } from "@/lib/api";
import { HttpError, SESSION_COOKIE, authenticate } from "@/lib/auth";
import { logAudit } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ username?: string; password?: string }>(req);
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    if (!username || !password) throw new HttpError(400, "Username and password are required");

    const result = authenticate(username, password);
    if (!result) throw new HttpError(401, "Invalid username or password");

    logAudit(username, "login", "session", "Signed in to the GhanaBed portal");

    const res = json({ ok: true, username });
    res.cookies.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 12 * 3600,
    });
    return res;
  } catch (err) {
    return fail(err);
  }
}
