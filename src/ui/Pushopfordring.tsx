import { useState } from "react";
import { usePush } from "./usePush";

/**
 * "Du får ingen notifikationer" — bjælken der siger det én gang.
 *
 * Kontakten har ligget i Indstillinger hele tiden, bag et tandhjul på
 * Mig-fanen. Det er det rigtige sted at HAVE den og et håbløst sted at
 * OPDAGE den: man går ikke ind i indstillingerne for at lede efter en
 * funktion, man ikke ved findes. Resultatet var brugere, der sad uden at
 * vide, at nogen havde skrevet til dem.
 *
 * Så siger appen det selv — én gang, øverst, med knappen i selve bjælken.
 *
 * ## Den slår til HERFRA, den sender ikke videre til Indstillinger
 *
 * `Notification.requestPermission()` skal nås inden for det klik, brugeren
 * lavede. Sendte bjælken folk videre til et ark, de så skulle trykke igen i,
 * ville vi have to klik og en ekstra skærm mellem en, der lige har sagt ja,
 * og det hun sagde ja til. Se `usePush()` for hvorfor rækkefølgen er
 * kritisk.
 *
 * ## Hvornår den IKKE vises
 *
 * De fleste af tilstandene i `usePush()` er "der er ingen knap at trykke
 * på her", og så skal der heller ikke stå en bjælke:
 *
 *   til             de har det allerede
 *   ukendt          vi ved det ikke endnu; en bjælke, der blinker forbi,
 *                   er værre end en, der kommer et halvt sekund senere
 *   ikkestoettet    browseren kan ikke, og brugeren kan ikke gøre noget
 *   serverklarikke  VAPID-nøglerne mangler — vores fejl, ikke brugerens,
 *                   og at bede hende trykke ville bare give en fejl
 *   afvist          browseren HUSKER et nej. Vores knap kan ikke omgøre
 *                   det; kun browserens egne indstillinger kan. Den bliver
 *                   i Indstillinger, hvor der er plads til at forklare
 *                   hvordan — en bjælke i toppen, man ikke kan handle på,
 *                   er ren støj.
 *
 * Tilbage står to: `fra` (der ER en knap) og `iosudenhjem` (der er en
 * håndgribelig vej, den er bare ikke en knap).
 *
 * ## Om at lukke den
 *
 * `localStorage`, ikke `sessionStorage` som broadcast-bjælken. En broadcast
 * er admins vigtige besked, der gælder nu, og den må gerne komme igen i en
 * ny fane. Det her er en opfordring: har man sagt nej tak, er det svaret,
 * og at spørge igen ved hver ny fane ville gøre appen til en, der tigger.
 * Lagringen er per enhed — hvilket passer, for et push-abonnement er også
 * per enhed. Lukker man på telefonen, skal laptoppen stadig kunne spørge.
 *
 * Fortryder man, står kontakten i Indstillinger. Bjælken er en genvej, ikke
 * det eneste sted.
 */
export function Pushopfordring() {
  const { status, arbejder, fejl, skift } = usePush();
  const [lukket, setLukket] = useState(() => erLukket());

  if (lukket) return null;
  if (status !== "fra" && status !== "iosudenhjem") return null;

  const luk = () => {
    setLukket(true);
    gemLukket();
  };

  return (
    <div className="pushopfordring" role="status">
      <div className="pushindhold">
        <div className="pushtitel">Slå notifikationer til</div>
        <div className="pushtekst">
          {status === "iosudenhjem"
            ? "På iPhone skal appen først føjes til hjemmeskærmen. Tryk på Del-knappen i Safari og vælg “Føj til hjemmeskærm” — så kan du få besked."
            : "Få besked når nogen skriver i chatten, sladesher dig, eller går ud i aften."}
        </div>

        {status === "fra" && (
          <button className="knap primaer" disabled={arbejder} onClick={() => void skift()}>
            {arbejder ? "Slår til …" : "Slå til"}
          </button>
        )}

        {fejl !== undefined && <p className="fejl">{fejl}</p>}
      </div>

      <button className="pushluk" aria-label="Ikke nu" onClick={luk}>
        ×
      </button>
    </div>
  );
}

const NOEGLE = "pushopfordringLukket";

/**
 * `localStorage` kaster i private vinduer og når lagring er slået fra. En
 * bjælke, der ikke kan huske at være lukket, er stadig bedre end en app,
 * der ikke starter.
 */
function erLukket(): boolean {
  try {
    return localStorage.getItem(NOEGLE) === "1";
  } catch {
    return false;
  }
}

function gemLukket(): void {
  try {
    localStorage.setItem(NOEGLE, "1");
  } catch {
    // Ingen lagring tilgængelig. Bjælken kommer igen ved genindlæsning.
  }
}
