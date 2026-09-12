import { useEffect, useRef, useState } from "react";
import { DRINK_CATEGORIES } from "../../convex/constants";
import { dunk, slag, tik } from "./haptik";
import {
  kandidater,
  rullepause,
  rulleraekke,
  vaelgTilfaeldig,
  type Kandidat,
} from "./tilfaeldigValg";

/**
 * "Lad skæbnen vælge" — hjulet, der bestemmer næste genstand.
 *
 * Åbnes fra 🎲 i log-arkets øverste højre hjørne. Hjulet ruller gennem
 * kataloget, bremser, lander — og logger så det, det landede på.
 *
 * ## Resultatet er trukket, FØR hjulet begynder
 *
 * `vaelgTilfaeldig` kaldes én gang med det samme, og animationen bygges
 * bagefter omkring det svar (`rulleraekke`). Det modsatte — at lade hjulet
 * lande, hvor det nu lander — ville betyde, at et hak i billedhastigheden
 * ændrede, hvad man skulle drikke. Se tilfaeldigValg.ts.
 *
 * ## Den logger, og den siger det tydeligt
 *
 * Hele pointen er, at man er bundet: hjulet har talt, genstanden står på
 * stillingen, og nu skal den skaffes. Derfor logges der ved landingen og
 * ikke ved en ekstra bekræftelse — en "vil du?" bagefter ville gøre det til
 * et forslag.
 *
 * Fortryd findes stadig: kvitteringen i skallen har den i seks sekunder,
 * som ved enhver anden logning. Det er den rigtige sikkerhedsventil — den
 * ligger uden for legen frem for at stå midt i den.
 *
 * ## `prefers-reduced-motion`
 *
 * Slås op i JavaScript, ikke kun i CSS. Det her er ikke en `animation`, som
 * den globale regel kan slukke — det er en kæde af `setTimeout`, der skifter
 * tekst tredive gange. Har man bedt om ro, springes hele rullen over, og
 * resultatet står med det samme.
 */

/** Så mange navne ruller forbi, før det rigtige står tilbage. */
const RULLETRIN = 22;

type Tilstand =
  /**
   * FØR hjulet begynder. Et skridt, der ikke var der før.
   *
   * Hjulet logger ved landingen — man er bundet, i det sekund det stopper.
   * Uden et spørgsmål først var ét fejltryk på 🎲 nok til at have en
   * genstand på stillingen, man aldrig bad om. Fortryd i kvitteringen
   * fangede det, men seks sekunder er ikke meget at opdage det på.
   *
   * Det er også her, man får at vide HVAD der sker. "Den logger den med
   * det samme" er en oplysning, man skal have inden — ikke bagefter.
   */
  | { slags: "spoerger" }
  | { slags: "ruller"; vist: Kandidat }
  | { slags: "landet"; vinder: Kandidat };

