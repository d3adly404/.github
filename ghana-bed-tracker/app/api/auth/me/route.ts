/** GET /api/auth/me — current session user (or 401). */
import { json } from "@/lib/api";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return json({ user: null }, { status: 401 });
  return json({ user });
}
