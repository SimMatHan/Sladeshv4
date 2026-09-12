import { useState } from "react";
import { Ark } from "./Ark";
import {
  hjemmeskaermgrunde,
  hjemmeskaermtrin,
  type Hjemmeskaermplatform,
} from "./hjemmeskaermregler";
import { useHjemmeskaerm } from "./useHjemmeskaerm";
import { tik } from "./haptik";

/**
 * "Læg den på hjemmeskærmen" — bjælken, der fortæller at det kan lade sig
 * gøre, og arket, der viser hvordan.
 *
 * ## Hvorfor den findes
 *
 * Appen ER en app, når den ligger på hjemmeskærmen: fuld skærm, eget
 * ikon, og — på iPhone — notifikationer, som slet ikke virker fra en
 * Safari-fane. Men ingen browser fortæller folk det. Chrome nævner det
 * halvhjertet i en menu, Safari gemmer det midt i Del-arket, og resultatet
 * er brugere, der kører appen i en fane i månedsvis uden at vide, at der
 * fandtes en bedre udgave.
 *
 * Så siger appen det selv.
 *
 * ## Bjælke først, ark bagefter
 *
 * Vejledningen er tre trin og en begrundelse — for meget til en bjælke i
 * toppen, og for lidt til at være værd at afbryde nogen med. Så bjælken
 * siger det korte, og den, der bliver nysgerrig, trykker sig videre.
 *
 * Det modsatte — et ark, der åbner af sig selv — var det første forslag,
 * og det er præcis den slags, folk lukker uden at læse.
 *
 * ## Android får en rigtig knap, iPhone får ord
 *
 * Chrome udleverer en installationsprompt (`beforeinstallprompt`), og når
 * den findes, er ét tryk det hele. Safari udleverer ingenting — der findes
 * ikke noget API, der kan lægge en iOS-app på hjemmeskærmen — så dér er
 * vejledningen ikke en nødløsning, den er den eneste vej.
 *
 * Se useHjemmeskaerm.ts for, hvordan prompten fanges, og
 * hjemmeskaermregler.ts for, hvornår der opfordres.
 */
export function Hjemmeskaermopfordring() {
  const { vis, platform, installer, luk } = useHjemmeskaerm();
  const [aabent, setAabent] = useState(false);

  if (!vis) return null;

  return (
    <>
      <div className="opfordring" role="status">
        <div className="opfordringindhold">
          <div className="opfordringtitel">Få Sladesh på hjemmeskærmen</div>
          <div className="opfordringtekst">
            {platform === "ios"
              ? "Så åbner den i fuld skærm som en rigtig app — og notifikationer virker, hvilket de ikke gør herfra."
              : "Så åbner den i fuld skærm som en rigtig app, uden adresselinje."}
          </div>

          {installer !== undefined ? (
            <button
              className="knap primaer"
              onClick={() => {
                tik();
                installer();
              }}
            >
              Installér
            </button>
          ) : (
            <button
              className="knap primaer"
              onClick={() => {
                tik();
                setAabent(true);
              }}
            >
              Vis hvordan
            </button>
          )}
        </div>

        <button className="opfordringluk" aria-label="Ikke nu" onClick={luk}>
          ×
        </button>
      </div>

      {aabent && (
        <Vejledning platform={platform} onLuk={() => setAabent(false)} />
      )}
    </>
  );
}

function Vejledning({
  platform,
  onLuk,
}: {
  platform: Hjemmeskaermplatform;
  onLuk: () => void;
}) {
  const trin = hjemmeskaermtrin(platform);
  const grunde = hjemmeskaermgrunde(platform);

  return (
    <Ark titel="Føj til hjemmeskærm" onLuk={onLuk}>
      <div className="arkgruppe">
        <h3>Sådan gør du</h3>
        {/* Nummereret med vilje. Det her er en raekkefoelge, ikke en
            liste af muligheder — trin to giver ingen mening, foer trin
            et er gjort. */}
        <ol className="trinliste">
          {trin.map((linje) => (
            <li key={linje}>{linje}</li>
          ))}
        </ol>
      </div>

      <div className="arkgruppe">
        <h3>Hvorfor</h3>
        <ul className="trinliste">
          {grunde.map((linje) => (
            <li key={linje}>{linje}</li>
          ))}
        </ul>
      </div>

      <div className="arkgruppe">
        <p className="hjaelp">
          Det er den samme app og den samme konto — du skal ikke logge ind
          igen, og du mister ingenting.
        </p>
      </div>
    </Ark>
  );
}
