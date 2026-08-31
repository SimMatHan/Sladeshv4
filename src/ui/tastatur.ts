import { useEffect, useState } from "react";

/**
 * Hvor mange pixels tastaturet dækker af skærmen. 0 når det er nede.
 *
 * ## Hvorfor den findes
 *
 * `index.html` sætter `interactive-widget=resizes-content`, som får
 * tastaturet til at SKUBBE indholdet op frem for at lægge sig over det.
 * Den findes kun i Chrome/Android. På iOS ændrer tastaturet ikke
 * layout-viewporten overhovedet — det lægger sig oven på, og `bottom: 0`
 * peger stadig på skærmens bund, altså bag tastaturet.
 *
 * `visualViewport` er den ene kilde, der kender den faktiske synlige flade.
 * Forskellen mellem den og `window.innerHeight` ER tastaturet.
 *
 * På Android bliver tallet ~0 af sig selv: dér er `innerHeight` allerede
 * skrumpet af `resizes-content`, så der ikke kompenseres to gange.
 *
 * ## Hvorfor den ligger her og ikke i Ark.tsx
 *
 * Den blev skrevet til log-arket, hvor tastaturet lagde sig over de chips,
 * man skulle vælge imellem. Chattens skriver har præcis samme problem og
 * havde præcis samme forkerte antagelse i sin kommentar — at
 * `resizes-content` klarede den på iOS. To kopier af den slags måling
 * driver fra hinanden; den ene bliver rettet, og den anden bliver glemt.
 */
export function useTastaturhoejde(): number {
  const [tastatur, setTastatur] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (vv === null || vv === undefined) return;

    const maal = () => {
      const daekket = window.innerHeight - vv.height - vv.offsetTop;
      // Afrundet og med gulv: `visualViewport` giver brøkdele af en pixel,
      // og et negativt tal (fx mens der zoomes) må ikke løfte noget.
      const nu = Math.max(0, Math.round(daekket));
      setTastatur(nu);
      if (nu === 0) ryddOpEfterTastatur();
    };

    maal();
    vv.addEventListener("resize", maal);
    // `scroll` med: iOS flytter den visuelle viewport, når man ruller med
    // tastaturet oppe, og så ændrer `offsetTop` sig uden en resize.
    vv.addEventListener("scroll", maal);

    return () => {
      vv.removeEventListener("resize", maal);
      vv.removeEventListener("scroll", maal);
    };
  }, []);

  return tastatur;
}

/**
 * Ruller dokumentet tilbage, hvis iOS efterlod det forbi sin egen bund.
 *
 * ## Fejlen
 *
 * Appen ruller på VINDUET — `.skal` er `min-height: 100dvh` i et almindeligt
 * dokument, ikke en indre boks med `overflow: auto`. Når man trykker i
 * chattens skriver, ruller iOS selv dokumentet for at få feltet fri af
 * tastaturet. Når tastaturet går ned igen, ruller iOS ikke altid tilbage,
 * og så står dokumentet rullet forbi sit eget indhold. Det ses som en
 * stribe bar baggrund forneden — et "mellemrum", der ikke var der før — og
 * det bliver stående, når man forlader chatten, fordi et faneskift ikke
 * rører rullepositionen.
 *
 * ## Hvorfor den er sikker
 *
 * Den retter KUN en overrulning: står vinduet inden for sit eget indhold,
 * gør den ingenting. Den kan altså ikke rive siden op under en, der
 * ruller — den kan kun tage en position tilbage, som dokumentet ikke selv
 * kan nå.
 *
 * `requestAnimationFrame` to gange, fordi tastaturet trækker sig ned over
 * et par billeder på iOS. Måler man i samme billede, som `visualViewport`
 * melder 0, er `scrollHeight` stadig det gamle tal, og så retter man mod en
 * bund, der er ved at flytte sig.
 */
function ryddOpEfterTastatur(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const bund = document.documentElement.scrollHeight - window.innerHeight;
      const maks = Math.max(0, bund);
      if (window.scrollY > maks) window.scrollTo(0, maks);
    });
  });
}
