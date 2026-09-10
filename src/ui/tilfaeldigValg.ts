/*
 * Udvælgelsen bag "lad skæbnen vælge" — uden browser.
 *
 * EGEN FIL, samme grænse som `tastaturskifte.ts`: her røres hverken DOM
 * eller timere, så `scripts/logic-test.ts` kan importere den. Selve
 * animationen ligger i Tilfaeldig.tsx og er præsentation.
 */

/** Kun det, udvælgelsen bruger. Kataloget har flere felter. */
export type Kandidat = {
  categoryId: string;
  name: string;
};

/**
 * Hvad der overhovedet kan trækkes.
 *
 * Kun rigtige drikkevarer. `other` — cigaretter og lignende — har
 * `isDrink: false` i `DRINK_CATEGORIES`, tæller ikke på stillingen, og en
 * "næste drink", der er en cigaret, er ikke det, nogen bad om.
 *
 * Kategorierne kommer ind som argument frem for at blive importeret, så
 * funktionen ikke trækker `convex/constants` med ind i prøverne bare for at
 * kende ét flag.
 */
export function kandidater(
  katalog: readonly Kandidat[],
  erDrikkevare: (categoryId: string) => boolean,
): Kandidat[] {
  return katalog.filter((variant) => erDrikkevare(variant.categoryId));
}

/**
 * Trækker én.
 *
 * `tilfaeldighed` sprøjtes ind, så prøverne kan sige præcis hvad der
 * trækkes. `Math.random` er standarden i appen.
 *
 * Ensartet fordeling: hver variant i kataloget har samme chance. IKKE vægtet
 * efter, hvad man plejer at drikke — det ville gøre den til "dine
 * sædvanlige" med ekstra trin, og pointen er netop at få noget, man ikke
 * selv havde valgt.
 */
export function vaelgTilfaeldig(
  liste: readonly Kandidat[],
  tilfaeldighed: () => number = Math.random,
): Kandidat | undefined {
  if (liste.length === 0) return undefined;
  const plads = Math.floor(tilfaeldighed() * liste.length);
  // `Math.random()` giver [0,1), så `plads` kan ikke ramme `length` — men en
  // indsprøjtet funktion kan levere 1, og et hul her ville være et nedbrud
  // ved en værdi, der optræder én gang ud af mange tusinde.
  return liste[Math.min(plads, liste.length - 1)];
}

/**
 * Navnene, hjulet ruller forbi, med vinderen sidst.
 *
 * ## Vinderen er trukket FØR animationen
 *
 * Rækken bygges omkring et resultat, der allerede ligger fast. Det modsatte
 * — at lade animationen lande, hvor den nu lander, og kalde dét resultatet —
 * ville betyde, at et hak i billedhastigheden ændrede, hvad man skulle
 * drikke. Her er animationen præsentation og intet andet.
 *
 * ## Ingen gentagelser lige efter hinanden
 *
 * Det samme navn to gange i træk ser ud som om hjulet gik i stå. Med under
 * to kandidater er det uundgåeligt, og så accepteres det.
 */
export function rulleraekke(
  liste: readonly Kandidat[],
  vinder: Kandidat,
  antal: number,
  tilfaeldighed: () => number = Math.random,
): Kandidat[] {
  if (antal <= 1 || liste.length === 0) return [vinder];

  const raekke: Kandidat[] = [];
  for (let i = 0; i < antal - 1; i++) {
    let naeste = vaelgTilfaeldig(liste, tilfaeldighed);
    if (naeste === undefined) break;

    const forrige = raekke[raekke.length - 1];
    if (forrige !== undefined && liste.length > 1) {
      // Ét nyt forsøg, ikke en løkke: med mange kandidater rammer det
      // næsten altid, og en løkke kunne køre længe på et uheldigt kald.
      if (erSamme(naeste, forrige)) {
        naeste = vaelgTilfaeldig(liste, tilfaeldighed) ?? naeste;
      }
    }
    raekke.push(naeste);
  }

  raekke.push(vinder);
  return raekke;
}

function erSamme(a: Kandidat, b: Kandidat): boolean {
  return a.categoryId === b.categoryId && a.name === b.name;
}

/**
 * Hvor længe der ventes før trin `nummer` af `antal`.
 *
 * Hjulet skal bremse. Et fast interval ser ud som en liste, der blinker;
 * en opbremsning ser ud som noget, der lander. Kurven er kvadratisk —
 * hurtigt i starten, mærkbart langsommere til sidst.
 */
export function rullepause(nummer: number, antal: number): number {
  if (antal <= 1) return 0;
  const andel = nummer / (antal - 1);
  return Math.round(HURTIGST_MS + (LANGSOMST_MS - HURTIGST_MS) * andel * andel);
}

const HURTIGST_MS = 55;
const LANGSOMST_MS = 320;
