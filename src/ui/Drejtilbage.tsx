/**
 * "Drej telefonen tilbage" — appen findes kun i portræt.
 *
 * ## Hvorfor den findes, når manifestet allerede siger `portrait`
 *
 * `manifest.webmanifest` har haft `"orientation": "portrait"` hele tiden, og
 * på Android virker den: en installeret PWA drejer ikke med.
 *
 * **iOS ignorerer den.** Safari læser ikke `orientation` fra manifestet,
 * heller ikke for en app på hjemmeskærmen, og `screen.orientation.lock()`
 * findes ikke dér. Der er ingen vej til en rigtig lås på iPhone — hverken
 * fra en webapp eller fra en, der er lagt på hjemmeskærmen.
 *
 * Det, der KAN lade sig gøre, er at lade være med at vise en liggende
 * udgave. Appen er tegnet til én kolonne på en telefon: stillingen,
 * chatten og den faste bundklynge har alle en portræthøjde regnet ind, og
 * liggende bliver navigationen og indholdet presset sammen om de samme
 * 400 px. Så hellere sige det ligeud end at tegne noget, der ser i stykker
 * ud.
 *
 * ## Den rammer KUN telefoner
 *
 * Betingelsen er liggende OG lav — se `.drejtilbage` i index.css. En iPad i
 * landskab er omkring 800 px høj og et skrivebord endnu mere; de rammes
 * ikke, og dér er der heller ingen grund til at blokere. En telefon i
 * landskab er 350-430 px høj.
 *
 * Et tastatur i portræt kan også gøre skærmen lav, men ændrer ikke
 * orienteringen — derfor begge betingelser, ikke kun højden.
 *
 * ## Hvorfor den ligger i DOM'en hele tiden
 *
 * Skjult af CSS frem for monteret af JavaScript. En `matchMedia`-lytter i
 * React ville tegne appen om ved hver drejning, og der er ikke noget at
 * regne ud — det er ren visning, og CSS kan det hurtigere og uden en
 * tilstand, der kan komme ud af trit.
 */
export function Drejtilbage() {
  return (
    <div className="drejtilbage" role="alert">
      <div className="drejikon" aria-hidden="true">
        📱
      </div>
      <p className="drejtekst">Drej telefonen tilbage</p>
      <p className="hjaelp">SladeshApp er lavet til at stå op.</p>
    </div>
  );
}
