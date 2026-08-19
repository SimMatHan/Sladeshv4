/**
 * Registrering af service workeren — og opdateringen af den.
 *
 * Service workeren tager IKKE over af sig selv (se scripts/sw-skabelon.js).
 * Det efterlader ét problem: en installeret PWA lukkes sjældent helt, så uden
 * en vej frem kunne en bruger blive stående på en måneder gammel udgave.
 *
 * Derfor: når en ny worker står klar, siger appen det i statusbjælken, og
 * brugeren trykker selv. Det er også det ærlige tidspunkt — man vil ikke have
 * appen genindlæst under sig midt i en Sladesh.
 */

let ventende: ServiceWorker | undefined;
let brugerBadOmOpdatering = false;

const lyttere = new Set<() => void>();

function meld(worker: ServiceWorker) {
  ventende = worker;
  for (const lytter of lyttere) lytter();
}

/** Abonnér på "der står en ny version klar". Returnerer en opsigelse. */
export function lytTilOpdatering(lytter: () => void): () => void {
  lyttere.add(lytter);
  return () => lyttere.delete(lytter);
}

export function harOpdateringKlar(): boolean {
  return ventende !== undefined;
}

/** Skifter til den nye version. Siden genindlæses, når worker'en har taget over. */
export function opdaterNu() {
  if (ventende === undefined) return;
  brugerBadOmOpdatering = true;
  ventende.postMessage("opdater-nu");
}

export function registrerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // I udvikling findes /sw.js ikke — pluginet kører kun ved bygning. En
  // registrering ville bare give en 404 i konsollen ved hver genindlæsning.
  if (import.meta.env.DEV) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // `controllerchange` fyrer OGSÅ, første gang en worker tager over via
    // clients.claim(). Uden denne vagt ville allerførste besøg genindlæse
    // sig selv uden grund.
    if (!brugerBadOmOpdatering) return;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js")
      .then((registrering) => {
        if (registrering.waiting !== null) meld(registrering.waiting);

        registrering.addEventListener("updatefound", () => {
          const ny = registrering.installing;
          if (ny === null) return;

          ny.addEventListener("statechange", () => {
            // `controller` skiller den allerførste installation fra en
            // opdatering. Uden en controller er der ingen gammel udgave at
            // afløse, og så er der ikke noget at fortælle brugeren.
            if (ny.state === "installed" && navigator.serviceWorker.controller !== null) {
              meld(ny);
            }
          });
        });
      })
      .catch((fejl: unknown) => {
        console.warn("[PWA] service worker kunne ikke registreres", fejl);
      });
  });
}