export function Tilfaeldig({
  katalog,
  onValgt,
  onLuk,
}: {
  katalog: readonly Kandidat[];
  /** Kaldes ÉN gang, når hjulet lander. Logger genstanden. */
  onValgt: (kandidat: Kandidat) => void;
  onLuk: () => void;
}) {
  const [tilstand, setTilstand] = useState<Tilstand>({ slags: "spoerger" });

  // `onValgt` må kun kaldes én gang. Uden den her kunne en gentegning midt
  // i kæden logge den samme genstand to gange.
  const harLogget = useRef(false);

  const [ruller, setRuller] = useState(false);

  /*
   * Er der overhovedet noget at traekke imellem?
   *
   * 🎲-knappen er spaerret, naar kataloget er TOMT — men et katalog kan
   * vaere fuldt af `other` (cigaretter og lignende), som hjulet ikke
   * traekker fra. Uden det her tjek ville "Rul" saa ikke goere noget, og
   * en knap, der ikke goer noget, er vaerre end en, der ikke er der.
   */
  const harKandidater = kandidater(katalog, erDrikkevare).length > 0;

  useEffect(() => {
    if (!ruller) return;

    const liste = kandidater(katalog, erDrikkevare);
    const vinder = vaelgTilfaeldig(liste);
    if (vinder === undefined) return;

    const land = () => {
      setTilstand({ slags: "landet", vinder });
      if (!harLogget.current) {
        harLogget.current = true;
        onValgt(vinder);
      }
      // "Du skal handle NU" — se haptik.ts. Kun Android.
      slag();
    };

    const roligt = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (roligt) {
      land();
      return;
    }

    const raekke = rulleraekke(liste, vinder, RULLETRIN);
    let trin = 0;
    let timer = 0;

    const naeste = () => {
      const denne = raekke[trin];
      if (denne === undefined) return;

      if (trin === raekke.length - 1) {
        land();
        return;
      }

      setTilstand({ slags: "ruller", vist: denne });
      // Et lille stød undervejs, så hjulet også kan mærkes i en larmende bar.
      if (trin > 0 && trin % 7 === 0) dunk();

      trin++;
      timer = window.setTimeout(naeste, rullepause(trin, raekke.length));
    };

    naeste();
    return () => clearTimeout(timer);
    // Kataloget skifter ikke, mens hjulet kører — arket er åbent oven på
    // det. Kørte effekten igen, ville hjulet starte forfra midt i rullen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruller]);

  return (
    <>
      {/* Dugen lukker IKKE, mens hjulet ruller: et tryk ved siden af midt i
          en rulle, der er ved at logge noget, ville efterlade en genstand,
          man ikke så komme. Mens den SPØRGER, må den gerne — dér er der
          ingenting i gang, og "ved siden af" er et lige så gyldigt nej som
          knappen. */}
      <button
        className="dug hjuldug"
        aria-label="Luk"
        onClick={
          tilstand.slags === "landet" || tilstand.slags === "spoerger"
            ? onLuk
            : undefined
        }
      />

      <div className="hjul" role="dialog" aria-modal="true" aria-label="Skæbnen vælger">
        {tilstand.slags === "spoerger" ? (
          <>
            <div className="hjulterning" aria-hidden="true">
              🎲
            </div>
            <span className="etiket">Lad skæbnen vælge</span>
            <p className="hjulsporgsmaal">
              {harKandidater
                ? "Der trækkes én genstand fra kataloget — og den bliver logget med det samme."
                : "Der er ingen drikkevarer i kataloget at trække imellem. En admin kan tilføje dem."}
            </p>

            {harKandidater && (
              <button
                className="knap primaer"
                onClick={() => {
                  tik();
                  setRuller(true);
                }}
              >
                Rul
              </button>
            )}
            <button className="knap" onClick={onLuk}>
              {harKandidater ? "Ikke nu" : "Luk"}
            </button>
          </>
        ) : tilstand.slags === "ruller" ? (
          <>
            <span className="etiket">Skæbnen vælger …</span>
            {/* `aria-hidden`: rullen er ren pynt, og en skærmlæser, der
                læste toogtyve navne op, ville sige noget helt andet end
                det, der sker. Resultatet nedenfor annonceres i stedet. */}
            <div className="hjulnavn" aria-hidden="true">
              <span className="hjulemoji">{emojiFor(tilstand.vist.categoryId)}</span>
              {tilstand.vist.name}
            </div>
          </>
        ) : (
          <>
            <span className="etiket">Skæbnen har talt</span>
            <div className="hjulnavn landet" role="status">
              <span className="hjulemoji">{emojiFor(tilstand.vinder.categoryId)}</span>
              {tilstand.vinder.name}
            </div>

            {/* Det vigtigste på skærmen. Genstanden ER logget — nu mangler
                den at blive skaffet, og det skal stå så tydeligt, at ingen
                er i tvivl om, hvad der lige skete. */}
            <p className="hjulordre">Hent den. Den er allerede logget.</p>

            <button className="knap primaer" onClick={onLuk}>
              Så henter jeg den
            </button>
          </>
        )}
      </div>
    </>
  );
}

function erDrikkevare(categoryId: string): boolean {
  return DRINK_CATEGORIES.find((k) => k.id === categoryId)?.isDrink === true;
}

function emojiFor(categoryId: string): string {
  return DRINK_CATEGORIES.find((k) => k.id === categoryId)?.emoji ?? "🥤";
}
