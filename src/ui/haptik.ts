/**
 * Haptik — telefonen der siger fra.
 *
 * ## Læs dette først: det virker ikke på iPhone
 *
 * `navigator.vibrate` findes i Chrome på Android og i intet på iOS. Safari
 * har aldrig understøttet den, heller ikke for en app lagt på
 * hjemmeskærmen, og der findes ingen anden vej for en webapp.
 *
 * Det er altså en forbedring for HALVDELEN af brugerne, og det skal siges
 * højt frem for at stå som en funktion, alle tror de har. Den koster til
 * gengæld ingenting: ingen pakke, ingen tilladelse, ingen prompt, og den
 * gør stille ingenting, hvor den ikke findes.
 *
 * ## Hvorfor der kun er tre mønstre
 *
 * Et vibrationsmønster er et sprog med meget få ord. Kan man ikke kende dem
 * fra hinanden med telefonen i lommen, er de ikke tre signaler — de er
 * støj. Derfor:
 *
 *   tik    et enkelt kort stød    "registreret"
 *   dunk   to stød                "der skete noget, kig"
 *   slag   langt, kort, langt     "du skal handle NU"
 *
 * Tilføj ikke et fjerde uden at kunne sige, hvad det betyder, som de tre
 * andre ikke allerede siger.
 */

/**
 * Respekterer `prefers-reduced-motion`.
 *
 * Indstillingen hedder BEVÆGELSE, og en vibration er bevægelse — den er
 * endda den mest fysiske af dem. Mange, der slår den til, gør det på grund
 * af svimmelhed eller migræne, og et stød i hånden hjælper ikke.
 *
 * Slås op ved hvert kald frem for én gang: indstillingen kan ændres, mens
 * appen er åben, og en app, der først opdager det ved næste genstart, har
 * ikke rigtig respekteret den.
 */
function maaVibrere(): boolean {
  if (typeof navigator.vibrate !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function vibrer(moenster: number | number[]): void {
  if (!maaVibrere()) return;
  // Browseren afviser kaldet, hvis siden ikke har været rørt endnu. Det er
  // ikke en fejl, vi kan gøre noget ved, og det må ikke vælte det, der
  // udløste den.
  try {
    navigator.vibrate(moenster);
  } catch {
    // Med vilje tom.
  }
}

/** Registreret. En logning, et valg, et tryk der talte. */
export function tik(): void {
  vibrer(12);
}

/** Der skete noget. En ny besked, et mærke låst op. */
export function dunk(): void {
  vibrer([18, 60, 18]);
}

/** Du skal handle NU. En Sladesh der lander, en beacon der går af. */
export function slag(): void {
  vibrer([60, 50, 25, 50, 60]);
}
