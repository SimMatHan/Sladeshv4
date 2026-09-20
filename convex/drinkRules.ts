import { getDrinkDayStart, isDrinkCategory } from "./constants";

/**
 * Hvad et "run" er, og hvordan logninger lægges sammen.
 *
 * Rene funktioner uden import fra `_generated`, så de kan afprøves af
 * scripts/logic-test.ts. Delt mellem scoreboard, promille og achievements —
 * de tre steder der ellers ville komme til at definere "det aktuelle run"
 * hver for sig.
 */

/** Den delmængde af en drinkLogs-række aggregeringen bruger. */
export type LogLite = {
  categoryId: string;
  variationName: string;
  sizeMultiplier?: number;
  timestamp: number;
  isReset?: boolean;
};

/**
 * Starten på det run brugeren er i gang med.
 *
 * Et run starter ved drikkedagens grænse (kl. 10:00) og starter FORFRA hver
 * gang brugeren nulstiller. `logs` skal dække mindst fra `dayStart`.
 *
 * BEVIDST AFVIGELSE fra det gamle repo: dér nulstillede `resetCurrentRun`
 * ved at gå tilbage og sætte `isReset: true` på alle logninger inden for de
 * seneste 24 timer — et vindue der hverken passede med drikkedagen eller med
 * det forrige run. Her ROERES gamle rækker ikke: nulstillingen er sin egen
 * række, og runnets start udledes af den seneste af dem. Det gør operationen
 * billig, historikken uforanderlig, og grænsen entydig.
 */
export function beregnRunStart(
  dayStart: number,
  logs: readonly { timestamp: number; isReset?: boolean }[],
): number {
  let start = dayStart;
  for (const log of logs) {
    if (log.isReset !== true) continue;
    if (log.timestamp > start) start = log.timestamp;
  }
  return start;
}

/**
 * Er brugeren "ude" i den drikkedag, der begynder ved `dayStart`?
 *
 * Det ene kriterium, fem steder bruger: hvem der står på stillingen, hvem der
 * kan ses på kortet, om ens position overhovedet gemmes, om aftenens første
 * genstand skal checke dig ind — og om Kanalen skal have besked om, at du er
 * gået ud. Den sidste er grunden til, at `logDrink` og `checkIn` ikke længere
 * skriver betingelsen ud i hånden hver for sig.
 *
 * Siden trin 1 checker `logDrink` selv brugeren ind ved første genstand, så
 * "har drukket i dag" medfører "checket ind i dag". Derfor er markeringen
 * alene nok — bortset fra i scoreboardet, som beholder et ekstra tjek på
 * logninger som sikkerhedsnet for rækker skrevet før den regel fandtes.
 */
export function erUdeIDag(
  bruger: { checkInStatus?: boolean; lastCheckIn?: number },
  dayStart: number,
): boolean {
  return (
    bruger.checkInStatus === true &&
    bruger.lastCheckIn !== undefined &&
    bruger.lastCheckIn >= dayStart
  );
}

/** Sammenlagte tal for et sæt logninger. */
export type Aggregat = {
  /** Vægtet antal genstande på tværs af alle drikkekategorier. */
  genstande: number;
  /** Vægtet antal per kategori-id, fx `beer`. */
  perKategori: Record<string, number>;
  /** Vægtet antal per `kategori::variant`, fx `other::Cigaret`. */
  perVariant: Record<string, number>;
};

/**
 * Nøglen i `perVariant`. Kategori og variantnavn slås sammen, fordi det
 * samme variantnavn kan optræde i flere kategorier.
 */
export function variantNoegle(categoryId: string, variationName: string): string {
  return `${categoryId}::${variationName}`;
}

/**
 * Lægger logninger sammen.
 *
 * Alt vægtes med `sizeMultiplier`, præcis som det gamle repos
 * `drinkVariations`/`allTimeDrinkVariations`: en stor øl tæller som 2. Rækker
 * uden størrelse (fx en cigaret) har ingen multiplier og tæller som 1.
 *
 * Fortrydelser bærer en NEGATIV multiplier og trækker derfor sig selv fra —
 * både fra totalen, fra kategorien og fra varianten. Nulstillings-rækker
 * tælles ikke med; de er markører, ikke genstande.
 *
 * `genstande` tæller kun rigtige drikkevarer, mens `perKategori` og
 * `perVariant` også rummer fx `other`. Det er med vilje: "20 genstande i ét
 * run" må ikke kunne opnås med cigaretter, men "5 cigaretter på én dag" skal
 * kunne tælles.
 */
