self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: "New Shanvi order", body: event.data.text() };
    }
  }
  event.waitUntil(self.registration.showNotification(payload.title || "New Shanvi order", {
    body: payload.body || "A new customer order was received.",
    icon: "./store-icon.svg",
    badge: "./store-icon.svg",
    tag: payload.reference || "shanvi-new-order",
    data: { url: "/" },
    requireInteraction: true,
    vibrate: [250, 120, 250]
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(new URL("./", self.registration.scope).href));
});
