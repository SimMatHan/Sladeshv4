/*
 * Service worker — appens skal, når nettet ikke er der.
 *
 * Skabelon. De to pladsholdere nedenfor — filliste og version — udfyldes ved
 * bygning af pluginet i vite.config.ts, som er det eneste sted, der kender de
 * indholdshashede filnavne. Filen her køres ALDRIG som den står; den findes
 * for at kunne læses, uden at man skal grave i en genereret dist/sw.js.
 *
 * Problemet den løser: uden en service worker er en genindlæsning uden
 * dækning en HVID SKÆRM. Ikke langsom — tom. Det er den enkeltting, der
 * tydeligst afslører, at det her ikke er en native app.
 *
 * Tre slags trafik, tre forskellige svar:
 *
 * - **Skallen** (index.html, JS, CSS, ikoner) — cache først. Alt under
 *   /assets/ er indholdshashet, så en cachet fil kan aldrig være forkert:
 *   ændrer indholdet sig, ændrer navnet sig.
 * - **Kortfliser** fra OpenStreetMap — cache først med et loft. De fylder,
 *   og uden et loft ville et par aftener med kortet åbent æde telefonens
 *   lager.
 * - **Alt andet fremmed** — Convex og Firebase — røres ikke. Data skal
 *   ALDRIG serveres fra en cache her; Convex har sin egen, som forstår
 *   hvad der er forældet. Se src/lib/oejebliksbillede.ts.
 *
 * En fjerde ting, der ikke er trafik: `push`. Worker'en er den eneste,
 * der kan modtage en push-besked, selv når ingen fane er åben — derfor
 * bor visningen af den her og ikke i UI-koden. Se convex/push.ts for
 * afsendelsen og src/lib/push.ts for abonnementet.
 */

/* global self, caches, fetch, Response */

const VERSION = "__VERSION__";

/** Skallen. Navnet indeholder versionen, så en ny bygning får en ny cache. */
const SKAL = `skal-${VERSION}`;

/**
 * Kortfliser. Versionsløs med vilje — fliserne er de samme fra bygning til
 * bygning, og at smide dem væk ved hver udrulning ville være spild.
 */
const FLISER = "fliser-v1";

/** Cirka to kortsessioner. Ældste ryger først. */
const FLISER_MAKS = 400;

const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  // INGEN skipWaiting. Den kørende side har allerede hentet index.html med
  // netop DE hashede filnavne, den kender; tog en ny worker over midt i det
  // hele, ville et dovent hentet Kort-<gammel hash>.js hverken være i cachen
  // eller på serveren mere. Den nye worker venter, til brugeren siger til —
  // se beskeden "opdater-nu" nedenfor.
  event.waitUntil(caches.open(SKAL).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const navne = await caches.keys();
      await Promise.all(
        navne
          .filter((navn) => navn !== SKAL && navn !== FLISER)
          .map((navn) => caches.delete(navn)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "opdater-nu") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Kun GET. En mutation må aldrig røre en cache.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Kortfliserne. Værten skiftede fra tile.openstreetmap.org til CARTOs
  // Positron/Dark Matter, da kortet blev gråtone — se `FLISER` i
  // src/ui/Kort.tsx. Uden denne linje ville fliserne falde igennem til
  // "alt andet udefra" nedenfor og holde op med at blive gemt, og et kort
  // i en kælder ville blive tomt igen.
  if (url.hostname.endsWith("basemaps.cartocdn.com")) {
    event.respondWith(fliseSvar(request));
    return;
  }

  // Convex, Firebase, alt andet udefra: lad det gå direkte.
  if (url.origin !== self.location.origin) return;

  // Navigation — altså at åbne appen. Skallen kommer fra cachen med det
  // samme; er den der ikke (allerførste besøg), hentes den.
  if (request.mode === "navigate") {
    event.respondWith(
      caches
        .match("/index.html", { cacheName: SKAL })
        .then((svar) => svar ?? fetch(request)),
    );
    return;
  }

  event.respondWith(skalSvar(request));
});

/*
 * Push. Nyttelasten er JSON sat af convex/push.ts: { title, body, tag }.
 * `tag` grupperer beskeder fra samme kilde (fx "chat-<kanalId>"), så en
 * telefon der har været væk længe ikke ender med ét pip per besked — en ny
 * notifikation med samme tag erstatter den forrige i stedet for at lægge sig
 * oveni.
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    // Ikke JSON — vis rå tekst frem for at fejle stille.
    data = { title: "Sladesh", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Sladesh", {
      body: data.body,
      tag: data.tag,
      icon: "/ikon-192.png",
      badge: "/ikon-192.png",
    }),
  );
});

/* Klik på notifikationen: fokusér en åben fane, eller åbn en ny. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
      return undefined;
    }),
  );
});

async function skalSvar(request) {
  const truffet = await caches.match(request, { cacheName: SKAL });
  if (truffet !== undefined) return truffet;
  return fetch(request);
}

async function fliseSvar(request) {
  const cache = await caches.open(FLISER);

  const truffet = await cache.match(request);
  if (truffet !== undefined) return truffet;

  try {
    const svar = await fetch(request);
    if (svar.ok) {
      await cache.put(request, svar.clone());
      void trimFliser(cache);
    }
    return svar;
  } catch {
    // Uden dækning har vi ikke flisen. Leaflet lader feltet stå tomt, og
    // det er ærligere end at give den en anden flise.
    return new Response("", { status: 504, statusText: "Ingen forbindelse" });
  }
}

/** Cache.keys() kommer i indsættelsesrækkefølge, så de ældste står forrest. */
async function trimFliser(cache) {
  const noegler = await cache.keys();
  if (noegler.length <= FLISER_MAKS) return;
  await Promise.all(
    noegler.slice(0, noegler.length - FLISER_MAKS).map((n) => cache.delete(n)),
  );
}
