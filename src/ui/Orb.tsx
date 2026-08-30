/**
 * Orben — Mig-fanens ene store tal, tegnet som en levende kugle.
 *
 * Forlægget er Ultrahumans ringapp: en kugle, der driver langsomt rundt i
 * sig selv, med tallet midt i og en etikette under. Man skifter mellem tal
 * ved at swipe.
 *
 * ## Ren CSS, ingen pakke
 *
 * docs/redesign-kontrakt.md afsnit 2: ingen animationsbibliotek, ingen
 * npm-pakker. Kuglen er derfor tre slørede pletter, der driver rundt bag en
 * rund maske — `overflow: hidden` på en cirkel. Det er hele trickset.
 *
 * SLØRINGEN LIGGER PÅ FORÆLDEREN, ikke på hver plet. Ét `filter: blur()` på
 * en beholder koster ét lag at tegne; tre koster tre, og på en ældre telefon
 * er det forskellen på en kugle, der driver, og en der hakker.
 *
 * Pletterne animeres kun med `transform`. Ingen `filter`, ingen
 * `background-position`, ingen bredde eller højde — de tre ville tvinge et
 * nyt lag frem for hver enkelt tegning.
 *
 * ## Farven kommer fra temaet
 *
 * `--accent` er ravgul i mørk, flaskegrøn i lys, og festivaltemaerne
 * overskriver den. Kuglen blander sig med `--bund`, så den følger med af sig
 * selv frem for at være tegnet til ét tema.
 *
 * ## Bevægelsen kan slås fra
 *
 * Den fælles `prefers-reduced-motion`-blok i index.css skærer varigheden ned
 * til ingenting, og så står kuglen stille. Den forsvinder ikke — den er
 * skærmens indhold, ikke dens pynt.
 */
export function Orb({
  tal,
  etiket,
  undertekst,
}: {
  /** Det store tal. En streng, fordi promille og genstande formateres hver
      for sig — orben skal ikke kende til komma og decimaler. */
  tal: string;
  etiket: string;
  undertekst?: string;
}) {
  return (
    <div className="orb">
      {/* `aria-hidden`: pletterne er udelukkende udseende. En skærmlæser
          skal have tallet og etiketten, ikke tre tomme span. */}
      <div className="orbsky" aria-hidden="true">
        <span className="orbplet a" />
        <span className="orbplet b" />
        <span className="orbplet c" />
      </div>

      <div className="orbindhold">
        <span className="orbtal">{tal}</span>
        <span className="orbetiket">{etiket}</span>
        {undertekst !== undefined && (
          <span className="orbundertekst">{undertekst}</span>
        )}
      </div>
    </div>
  );
}
