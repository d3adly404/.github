/* GhanaBed service worker — receives Web Push alerts and shows notifications. */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "GhanaBed alert", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "GhanaBed alert";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon.svg",
    badge: "/icon.svg",
    tag: data.tag || `ghanabed-${data.event || "alert"}`,
    data: { url: data.url || "/", event: data.event || "alert", severity: data.severity || "info" },
    renotify: true,
    requireInteraction: data.severity === "critical",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
