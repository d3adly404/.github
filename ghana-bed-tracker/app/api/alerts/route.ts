/** GET /api/alerts — recent alert events (public feed, or per facility). */
import { json, intParam } from "@/lib/api";
import { recentAlerts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(100, intParam(url.searchParams.get("limit"), 25));
  const facility = url.searchParams.get("facility") ?? undefined;
  return json({ alerts: recentAlerts(limit, facility) });
}
