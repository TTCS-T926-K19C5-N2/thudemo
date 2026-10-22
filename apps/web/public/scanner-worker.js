/* Only the public scanner shell and immutable Next assets are cached.
 * Tickets, sessions, API responses and buyer/organizer pages never enter CacheStorage. */
const CACHE = "thudemo-scanner-shell-v1";
const SHELL = "/scanner";
async function prepareShell() {
  const response = await fetch(SHELL, {
    credentials: "omit",
    cache: "no-store",
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/html")
  ) {
    throw Error("Scanner shell unavailable");
  }
  const html = await response.clone().text();
  const assets = [
    ...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"<>]+)"/g),
  ].map((match) => match[1].replaceAll("&amp;", "&"));
  const cache = await caches.open(CACHE);
  // Finish assets before replacing the working shell, including during upgrades.
  await Promise.all(
    [...new Set(assets)].map(async (url) => {
      const asset = await fetch(url, { credentials: "omit" });
      if (!asset.ok) throw Error("Scanner asset unavailable");
      await cache.put(url, asset);
    }),
  );
  await cache.put(SHELL, response);
}
self.addEventListener("install", (event) => {
  event.waitUntil(prepareShell().then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "PREPARE_SCANNER") return;
  event.waitUntil(
    prepareShell()
      .then(() => self.clients.claim())
      .then(
        () => event.ports[0]?.postMessage({ ready: true }),
        () => event.ports[0]?.postMessage({ ready: false }),
      ),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && url.pathname === SHELL) {
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await (await caches.open(CACHE)).match(SHELL);
        if (!shell) throw Error("Prepare scanner online before using offline");
        return shell;
      }),
    );
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE),
          hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});
