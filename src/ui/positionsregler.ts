/*
 * Positionens holdbarhed og sessionens cache — uden browser.
 *
 * EGEN FIL, samme graense som `tastaturskifte.ts`: `scripts/logic-test.ts`
 * koerer i node uden DOM-typer, og laa reglerne i position.ts, ville
 * `navigator` i samme fil faa hele typekontrollen til at fejle. Graensen
 * gaar ved "roerer den browseren" — her goer den ikke.
 *
 * Selve opslaget mod GPS'en ligger i position.ts.
 */

export type Position = { lat: number; lng: number };

/** Saa gammelt maa et gemt fix vaere, foer der hentes et nyt. */
const FRISK_MS = 10 * 60 * 1000;

let gemt: { position: Position; hentet: number } | undefined;

/**
 * Har brugeren sagt nej?
 *
 * Saa spoerges der ikke igen i denne session. Browseren husker selv afslaget
 * og ville svare med det samme uden en dialog — men et kald per logning, der
 * altid fejler, er stadig arbejde, ingen faar noget ud af.
 */
let afvist = false;

/**
 * Er et fix hentet paa `hentet` stadig brugbart paa `nu`?
 *
 * Ren og eksporteret, saa den kan proeves: det er DEN her regel, der afgoer,
 * om nogen staar paa den bar, de forlod for en time siden. En for lang
 * levetid er ikke en fejl, man opdager — kortet ser rigtigt ud, prikken staar
 * bare det forkerte sted.
 */
export function erFriskNok(hentet: number, nu: number): boolean {
  return nu - hentet < FRISK_MS;
}

/**
 * Positionen, vi allerede KENDER — uden at spoerge om noget.
 *
 * Returnerer kun et fix, der er friskt nok til at sende. Kaldes lige foer en
 * logning, saa den kan komme med i samme kald.
 */
export function kendtPosition(): Position | undefined {
  if (gemt === undefined) return undefined;
  return erFriskNok(gemt.hentet, Date.now()) ? gemt.position : undefined;
}

/**
 * Laegger et fix i sessionens cache.
 *
 * Kaldes baade af GPS-opslaget i position.ts og af kortets `watchPosition`,
 * som faar koordinater flere gange i sekundet, mens det er aabent. Uden den
 * sidste ville en logning lige efter et besoeg paa kortet hente positionen
 * forfra — samme tilladelse, samme telefon, samme sted.
 */
export function gemPosition(position: Position): void {
  gemt = { position, hentet: Date.now() };
  // Fik vi et fix, ER tilladelsen givet. Et tidligere afslag maa vaere
  // omgjort i browserens indstillinger.
  afvist = false;
}

/** Har brugeren afvist i denne session? Saa spoerges der ikke igen. */
export function erAfvist(): boolean {
  return afvist;
}

/** Husker et nej, saa naeste logning ikke spoerger forgaeves. */
export function husAfvisning(): void {
  afvist = true;
}

/** Kun til proever: glemmer alt, modulet har husket. */
export function nulstilPosition(): void {
  gemt = undefined;
  afvist = false;
}
