/*
 * Hvad opstartsskærmen siger, og hvornår — uden browser.
 *
 * EGEN FIL, samme grænse som `bundskaevregler.ts`: `scripts/logic-test.ts`
 * kører i node uden DOM-typer, så uret og animationen bor i Opstart.tsx og
 * REGLEN her.
 */

/**
 * Hvor sur manden er. Styrer animationen, ikke teksten — der er otte
 * tekster, men kun fire stemninger at tegne.
 */
export type Humoer = "glad" | "utaalmodig" | "rasende" | "opgivet";

type Trin = {
  /** Fra hvor mange millisekunders ventetid trinnet gælder. */
  fraMs: number;
  tekst: string;
  humoer: Humoer;
};

/**
 * Tidslinjen.
 *
 * Det første trin er det, næsten alle ser: skærmen står i mindst
 * `MINDSTE_VISNING_MS`, og appen er som regel klar inden da. Det andet trin
 * ligger derfor et sekund EFTER de tre — lå det før, ville man se det blinke
 * forbi lige inden "Skål!". Resten er til den, der står i en kælderbar med
 * én streg, og skal være sjovere, jo længere man står der.
 *
 * Det SIDSTE trin er ikke en vittighed. Efter et halvt minut er det mere
 * sandsynligt, at noget er gået i stå, end at nettet bare er langsomt, og
 * så skal skærmen sige, hvad man gør ved det. I en installeret PWA er der
 * ingen genindlæs-knap i browseren, så knappen på skærmen er den eneste.
 */
export const OPSTARTSTRIN: readonly Trin[] = [
  { fraMs: 0, tekst: "Skænker op …", humoer: "glad" },
  { fraMs: 4000, tekst: "Skummet skal lige lægge sig …", humoer: "glad" },
  { fraMs: 6500, tekst: "Kom nu …", humoer: "utaalmodig" },
  { fraMs: 9500, tekst: "Kom nu, jeg vil gerne drikke", humoer: "utaalmodig" },
  {
    fraMs: 13000,
    tekst: "Kom nu, jeg vil gerne drikke for helvede!",
    humoer: "rasende",
  },
  { fraMs: 18000, tekst: "HALLO?! ØLLEN BLIVER LUNKEN!", humoer: "rasende" },
  { fraMs: 24000, tekst: "Bartenderen er vist gået hjem …", humoer: "opgivet" },
  { fraMs: 30000, tekst: "Den er helt gal. Genstart appen.", humoer: "opgivet" },
];

/**
 * Hvor længe skærmen MINDST står, før den går — også når appen er klar.
 *
 * Et ønske, ikke en teknisk grænse: en skærm, der blinker væk efter et
 * halvt sekund, ligner en fejl, og appen bruger tiden på at hente under den.
 */
export const MINDSTE_VISNING_MS = 3000;

/** Hvor længe udgangen varer — "Skål!" og zoomet ind i appen. */
export const UDGANG_MS = 1000;

/** Det, skærmen siger, når den går. */
export const SKAAL = "Skål! 🍻";

/**
 * Millisekunder, til skærmen må gå, når appen er klar, og den har været
 * vist i `vistMs`. Nul, hvis den allerede har stået længe nok.
 */
export function tilUdgang(vistMs: number): number {
  const vist = Number.isFinite(vistMs) && vistMs > 0 ? vistMs : 0;
  return Math.max(0, MINDSTE_VISNING_MS - vist);
}

/** Det sidste trin — det med knappen. */
export const SIDSTE_TRIN = OPSTARTSTRIN.length - 1;

/**
 * Hvilket trin `ventetMs` svarer til.
 *
 * Et negativt eller ugyldigt tal giver det første trin. Det kan ske, hvis
 * uret er sat fra et andet `performance.now()` end det, der læses — og så
 * er den rolige tekst det rigtige gæt, ikke "genstart".
 */
export function opstartstrin(ventetMs: number): number {
  let trin = 0;
  for (let i = 1; i < OPSTARTSTRIN.length; i++) {
    if (ventetMs >= OPSTARTSTRIN[i].fraMs) trin = i;
  }
  return trin;
}

/**
 * Millisekunder til næste trin, eller `undefined` på det sidste.
 *
 * Skærmen sætter ét ur til netop dét tidspunkt frem for at spørge hvert
 * kvarte sekund. Der sker ingenting imellem, og en interval, der tikker
 * mens appen henter, er arbejde for ingenting på en telefon, der i forvejen
 * kæmper.
 */
export function tilNaesteTrin(ventetMs: number): number | undefined {
  const naeste = OPSTARTSTRIN[opstartstrin(ventetMs) + 1];
  if (naeste === undefined) return undefined;
  return Math.max(0, naeste.fraMs - Math.max(0, ventetMs));
}

/**
 * Teksten for et trin.
 *
 * Uden dækning hjælper det ikke at genstarte — appen åbner fra cachen og
 * står så og venter igen. Det sidste trin siger derfor, hvad der faktisk
 * er galt. De sjove trin er de samme: de handler om at vente, og man venter
 * lige meget uden net.
 */
export function opstartstekst(trin: number, offline: boolean): string {
  if (trin >= SIDSTE_TRIN && offline) {
    return "Ingen dækning. Find noget net, og genstart appen.";
  }
  return OPSTARTSTRIN[Math.min(Math.max(trin, 0), SIDSTE_TRIN)].tekst;
}
