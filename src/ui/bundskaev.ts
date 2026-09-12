import { useEffect } from "react";
import { bundskaev } from "./bundskaevregler";

/**
 * Retter den faste bundklynge, naar layout-viewporten er kortere end skaermen.
 *
 * ## Fejlen
 *
 * Efter man har vaeret i chatten, staar navigationen af og til for hoejt —
 * med en stribe af appens egen baggrund under sig. Den bliver staaende,
 * indtil noget andet tilfaeldigvis retter den.
 *
 * `position: fixed` regner fra LAYOUT-viewporten, ikke fra skaermen. Naar
 * iOS har haft tastaturet oppe, kan den lade layout-viewporten blive
 * staaende kortere end den flade, der faktisk er synlig — og saa rykker ALT
 * fast med: navigationen, skriveren, kvitteringen og sloeret.
 *
 * ## Hvorfor den her og ikke flere spaerrer i tastatur.ts
 *
 * Der ligger allerede to forsoeg paa at FOREBYGGE det: at slippe feltet, naar
 * tastaturet gaar ned, og at rydde op ved afmontering. Begge er rigtige, og
 * begge hjaelper — men ingen af dem kan tvinge iOS til at give
 * layout-viewporten tilbage. Det er der ingen web-API, der kan.
 *
 * Saa i stedet for at gaette paa aarsagen MAALER vi foelgen. Er den synlige
 * flade stoerre end layoutet, er forskellen praecis den stribe, der mangler,
 * og saa skubbes bundklyngen ned med den. Er der ingen forskel — hvilket der
 * ikke er det meste af tiden — saettes variablen til 0, og intet flytter sig.
 *
 * Det er ogsaa hvorfor den er sikker: den retter en MAALT afvigelse, ikke en
 * formodet. Er fejlen vaek af sig selv en dag, goer den her ingenting.
 *
 * ## Hvorfor den ikke roerer tastaturet
 *
 * Med tastaturet oppe er den synlige flade MINDRE end layoutet, og
 * `bundskaev` svarer 0. Loeftet fri af tastaturet ejes fortsat af
 * `--tastatur` i tastatur.ts. To mekanismer, der skubbede det samme element,
 * ville laegge sig oven i hinanden.
 */
export function useBundskaev(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    const rod = document.documentElement;
    if (vv === null || vv === undefined) return;

    let sidste = -1;

    const maal = () => {
      const px = bundskaev({
        innerHeight: window.innerHeight,
        visualHeight: vv.height,
        offsetTop: vv.offsetTop,
      });

      // Kun ved aendring. `visualViewport` melder mange gange i sekundet
      // under en rulning, og en skrivning til `style` per melding ville
      // invalidere layoutet lige saa ofte.
      if (px === sidste) return;
      sidste = px;
      rod.style.setProperty("--bundskaev", `${px}px`);
    };

    maal();
    vv.addEventListener("resize", maal);
    // `scroll` med: iOS flytter den visuelle viewport under en rulning, og
    // det er netop under rulning, fejlen bliver synlig.
    vv.addEventListener("scroll", maal);
    window.addEventListener("orientationchange", maal);

    return () => {
      vv.removeEventListener("resize", maal);
      vv.removeEventListener("scroll", maal);
      window.removeEventListener("orientationchange", maal);
      // Skallen afmonteres kun, naar appen lukkes — men en efterladt
      // variabel paa `<html>` ville overleve en hot reload under udvikling
      // og forvirre den naeste maaling.
      rod.style.removeProperty("--bundskaev");
    };
  }, []);
}
