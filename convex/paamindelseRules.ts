import { getDrinkDayStart, lokalDele } from "./constants";

/**
 * De to tidsstyrede påmindelser — de rene regler.
 *
 * Appens øvrige seks push-varslinger udløses alle af, at NOGEN gør noget: en
 * besked, en genstand, en Sladesh, en beacon. De to her udløses af klokken,
 * og de er hinandens spejlbillede:
 *
 *   weekend    fredag og lørdag kl. 20     til dem der IKKE er ude
 *   aktivitet  hver time fra 14 til 02     til dem der ER ude
 *
 * Den ene henter folk ind, den anden holder dem i gang. `erUdeIDag` er
 * allerede grænsen mellem de to grupper, så begge bruger den — bare med
 * hvert sit fortegn, og så kan ingen få begge på én aften.
 *
 * Begge fandtes i det gamle repo som Firebase-jobs og faldt ud under
 * migreringen: `functions/src/scheduled/weekendLoggingReminder.ts`
 * (`schedule: "0 20 * * 5,6"`) og `.../usageReminder.ts`
 * (`schedule: "0 14,15,…,2 * * *"`).
 *
 * Reglerne ligger her og ikke i paamindelser.ts af samme grund som
 * `sladeshRules` og `beaconRules`: tiden er det, der kan gå galt, og en ren
 * funktion kan testes mod et konkret tidspunkt uden et deployment.
 */

/** Fredag og lørdag. `Date`-konventionen: 0 = søndag. */
const PAAMINDELSESDAGE = [5, 6] as const;

/**
 * Klokken 20 dansk tid.
 *
 * Sent nok til at være aftenens begyndelse frem for eftermiddag, og tidligt
 * nok til at nå folk, før de er gået. Det var også det tidspunkt, det gamle
 * repo brugte.
 */
const PAAMINDELSESTIME = 20;

/**
 * Er `now` et af de tidspunkter, hvor der skal mindes?
 *
 * ## Hvorfor det er et TIMEtjek og ikke et klokkeslæt i cron'en
 *
 * Convex-crons regnes i UTC. "Fredag kl. 20 dansk tid" er 18:00 UTC om
 * sommeren og 19:00 UTC om vinteren, så et fast UTC-klokkeslæt ville ramme
 * en time forkert det halve år — præcis den fælde, kommentaren øverst i
 * crons.ts advarer om, og grunden til at alle de andre job er `interval`.
 *
 * I stedet kører jobbet hver time på minut 0, og DENNE funktion afgør, om
 * den time er den rigtige. Så regnes dansk tid ét sted, af den samme
 * `lokaleDele`, som resten af appens døgngrænser bruger, og sommertid er
 * ikke længere noget, nogen skal huske.
 *
 * Ugedagen udledes af den LOKALE dato, ikke af `now` direkte: kl. 20 dansk
 * tid er stadig samme dag i UTC, men at bygge datoen op af de lokale dele er
 * det eneste, der også holder for de tidspunkter, hvor de to falder på hver
 * sin side af midnat.
 */
export function erPaamindelsestid(now: number): boolean {
  const { year, month, day, hour } = lokalDele(now);
  if (hour !== PAAMINDELSESTIME) return false;

  const ugedag = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (PAAMINDELSESDAGE as readonly number[]).includes(ugedag);
}

/**
 * Nøglen for den påmindelse, `now` hører til.
 *
 * Gemmes på brugeren, når hun er varslet, og sammenlignes ved næste kørsel.
 * Uden den ville et gentaget jobkald inden for samme time — en genkørsel,
 * en overlappende cron — sende påmindelsen igen.
 *
 * Drikkedagens start bruges som nøgle frem for et nyt tidsbegreb. Fredag kl.
 * 20 og lørdag kl. 20 ligger i hver sin drikkedag (10:00 → 10:00), så de to
 * skelnes af sig selv, og tallet betyder noget, man kan slå op, hvis en
 * bruger spørger, hvorfor hun ikke fik den.
 */
export function paamindelsesNoegle(now: number): number {
  return getDrinkDayStart(now);
}

