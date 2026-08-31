/*
 * Beslutningen om, hvornaar tastaturet gik ned — uden browser.
 *
 * EGEN FIL, saa `scripts/logic-test.ts` kan importere den. Testene koerer i
 * node uden DOM-typer, og laa funktionen i tastatur.ts, ville `window` i
 * samme fil faa hele typekontrollen til at fejle. Grænsen gaar altsaa ved
 * "roerer den browseren": her goer den ikke, og derfor kan den testes.
 */

/**
 * Hvor meget der skal forsvinde, før vi kalder det et tastatur.
 *
 * Et rigtigt tastatur tager 250-350 px. Tilbehørsbjælken alene tager
 * 45-60. Grænsen ligger imellem, så en bjælke ikke læses som et tastatur.
 */
const TASTATUR_MINDST = 120;

/**
 * Selve beslutningen, uden browser.
 *
 * Ren og eksporteret, fordi den er svær at holde i hovedet og har kostet
 * flere forsøg: to målemodeller, en tærskel, en tilstand og en rotation, der
 * alle skal spille sammen. `scripts/logic-test.ts` kører den igennem, så
 * "jeg tror den er rigtig" bliver til noget, der er vist.
 */
export function tastaturskifte(
  tilstand: { fuld: number; bredde: number; varOppe: boolean },
  maaling: { hoejde: number; bredde: number; daekket: number },
): { fuld: number; bredde: number; varOppe: boolean; slip: boolean } {
  let fuld = tilstand.fuld;
  let varOppe = tilstand.varOppe;

  // Ny bredde = drejet skærm. Den gamle fulde højde gælder ikke længere.
  if (maaling.bredde !== tilstand.bredde) {
    fuld = maaling.hoejde;
    varOppe = false;
  }
  if (maaling.hoejde > fuld) fuld = maaling.hoejde;

  // TO MODELLER, ét mål. Følger browseren `resizes-content`, skrumper
  // `innerHeight` selv, og `daekket` bliver ~0; gør den ikke, står
  // `innerHeight` stille, og forskellen dukker op i `daekket`. Den største
  // af de to er, hvad tastaturet fylder, uanset hvilken vej det måles.
  const borte = Math.max(fuld - maaling.hoejde, maaling.daekket);

  if (borte >= TASTATUR_MINDST) {
    return { fuld, bredde: maaling.bredde, varOppe: true, slip: false };
  }

  return {
    fuld,
    bredde: maaling.bredde,
    varOppe: false,
    // Kun ved overgangen oppe -> nede. Ellers ville hver eneste maaling
    // med tastaturet nede slippe det felt, man lige har trykket paa.
    slip: varOppe,
  };
}
