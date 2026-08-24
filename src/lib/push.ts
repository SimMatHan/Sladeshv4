/**
 * Web Push — abonnement fra browserens `PushManager`.
 *
 * Selve AFSENDELSEN og VAPID-nøglerne ligger på serveren (convex/push.ts).
 * Denne fil rører kun browserens egne API'er: bede om tilladelse, abonnere,
 * afmelde. Den hører hjemme her og ikke i src/ui, af samme grund som
 * `serviceworker.ts` gør — browser-plumbing, ikke præsentation.
 *
 * ## iOS-fælden
 *
 * Safari på iOS understøtter Web Push, men KUN når appen er "Føjet til
 * hjemmeskærm" — en almindelig fane i Safari har intet `PushManager`, selvom
 * `"PushManager" in window` godt kan stå sandt på skrivebordet. `pushStoettet`
 * kan ikke skelne de to; den melder kun, om API'et findes i DENNE kontekst.
 */

export function pushStoettet(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/**
 * Aktuelt abonnement for denne enhed, hvis der er ét — uden at bede om
 * tilladelse. Bruges til at vise korrekt til/fra-tilstand ved åbning.
 */
export async function laesAbonnement(): Promise<PushSubscription | null> {
  if (!pushStoettet()) return null;
  const registrering = await navigator.serviceWorker.ready;
  return await registrering.pushManager.getSubscription();
}

/** Det, serveren skal bruge for at kunne sende til denne enhed. */
export type Pushnoegler = { endpoint: string; p256dh: string; auth: string };

/**
 * Beder om tilladelse og abonnerer. Kaster en tekst på dansk, hvis
 * brugeren siger nej — den er ment til at blive vist direkte, ikke pakket
 * ind i `fejltekst()` (den er skrevet til `ConvexError`, ikke til dette).
 */
export async function aktiverPush(vapidPublicKey: string): Promise<Pushnoegler> {
  if (!pushStoettet()) {
    throw new Error("Denne browser understøtter ikke notifikationer.");
  }

  const tilladelse = await Notification.requestPermission();
  if (tilladelse !== "granted") {
    throw new Error("Du har ikke givet appen adgang til at sende notifikationer.");
  }

  const registrering = await navigator.serviceWorker.ready;
  const eksisterende = await registrering.pushManager.getSubscription();
  const abonnement =
    eksisterende ??
    (await registrering.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const json = abonnement.toJSON();
  if (json.endpoint === undefined || json.keys?.p256dh === undefined || json.keys.auth === undefined) {
    throw new Error("Kunne ikke oprette et notifikations-abonnement.");
  }

  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

/** Afmelder denne enhed lokalt. Returnerer endpointet, så den kaldende kan slette rækken på serveren. */
export async function deaktiverPush(): Promise<string | undefined> {
  const abonnement = await laesAbonnement();
  if (abonnement === null) return undefined;

  const endpoint = abonnement.endpoint;
  await abonnement.unsubscribe();
  return endpoint;
}

/** `applicationServerKey` skal være rå bytes, ikke base64url-teksten Convex-queryen giver. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normaliseret = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raa = atob(normaliseret);

  // `new Uint8Array(length)` allokerer sin egen ArrayBuffer — i modsætning
  // til `Uint8Array.from(...)`, hvis type i nyere TS tillader en delt
  // buffer, som `applicationServerKey` ikke accepterer.
  const bytes = new Uint8Array(raa.length);
  for (let i = 0; i < raa.length; i++) bytes[i] = raa.charCodeAt(i);
  return bytes;
}