/**
 * Teksten.
 *
 * Ingen navne og ingen tal. De fem andre varslinger handler om noget, en
 * bestemt person har gjort; denne handler om, at modtageren ikke har gjort
 * noget endnu, og en påmindelse, der lader som om den ved noget om aftenen,
 * ville lyde forkert for den, der sidder hjemme.
 */
export function paamindelsesVarsling(): { titel: string; tekst: string } {
  return {
    titel: "🍺 Er du ude i aften?",
    tekst: "Husk at logge dine genstande — så tæller de med på stillingen.",
  };
}

// ---------------------------------------------------------------------------
// Aktivitetspåmindelsen — til dem der ER ude
// ---------------------------------------------------------------------------

/** Første og sidste time, regnet i dansk tid. Vinduet krydser midnat. */
const AKTIVITET_FRA_TIME = 14;
const AKTIVITET_TIL_TIME = 2;

/**
 * Højst så mange på én aften.
 *
 * Vinduet er tretten timer, og det gamle repo sendte i hver af dem uden loft.
 * Tretten pip er ikke en påmindelse, det er en alarm. Fire fordeler sig over
 * aftenen for den, der er gået i stå, og den, der logger undervejs, rammer
 * alligevel næsten aldrig loftet — stilhedskravet nedenfor stopper hende
 * først.
 */
export const AKTIVITET_MAX_PER_AFTEN = 4;

/**
 * Så længe skal der være gået, siden man sidst loggede.
 *
 * Uden den ville en, der lige har logget, blive mindet om at logge. Det er
 * ikke bare overflødigt — det får appen til at virke, som om den ikke kan se,
 * hvad man laver i den.
 */
export const AKTIVITET_STILHED_MS = 60 * 60 * 1000;

/**
 * Er `now` inden for aktivitetsvinduet?
 *
 * Vinduet krydser midnat (14 → 02), så det er to intervaller og ikke ét.
 * Samme timetjek som `erPaamindelsestid` og af samme grund: dansk tid regnes
 * her, ikke i cron'ens UTC.
 */
export function erAktivitetstid(now: number): boolean {
  const { hour } = lokalDele(now);
  return hour >= AKTIVITET_FRA_TIME || hour <= AKTIVITET_TIL_TIME;
}

export type Aktivitetstaeller = { dag: number; antal: number };

export type Aktivitetsbeslutning = {
  varsl: boolean;
  /** Til loggen, så en udeblevet påmindelse kan forklares bagefter. */
  aarsag: "varsl" | "loggede-for-nylig" | "loft-naaet";
};

/**
 * Skal denne bruger mindes lige nu?
 *
 * Kaldes kun for dem, der allerede er ude i aften — `erUdeIDag` er
 * afgjort af kalderen, som i `varslingUdeIAften`.
 *
 * De to spærrer er de justeringer, det gamle repo ikke havde, og de rammer
 * hver sin slags bruger: stilhedskravet fritager den, der er i gang, og
 * loftet fritager den, der er holdt op uden at checke ud.
 */
export function beslutAktivitetsvarsling(input: {
  /** `users.lastDrinkAt`. Udefineret for en, der er checket ind uden at logge. */
  sidsteGenstandAt: number | undefined;
  taeller: Aktivitetstaeller | undefined;
  /** Drikkedagens start, så tælleren fra i går ikke tæller med i aften. */
  dayStart: number;
  now: number;
}): Aktivitetsbeslutning {
  const { sidsteGenstandAt, taeller, dayStart, now } = input;

  if (sidsteGenstandAt !== undefined && now - sidsteGenstandAt < AKTIVITET_STILHED_MS) {
    return { varsl: false, aarsag: "loggede-for-nylig" };
  }

  // En tæller fra en anden drikkedag betyder ingenting i aften. Så
  // nulstiller den sig selv ved døgnskiftet frem for at skulle ryddes.
  const brugtIAften = taeller !== undefined && taeller.dag === dayStart ? taeller.antal : 0;
  if (brugtIAften >= AKTIVITET_MAX_PER_AFTEN) {
    return { varsl: false, aarsag: "loft-naaet" };
  }

  return { varsl: true, aarsag: "varsl" };
}

