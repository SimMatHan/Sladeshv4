import { useEffect, useState } from "react";
import { tastaturskifte } from "./tastaturskifte";

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
      /*
       * FOKUS AFGØR, OM DER OVERHOVEDET ER ET TASTATUR — ikke målingen.
       *
       * Uden den her linje blev skriveren HÆNGENDE oppe, efter man var
       * færdig med at skrive. Grunden er, at `visualViewport` ikke
       * garanterer en sidste hændelse, når iOS er faerdig med at trække
       * tastaturet ned: den melder undervejs i animationen, og den sidste
       * melding kan komme, mens der stadig er 40-50 px tilbage. Så bliver
       * tallet stående, ingen ny hændelse retter det, og `.skriver` bliver
       * løftet resten af tiden — også når man forlader chatten, fordi
       * ingenting nulstiller det.
       *
       * Fokus er derimod entydigt: der findes ikke et tastatur uden et
       * felt, der har det. Er der ikke et skrivefelt i fokus, ER
       * tastaturet nede, uanset hvad viewporten har nået at melde.
       */
      if (!skrivefeltIFokus()) {
        setTastatur(0);
        ryddOpEfterTastatur();
        return;
      }

      const daekket = window.innerHeight - vv.height - vv.offsetTop;
      slipFeltetNaarTastaturetErVaek(daekket);
      // Afrundet og med gulv: `visualViewport` giver brøkdele af en pixel,
      // og et negativt tal (fx mens der zoomes) må ikke løfte noget.
      setTastatur(Math.max(0, Math.round(daekket)));
    };

    // `focusout` melder, FØR det næste felt har fået fokus, så
    // `document.activeElement` stadig er det gamle. Et billede senere er
    // den landet — ellers ville et spring fra ét felt til et andet blive
    // læst som "tastaturet er nede" og få skriveren til at hoppe.
    //
    // Billedet aflyses i oprydningen: uden det kan en ventende måling nå at
    // køre, efter komponenten er væk.
    let ventende = 0;
    const senereMaal = () => {
      cancelAnimationFrame(ventende);
      ventende = requestAnimationFrame(maal);
    };

    maal();
    vv.addEventListener("resize", maal);
    // `scroll` med: iOS flytter den visuelle viewport, når man ruller med
    // tastaturet oppe, og så ændrer `offsetTop` sig uden en resize.
    vv.addEventListener("scroll", maal);
    document.addEventListener("focusin", senereMaal);
    document.addEventListener("focusout", senereMaal);

    return () => {
      cancelAnimationFrame(ventende);
      vv.removeEventListener("resize", maal);
      vv.removeEventListener("scroll", maal);
      document.removeEventListener("focusin", senereMaal);
      document.removeEventListener("focusout", senereMaal);
    };
  }, []);

  return tastatur;
}

/**
 * Den fulde layout-viewport, altså højden UDEN tastatur.
 *
 * Den største `innerHeight`, vi har set. Der findes ikke et opslag for
 * "hvor høj ville siden være uden tastatur" — men den højeste værdi, siden
 * nogensinde har haft, ER den, for tastaturet kan kun gøre den mindre.
 */
let fuldHoejde = 0;

/**
 * Bredden, `fuldHoejde` blev målt ved.
 *
 * Drejer man telefonen, bliver siden lavere, uden at der er et tastatur.
 * Uden den her ville den gamle portræthøjde stå tilbage som "fuld", og
 * landskab ville se ud som et tastatur, der aldrig gik ned. Skifter
 * bredden, kasseres målingen og tages forfra.
 */
let fuldHoejdeVedBredde = 0;

/** Var tastaturet oppe sidst, vi målte? */
let varOppe = false;


/**
 * SLIPPER FELTET, når tastaturet er gået ned, men fokus blev hængende.
 *
 * ## Hvad der er målt
 *
 * På et skærmbillede fra en iPhone 15 Pro lå navigationens underkant 110,3
 * CSS px over skærmens bund. Reglen siger `--bund-sikker + --luft-4`, altså
 * 34 + 16 = 50. Mellemrummet mellem skriveren og navigationen var derimod
 * rigtigt: 10,3 px mod 8 forventede.
 *
 * Hele den faste bundklynge lå altså 60 px for højt, og navigationens
 * `bottom` rører aldrig `--tastatur`. Det udelukker, at variablen hang fast,
 * og peger ét sted hen: LAYOUT-VIEWPORTEN var 60 px kortere end skærmen.
 * `position: fixed` regner fra den, ikke fra glasset, så alt fast rykkede
 * med. De 60 px forneden var appens egen baggrund, fordi `<html>`s farve
 * bredes ud over hele lærredet.
 *
 * ## Hvorfor den bliver kortere
 *
 * `index.html` beder om `interactive-widget=resizes-content`. Den blev
 * skrevet ind for Android, men nyere iOS er begyndt at følge den, og så
 * KRYMPER iOS layout-viewporten, mens man skriver. Det er meningen.
 *
 * Problemet er tilbehørsbjælken over tastaturet. Den hører til FOKUS, ikke
 * til tastaturet, så bliver feltet fokuseret, når man har slået tastaturet
 * ned — ved at stryge det væk, eller ved at trykke på en fane — bliver
 * bjælkens plads ved med at være reserveret. Cirka 60 px. Præcis det, der
 * blev målt.
 *
 * ## Hvorfor et hardware-tastatur ikke rammes
 *
 * Vi slipper KUN feltet, hvis vi først har set noget forsvinde, der var
 * stort nok til at være et rigtigt tastatur (`TASTATUR_MINDST`), og det
 * derefter er kommet tilbage. På en iPad med fysisk tastatur sker det
 * første aldrig — dér er der ingen skærmtastatur, kun en bjælke — så feltet
 * bliver aldrig sluppet under en, der sidder og skriver.
 */
function slipFeltetNaarTastaturetErVaek(daekket: number): void {
  const svar = tastaturskifte(
    { fuld: fuldHoejde, bredde: fuldHoejdeVedBredde, varOppe },
    { hoejde: window.innerHeight, bredde: window.innerWidth, daekket },
  );

  fuldHoejde = svar.fuld;
  fuldHoejdeVedBredde = svar.bredde;
  varOppe = svar.varOppe;

  if (!svar.slip) return;

  // Tastaturet er væk, men feltet har stadig fokus. Det er dét, der holder
  // tilbehørsbjælkens plads reserveret.
  const aktiv = document.activeElement;
  if (aktiv instanceof HTMLElement) aktiv.blur();
}

/**
 * Har et felt, der kan skrives i, fokus lige nu?
 *
 * `isContentEditable` er med, selv om appen ikke bruger det i dag: en
 * fremtidig rig tekstboks ville ellers få tastaturet meldt nede, mens man
 * skrev i den.
 */
function skrivefeltIFokus(): boolean {
  const aktiv = document.activeElement;
  if (!(aktiv instanceof HTMLElement)) return false;
  if (aktiv.isContentEditable) return true;
  return aktiv.tagName === "INPUT" || aktiv.tagName === "TEXTAREA";
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
