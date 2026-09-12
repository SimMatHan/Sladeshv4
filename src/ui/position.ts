import {
  erAfvist,
  gemPosition,
  husAfvisning,
  kendtPosition,
  type Position,
} from "./positionsregler";

/**
 * Positionen til en logning — spurgt én gang, genbrugt resten af aftenen.
 *
 * ## Hvorfor den findes
 *
 * Kortet har hele tiden haft en `watchPosition`, men den koerer kun, MENS
 * kortet er aabent. Logger man en genstand fra forsiden — hvilket er det,
 * folk goer — sendes der ingen position, og man staar ikke paa kortet,
 * selvom man lige har fortalt appen, at man er ude.
 *
 * Nu spoerger logningen selv. `logDrink` har taget imod en `location` siden
 * appen blev bygget og patcher `users.location` i SAMME transaktion som
 * check-in'et; klienten har bare aldrig sendt den.
 *
 * ## Én gang per aabning af appen
 *
 * Tilstanden ligger paa MODULET (positionsregler.ts) og ikke i en komponent.
 * Log-arket monteres og afmonteres ved hvert tryk paa ( + ), saa en `useRef`
 * ville blive nulstillet hver gang — og saa ville vi bede om positionen paa
 * ny ved hver eneste logning. Modulet lever, saa laenge fanen er aaben,
 * hvilket er praecis den levetid, der blev bedt om.
 *
 * ## Men ikke det samme fix hele natten
 *
 * Et gemt fix bruges kun, saa laenge det er FRISKT. Man flytter sig mellem
 * barer, og en position fra klokken 20 ville sige, at man stadig staar det
 * foerste sted klokken to.
 *
 * Det bryder ikke loeftet om "kun én gang": TILLADELSEN spoerges der kun om
 * én gang — browseren husker selv svaret — og en opfriskning bagefter sker
 * uden at brugeren ser noget.
 *
 * ## Den blokerer aldrig en logning
 *
 * `hentPosition` afventes ikke af den, der logger. GPS tager sekunder, og
 * log-arket lukker paa trykket med en optimistisk opdatering — at vente paa
 * en position ville aendre appens hurtigste handling til dens langsomste.
 */

/**
 * Hvor laenge browseren selv maa genbruge sit eget fix.
 *
 * Sat lavere end `FRISK_MS` i positionsregler.ts: den er browserens cache,
 * vores er sessionens, og den inderste af to skal vaere den strammeste,
 * ellers er den yderste uden betydning.
 */
const BROWSER_MAKS_ALDER_MS = 5 * 60 * 1000;

/** GPS i en kaelder kan tage evigheder. Efter dette er svaret "ikke nu". */
const TIMEOUT_MS = 15_000;

/** Et kald, der allerede er i gang. To logninger i traek skal dele det. */
let igang: Promise<Position | undefined> | undefined;

/**
 * Henter positionen, og beder om tilladelse hvis det er foerste gang.
 *
 * Svarer `undefined` i stedet for at kaste. Alle kaldere er "send den med,
 * hvis vi har den" — ingen af dem kan goere noget ved et nej, og en fejl, der
 * skal fanges hvert sted, ville bare blive slugt hvert sted.
 */
export async function hentPosition(): Promise<Position | undefined> {
  const kendt = kendtPosition();
  if (kendt !== undefined) return kendt;
  if (erAfvist()) return undefined;
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return undefined;
  }

  // Er kaldet allerede undervejs, ventes der paa DET. To logninger i traek
  // maa ikke blive til to GPS-opslag og to dialoger.
  if (igang !== undefined) return igang;

  igang = new Promise<Position | undefined>((klar) => {
    navigator.geolocation.getCurrentPosition(
      (svar) => {
        const position = {
          lat: svar.coords.latitude,
          lng: svar.coords.longitude,
        };
        gemPosition(position);
        klar(position);
      },
      (fejl) => {
        // Kun et NEJ lukker for resten af sessionen. En timeout i en kaelder
        // eller et fix, der ikke kunne laves, er midlertidigt — dér skal
        // naeste logning have lov at proeve igen.
        if (fejl.code === fejl.PERMISSION_DENIED) husAfvisning();
        klar(undefined);
      },
      {
        // `enableHighAccuracy: false`: vi skal vise en prik paa et bykort,
        // ikke navigere. Den unoejagtige er hurtigere og koster mindre
        // batteri, og forskellen er meter paa en skaerm, hvor en bar fylder
        // et par pixels.
        enableHighAccuracy: false,
        maximumAge: BROWSER_MAKS_ALDER_MS,
        timeout: TIMEOUT_MS,
      },
    );
  }).finally(() => {
    igang = undefined;
  });

  return igang;
}

export { kendtPosition, gemPosition, type Position } from "./positionsregler";
