/*
 * Beslutningen om, hvornaar appen beder om en plads paa hjemmeskaermen —
 * uden browser.
 *
 * EGEN FIL, saa `scripts/logic-test.ts` kan importere den. Testene koerer i
 * node uden DOM-typer, og laa funktionen i useHjemmeskaerm.ts, ville
 * `window` i samme fil faa hele typekontrollen til at fejle. Samme graense
 * som i tastaturskifte.ts og positionsregler.ts.
 */

/**
 * Hvilken slags enhed vi staar paa — kun saa meget, som opfordringen skal
 * bruge for at kunne forklare vejen.
 *
 * Ikke en browserdetektion. Vi spoerger ikke om version, model eller
 * motor; vi spoerger, hvilken vejledning der passer, og der findes
 * praecis tre svar:
 *
 *   ios      Del-knappen i Safari. Der er ingen anden vej, og der er
 *            ingen prompt vi kan kalde.
 *   android  Chrome tilbyder som regel selv at installere, og goer den
 *            ikke, ligger punktet i menuen.
 *   anden    Computere. Man kan godt installere en PWA paa en baerbar,
 *            men det er ikke der, folk staar i baren — og en opfordring,
 *            der ikke passer til skaermen foran en, er stoej.
 */
export type Hjemmeskaermplatform = "ios" | "android" | "anden";

/**
 * iPadOS melder sig som "Macintosh". Den fanges paa beroeringsskaermen —
 * en rigtig Mac har `maxTouchPoints` 0. Samme greb som
 * `erIOSUdenHjemmeskaerm()` i usePush.ts, som er bygget over samme
 * problem.
 */
export function bestemPlatform(maal: {
  userAgent: string;
  maxTouchPoints: number;
}): Hjemmeskaermplatform {
  if (/iPad|iPhone|iPod/.test(maal.userAgent)) return "ios";
  if (/Macintosh/.test(maal.userAgent) && maal.maxTouchPoints > 1) return "ios";
  if (/Android/.test(maal.userAgent)) return "android";
  return "anden";
}

/**
 * Hvor mange gange appen skal have vaeret aabnet, foer den beder om
 * plads paa hjemmeskaermen.
 *
 * IKKE foerste gang. En, der lige har oprettet sig, ved endnu ikke, hvad
 * appen er — og en app, der beder om en plads paa hjemmeskaermen, foer
 * den har vist noget som helst, opfoerer sig som en reklame. Anden
 * aabning betyder, at personen kom tilbage af sig selv. Det er det
 * tidligste tidspunkt, hvor "vil du have den ved haanden?" er et
 * rimeligt spoergsmaal frem for et paatraengende et.
 */
export const AABNINGER_FOER_OPFORDRING = 2;

/**
 * Selve beslutningen.
 *
 * Ren og eksporteret, fordi den er fire betingelser, der hver for sig er
 * indlysende og tilsammen er nemme at faa galt i halsen — og fordi den
 * forkerte kombination giver enten en opfordring til en, der allerede har
 * installeret, eller ingen opfordring overhovedet.
 */
export function boerOpfordre(tilstand: {
  /** Koerer appen lige nu fra hjemmeskaermen? */
  installeret: boolean;
  platform: Hjemmeskaermplatform;
  /** Har personen trykket paa krydset? */
  lukket: boolean;
  /** Hvor mange gange appen er blevet aabnet paa denne enhed. */
  aabninger: number;
}): boolean {
  // Den er der allerede. Det her er hele grunden til, at opfordringen kan
  // lade vaere med at komme igen: naar den virker, forsvinder den af sig
  // selv uden at nogen skal lukke den.
  if (tilstand.installeret) return false;

  // Paa en computer er der ingen hjemmeskaerm at tale om.
  if (tilstand.platform === "anden") return false;

  if (tilstand.lukket) return false;

  return tilstand.aabninger >= AABNINGER_FOER_OPFORDRING;
}

/**
 * Vejledningen, trin for trin.
 *
 * Ren tekst frem for skaermbilleder: knapperne flytter sig mellem
 * iOS-versioner, og et forkert skaermbillede er vaerre end ingen. Ordene
 * er derimod de samme, som staar paa knapperne — og det er dem, man
 * leder efter.
 */
export function hjemmeskaermtrin(platform: Hjemmeskaermplatform): string[] {
  if (platform === "ios") {
    return [
      "Tryk på Del-knappen forneden i Safari — firkanten med pilen op.",
      "Rul ned i listen og vælg “Føj til hjemmeskærm”.",
      "Tryk “Tilføj” øverst til højre.",
    ];
  }
  if (platform === "android") {
    return [
      "Tryk på de tre prikker øverst til højre i Chrome.",
      "Vælg “Tilføj til startskærm” eller “Installér app”.",
      "Bekræft med “Tilføj”.",
    ];
  }
  return [];
}

/**
 * Hvad man faar ud af det, sagt i den raekkefoelge det betyder noget.
 *
 * Notifikationer staar foerst paa iOS og sidst paa Android, og det er
 * ikke pynt: paa iPhone er hjemmeskaermen den ENESTE vej til Web Push, saa
 * dér er det ikke en fordel, men forudsaetningen. Paa Android virker push
 * ogsaa i en almindelig fane, og saa er det rigtige argument, at appen
 * fylder skaermen og ligger, hvor de andre apps ligger.
 */
export function hjemmeskaermgrunde(platform: Hjemmeskaermplatform): string[] {
  if (platform === "ios") {
    return [
      "Notifikationer virker først derfra — på iPhone er der ikke nogen anden vej.",
      "Den åbner i fuld skærm uden adresselinje.",
      "Den ligger sammen med dine andre apps i stedet for i en fane.",
    ];
  }
  return [
    "Den åbner i fuld skærm uden adresselinje.",
    "Den ligger sammen med dine andre apps i stedet for i en fane.",
    "Notifikationer er nemmere at holde styr på.",
  ];
}
