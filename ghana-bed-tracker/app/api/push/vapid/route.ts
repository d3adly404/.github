/** GET /api/push/vapid — public VAPID key so the browser can subscribe. */
import { json } from "@/lib/api";
import { notifyConfig } from "@/lib/notifications/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = notifyConfig();
  return json({
    publicKey: cfg.vapid.publicKey || null,
    enabled: cfg.vapid.enabled,
    mode: cfg.mode,
    hint: cfg.vapid.enabled
      ? undefined
      : "Generate keys with `npx web-push generate-vapid-keys` and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.",
  });
}
