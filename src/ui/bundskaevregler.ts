/*
 * Hvor meget den faste bundklynge staar for hoejt — uden browser.
 *
 * EGEN FIL, samme graense som `tastaturskifte.ts` og `positionsregler.ts`:
 * `scripts/logic-test.ts` koerer i node uden DOM-typer, saa maalingen ligger
 * i bundskaev.ts og REGLEN her.
 */

/**
 * Under dette flytter vi ingenting.
 *
 * `visualViewport.height` giver broekdele af en pixel, og de to maal kan
 * vaere et par pixels fra hinanden uden at der er noget galt. Fejlen, det
 * her findes for, er omkring 60 px.
 */
const MINDSTE_PX = 4;

/**
 * Over dette tror vi ikke paa maalingen.
 *
 * En korrektion, der er stoerre end dette, ville skubbe navigationen helt
 * ud af skaermen — og en app uden navigation er vaerre end en, hvor den
 * staar for hoejt. Loftet er altsaa ikke et gaet paa fejlens stoerrelse,
 * men en sikring mod at gøre det vaerre.
 */
const MEST_PX = 160;

/**
 * Hvor mange pixels skal den faste bundklynge skubbes NED?
 *
 * ## Hvad der maales
 *
 * `position: fixed` regner fra LAYOUT-viewporten, ikke fra skaermen. Efter
 * tastaturet har vaeret oppe, kan iOS lade layout-viewporten blive staaende
 * kortere end den flade, der faktisk er synlig — og saa staar alt fast for
 * hoejt, med appens egen baggrund nedenunder.
 *
 * `window.innerHeight` ER layout-viewporten. `visualViewport.height` er den
 * synlige flade. Er den synlige stoerre end layoutet, er forskellen praecis
 * den stribe, navigationen mangler at blive skubbet ned.
 *
 * ## Hvorfor det ikke rammer tastaturet
 *
 * Med tastaturet oppe er det omvendt: den synlige flade er MINDRE end
 * layoutet, saa `skaev` bliver negativ, og der korrigeres ikke. Tastaturet
 * haandteres af `--tastatur` i tastatur.ts og skal blive ved med at vaere
 * det — to mekanismer, der skubber det samme element, ville laegge sig oven
 * i hinanden.
 *
 * ## Hvorfor `offsetTop` diskvalificerer maalingen
 *
 * Er den visuelle viewport forskudt — man har knebet ind, eller iOS har
 * flyttet den under en rulning med tastaturet oppe — beskriver de to hoejder
 * ikke laengere det samme. Saa er svaret 0: hellere den kendte skaevhed end
 * en korrektion, der bygger paa noget, vi ikke forstod.
 */
export function bundskaev(maal: {
  /** `window.innerHeight` — layout-viewporten. */
  innerHeight: number;
  /** `visualViewport.height` — den synlige flade. */
  visualHeight: number;
  /** `visualViewport.offsetTop`. Alt andet end 0 gør maalingen ubrugelig. */
  offsetTop: number;
}): number {
  if (maal.offsetTop !== 0) return 0;
  if (!Number.isFinite(maal.innerHeight) || !Number.isFinite(maal.visualHeight)) {
    return 0;
  }

  const skaev = maal.visualHeight - maal.innerHeight;
  if (skaev < MINDSTE_PX) return 0;

  return Math.round(Math.min(skaev, MEST_PX));
}