/**
 * Teksten. Ordret fra det gamle repo — den er kort, den siger hvad man skal,
 * og den har allerede været læst af de samme brugere i årevis.
 */
export function aktivitetsVarsling(): { titel: string; tekst: string } {
  return {
    titel: "Tid til en Sladesh-update?",
    tekst: "Log din næste drink 🍹",
  };
}

// ---------------------------------------------------------------------------
// Milepælshyldesten — til Kanalen, ikke til én selv
// ---------------------------------------------------------------------------

/**
 * De runde tal, der fejres.
 *
 * Lukket liste, ikke "hver femte". Over 20 er der ikke noget at hylde —
 * `full_bender` findes allerede ved netop 20 og har sin egen fejring i
 * appen, og en notifikation ved 45 ville være en anden slags besked end en
 * hyldest.
 */
export const MILEPAELE = [5, 10, 15, 20] as const;

/**
 * Den højeste milepæl, `genstande` har nået. `undefined` under den første.
 *
 * Tallet er VÆGTET som alt andet i appen — historiske rækker kan bære en
 * `sizeMultiplier` på 1,5 eller 2, og en fortrydelse er en negativ række.
 * Derfor `>=` mod hvert trin frem for at antage, at man rammer dem præcist.
 */
export function naaetMilepael(genstande: number): number | undefined {
  let hoejeste: number | undefined;
  for (const milepael of MILEPAELE) {
    if (genstande >= milepael) hoejeste = milepael;
  }
  return hoejeste;
}

/**
 * Skal Kanalen have besked — og om hvilken milepæl?
 *
 * ## Hvorfor der huskes en HØJESTE og ikke bare "sidst fejret"
 *
 * Totalen kan gå NED igen. En fortrydelse indsætter en negativ række, så en
 * bruger på 10 kan falde til 9 og logge sig op igen. Uden hukommelsen ville
 * det udløse "rundede 10" en gang til, og en Kanal kunne hyldes for det
 * samme tal hele aftenen ved at trykke log/fortryd.
 *
 * Derfor: kun når den nåede milepæl er HØJERE end den, der allerede er
 * fejret i dette run. Springer man fra 4 til 11 med en stor logning,
 * fejres 10 — den højeste, man faktisk har nået — og ikke både 5 og 10.
 * Én hyldest per logning.
 *
 * ## Hvorfor det er runnet og ikke drikkedagen
 *
 * `full_bender` måles på runnet (`run_drinks`, threshold 20). Målte
 * hyldesten på drikkedagen, ville de to ramme 20 på hvert sit tidspunkt for
 * en, der har nulstillet sit run — og så ville appen se i stykker ud.
 */
export function beslutMilepael(input: {
  /** Vægtede genstande i runnet, EFTER den logning der udløste kaldet. */
  genstande: number;
  /** `users.fejretMilepael`, hvis den hører til dette run. */
  alleredeFejret: number | undefined;
}): number | undefined {
  const naaet = naaetMilepael(input.genstande);
  if (naaet === undefined) return undefined;
  if (input.alleredeFejret !== undefined && naaet <= input.alleredeFejret) {
    return undefined;
  }
  return naaet;
}

/**
 * Teksten til Kanalen.
 *
 * Navnet forrest, som i "Anders er ude i aften" — det er det, man læser på
 * en låst skærm. Titlen er Kanalens navn, så beskeden ligner de andre
 * kanalvarslinger frem for at komme fra ingen steder.
 */
export function milepaelsVarsling(
  navn: string,
  milepael: number,
): { titel: string; tekst: string } {
  const rent = navn.trim() || "Nogen";
  return {
    titel: rent,
    tekst:
      milepael >= 20
        ? `🥴 ${rent} har rundet ${milepael} genstande i aften. Full bender.`
        : `🍻 ${rent} har rundet ${milepael} genstande i aften`,
  };
}
