import { isDrinkCategory } from "./constants";

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
 * Det ene kriterium, tre steder bruger: hvem der står på stillingen, hvem der
 * kan ses på kortet, og om ens position overhovedet gemmes.
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
