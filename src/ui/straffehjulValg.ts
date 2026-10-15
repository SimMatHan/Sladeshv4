/*
 * Straffehjulets geometri — uden browser.
 *
 * EGEN FIL, samme grænse som `tilfaeldigValg.ts`: her røres hverken DOM
 * eller timere, så `scripts/logic-test.ts` kan importere den. Tegningen og
 * animationen ligger i Straffehjul.tsx.
 *
 * ## Vinkler
 *
 * Grader, målt MED URET fra klokken tolv — dér, hvor viseren sidder. Felt
 * `i` af `antal` dækker `[i, i+1) * 360/antal`, før hjulet er drejet.
 * Drejes hjulet `v` grader med uret, står det punkt under viseren, der
 * før lå på `-v`.
 */

/** Trækker hvilket felt hjulet skal lande på. Ensartet fordeling. */
export function vaelgPlads(antal: number, tilfaeldighed: () => number = Math.random): number {
  if (antal <= 0) return -1;
  // `Math.random()` giver [0,1), men en indsprøjtet funktion kan levere 1.
  return Math.min(Math.floor(tilfaeldighed() * antal), antal - 1);
}

/**
 * Hvor hjulet skal ende for at lande på `vinder`.
 *
 * ## Vinderen er trukket FØR drejet
 *
 * Samme princip som skæbnens hjul i log-arket: animationen er præsentation
 * og bygges omkring et resultat, der allerede ligger fast. Et hak i
 * billedhastigheden må ikke kunne ændre, hvilken straf man fik.
 *
 * ## Altid fremad, altid mindst `omgange` hele omgange
 *
 * Vinklen lægges oven i den nuværende, så andet drej fortsætter fra, hvor
 * det første stoppede, frem for at snurre baglæns tilbage til nul.
 *
 * ## Ikke på stregen
 *
 * Landingspunktet skubbes tilfældigt inden for feltet, så hjulet ikke altid
 * stopper præcis på midten — men højst 35% ud til hver side, så det aldrig
 * ser ud til at have stoppet på en kant.
 */
export function slutvinkel(
  nuvaerende: number,
  vinder: number,
  antal: number,
  omgange = 5,
  tilfaeldighed: () => number = Math.random,
): number {
  if (antal <= 0) return nuvaerende;
  const felt = 360 / antal;
  const skub = (tilfaeldighed() - 0.5) * felt * 0.7;
  const maal = normaliser(-((vinder + 0.5) * felt + skub));
  const delta = normaliser(maal - normaliser(nuvaerende));
  return nuvaerende + omgange * 360 + delta;
}

/** Hvilket felt står under viseren, når hjulet er drejet `vinkel` grader? */
export function feltVedVinkel(vinkel: number, antal: number): number {
  if (antal <= 0) return -1;
  const felt = 360 / antal;
  return Math.min(Math.floor(normaliser(-vinkel) / felt), antal - 1);
}

/**
 * Farven på felt `i` som et indeks i en palet på `paletstoerrelse`.
 *
 * Bare `i % k` giver to ens farver side om side, når hjulet lukker sig: det
 * sidste felt rører det første. Er de ens, tages den næste farve, der
 * hverken ligner forgængeren eller det første felt.
 */
export function farveindeks(i: number, antal: number, paletstoerrelse: number): number {
  const naiv = i % paletstoerrelse;
  if (antal < 2 || i !== antal - 1 || paletstoerrelse < 3) return naiv;
  if (naiv !== 0) return naiv;
  const forrige = (i - 1) % paletstoerrelse;
  for (let bud = 1; bud < paletstoerrelse; bud++) {
    if (bud !== forrige) return bud;
  }
  return naiv;
}

/**
 * Teksten, som den kan stå på hjulet.
 *
 * Hele teksten står under hjulet, når det har landet — på selve hjulet er
 * der kun plads til en stump. Ellipsen viser, at der er mere.
 */
export function forkort(tekst: string, max: number): string {
  const tegn = Array.from(tekst);
  if (tegn.length <= max) return tekst;
  return tegn.slice(0, Math.max(1, max - 1)).join("").trimEnd() + "…";
}

function normaliser(vinkel: number): number {
  return ((vinkel % 360) + 360) % 360;
}
