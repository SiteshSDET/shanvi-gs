self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open("shanvi-store-shell-v1");
    await cache.addAll([
      "./",
      "./manifest.webmanifest",
      "./supabase-config.js",
      "./store-icon.svg",
      "./store-icon-192.png",
      "./store-icon-512.png"
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith("shanvi-store-shell-") && name !== "shanvi-store-shell-v1")
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && new URL(event.request.url).pathname.startsWith(new URL(self.registration.scope).pathname)) {
        const cache = await caches.open("shanvi-store-shell-v1");
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const offlinePage = await caches.match("./");
        if (offlinePage) return offlinePage;
      }
      throw error;
    }
  })());
});

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
