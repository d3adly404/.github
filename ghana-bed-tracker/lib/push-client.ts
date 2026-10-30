"use client";

/**
 * Browser push registration.
 *
 * Real offline Web Push needs VAPID keys on the server. When they are absent
 * (the default for a fresh clone) we fall back to the in-tab Notification API,
 * which is driven by the same live SSE stream — so patients still get an
 * on-screen alert the moment a bed frees up while the app is open.
 */

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return buffer;
}

export interface PushResult {
  ok: boolean;
  mode: "web-push" | "in-tab" | "denied" | "unsupported";
  detail: string;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function registerPush(subscriptionId: number, token: string): Promise<PushResult> {
  const permission = await requestNotificationPermission();
  if (permission === "unsupported") {
    return { ok: false, mode: "unsupported", detail: "This browser does not support notifications." };
  }
  if (permission !== "granted") {
    return { ok: false, mode: "denied", detail: "Notification permission was not granted — in-app alerts still work." };
  }

  try {
    const res = await fetch("/api/push/vapid");
    const cfg = (await res.json()) as { publicKey: string | null; enabled: boolean };

    if (!cfg.enabled || !cfg.publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return {
        ok: true,
        mode: "in-tab",
        detail: "You will be alerted in this browser while the tab is open. Add VAPID keys for alerts when the app is closed.",
      };
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
      }));

    const saved = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON(), subscriptionId, token }),
    });
    if (!saved.ok) throw new Error("Could not store the push subscription");

    return {
      ok: true,
      mode: "web-push",
      detail: "Push enabled — alerts reach this device even when GhanaBed is closed.",
    };
  } catch (err) {
    return {
      ok: false,
      mode: "in-tab",
      detail: err instanceof Error ? err.message : "Push registration failed; in-app alerts still work.",
    };
  }
}

/** Shows a local notification (used by the in-tab fallback). */
export function showLocalNotification(title: string, body: string, severity = "info"): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      icon: "/icon.svg",
      tag: `ghanabed-${severity}`,
    } as NotificationOptions);
  } catch {
    /* some browsers require a service worker registration — ignore */
  }
}