export function byggAggregat(logs: readonly LogLite[]): Aggregat {
  const aggregat: Aggregat = {
    genstande: 0,
    perKategori: {},
    perVariant: {},
  };

  for (const log of logs) {
    if (log.isReset === true) continue;

    const vaegt = log.sizeMultiplier ?? 1;
    const noegle = variantNoegle(log.categoryId, log.variationName);

    aggregat.perKategori[log.categoryId] =
      (aggregat.perKategori[log.categoryId] ?? 0) + vaegt;
    aggregat.perVariant[noegle] = (aggregat.perVariant[noegle] ?? 0) + vaegt;

    if (isDrinkCategory(log.categoryId)) {
      aggregat.genstande += vaegt;
    }
  }

  return aggregat;
}

/**
 * Hvor meget af en bestemt variant der står tilbage, når fortrydelser er
 * trukket fra. Bruges af `removeDrink` til at nægte at fortryde noget der
 * ikke er der.
 */
export function nettoForVariant(
  aggregat: Aggregat,
  categoryId: string,
  variationName: string,
): number {
  return aggregat.perVariant[variantNoegle(categoryId, variationName)] ?? 0;
}

/**
 * Den vaadeste aften nogensinde — hvor mange, og hvornaar.
 *
 * ## Hvorfor den regnes og ikke gemmes
 *
 * Et `users.bedsteAften`-felt, opdateret ved hver logning, ville vaere
 * billigere at laese og forkert at vedligeholde: fortryder man en logning,
 * skal rekorden kunne GAA NED igen, og det kan et maksimum-felt ikke uden
 * at scanne det hele alligevel. Appen har allerede vaeret igennem netop
 * den faelde med milepaelsvarslingen, hvor svaret blev "husk det hoejeste,
 * der er naaet" — det er rigtigt for en fejring, man ikke kan tage
 * tilbage, og forkert for et tal, der paastaar at vaere sandt.
 *
 * Her er tallet en paastand om, hvad der faktisk staar i historikken. Saa
 * skal den regnes af historikken.
 *
 * ## Samme optaellingsregel som alle andre steder
 *
 * Nulstillinger springes over, kun drikkevarer taeller, og vaegten er
 * `sizeMultiplier ?? 1` — negativ paa en fortrydelses modpost, saa en
 * fortrudt genstand traekker sig selv fra igen. Identisk med
 * `getKanalHistorik` og `byggAggregat`; det er derfor, den ligger her
 * blandt de andre rene regler frem for inde i en query.
 *
 * ## Doegnet er drikkedagen
 *
 * Kl. 10 til kl. 10, ikke midnat — `getDrinkDayStart`. "En aften/nat" er
 * praecis dét: klokken tre om natten hoerer til aftenen foer, og en
 * rekord, der knaekkede ved midnat, ville dele enhver god aften i to.
 */
export function bedsteDrikkedag(
  logs: readonly LogLite[],
): { dayStart: number; genstande: number } | undefined {
  const perDag = new Map<number, number>();

  for (const log of logs) {
    if (log.isReset === true) continue;
    if (!isDrinkCategory(log.categoryId)) continue;

    const dag = getDrinkDayStart(log.timestamp);
    perDag.set(dag, (perDag.get(dag) ?? 0) + (log.sizeMultiplier ?? 1));
  }

  let bedste: { dayStart: number; genstande: number } | undefined;
  for (const [dayStart, sum] of perDag) {
    // `>` og ikke `>=`: staar to aftener lige, vinder den AELDSTE. Samme
    // afgoerelse som stillingen traeffer ved lige antal, og den rigtige
    // her af en anden grund: rekorden blev sat dengang.
    if (bedste === undefined || sum > bedste.genstande) {
      bedste = { dayStart, genstande: sum };
    }
  }

  // En dag kan lande paa nul eller derunder, hvis alt i den er fortrudt.
  // Det er ikke en rekord, det er en aften der blev taget tilbage.
  if (bedste === undefined || bedste.genstande <= 0) return undefined;

  // Undgaar flydende-komma-stoej som 3.0000000000000004, praecis som
  // historikken. De vaegtede, historiske raekker kan give decimaler.
  return { dayStart: bedste.dayStart, genstande: Number(bedste.genstande.toFixed(2)) };
}

