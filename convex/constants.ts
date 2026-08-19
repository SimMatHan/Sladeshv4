/**
 * Forretningskonstanter delt mellem Convex-funktioner.
 * Værdierne er overtaget uændret fra det eksisterende Firebase-repo
 * (src/lib/drinkConstants.ts og src/lib/sladeshConstants.ts).
 */

/** Drikkedagen starter kl. 10:00 — ikke ved midnat. */
export const DRINK_DAY_START_HOUR = 10;

/**
 * Tidszone som drikkedagens 10:00-grænse regnes i.
 * Convex kører i UTC, så grænsen skal beregnes eksplicit i dansk tid.
 */
export const APP_TIME_ZONE = "Europe/Copenhagen";

/** Antal rækker scoreboardet returnerer. Samme som Firestore-queryens limit. */
export const SCOREBOARD_LIMIT = 50;

/** Drikkekategorier. `id` gemmes i drinkLogs.categoryId; `label` er dansk UI-tekst. */
export const DRINK_CATEGORIES = [
  { id: "beer", label: "Øl", emoji: "🍺", isDrink: true },
  { id: "cider", label: "Cider", emoji: "🍏", isDrink: true },
  { id: "wine", label: "Vin", emoji: "🍷", isDrink: true },
  { id: "cocktail", label: "Cocktails", emoji: "🍸", isDrink: true },
  { id: "shot", label: "Shots", emoji: "🥃", isDrink: true },
  { id: "other", label: "Andet", emoji: "🌀", isDrink: false },
] as const;

/** Kategorier der tæller som genstande (i modsætning til fx "Andet"). */
export const DRINK_CATEGORY_IDS: readonly string[] = DRINK_CATEGORIES.filter(
  (category) => category.isDrink,
).map((category) => category.id);

export function isDrinkCategory(categoryId: string): boolean {
  return DRINK_CATEGORY_IDS.includes(categoryId);
}

/**
 * Avatar-farver. Overtaget uændret fra AVATAR_COLORS i det gamle repos
 * src/contexts/AvatarContext.tsx.
 *
 * `name` er det der gemmes i `users.avatarColor`; gradienten hører til
 * præsentationen og står her, så navn og udtryk ikke kan komme fra hinanden.
 */
export const AVATAR_COLORS = [
  { name: "sunset", gradient: "from-orange-400 via-rose-400 to-pink-500" },
  { name: "ocean", gradient: "from-cyan-400 via-blue-500 to-indigo-600" },
  { name: "aurora", gradient: "from-emerald-400 via-cyan-400 to-blue-500" },
  { name: "berry", gradient: "from-purple-400 via-pink-500 to-rose-500" },
  { name: "gold", gradient: "from-amber-300 via-yellow-400 to-orange-400" },
  { name: "mint", gradient: "from-emerald-300 via-teal-400 to-cyan-500" },
  { name: "cosmic", gradient: "from-violet-500 via-purple-500 to-fuchsia-500" },
] as const;

export const AVATAR_COLOR_NAMES: readonly string[] = AVATAR_COLORS.map(
  (farve) => farve.name,
);

export function isAvatarColor(navn: string): boolean {
  return AVATAR_COLOR_NAMES.includes(navn);
}

/** Størrelser. Overtaget uændret fra src/lib/drinkSizes.ts. */
export const DRINK_SIZES = [
  { id: "small", label: "Lille", volumeLabel: "33cl", multiplier: 1.0 },
  { id: "medium", label: "Mellem", volumeLabel: "50cl", multiplier: 1.5 },
  { id: "large", label: "Stor", volumeLabel: "75cl", multiplier: 2.0 },
] as const;

export type DrinkSize = (typeof DRINK_SIZES)[number];

/** Default når intet er valgt: Lille (33cl), jf. DEFAULT_SIZE i det gamle repo. */
export const DEFAULT_SIZE: DrinkSize = DRINK_SIZES[0];

/**
 * Kun rigtige drikkevarer har en størrelse — "Andet" (fx Cigaret) har ingen.
 * Svarer til SIZE_SUPPORTED_CATEGORIES i det gamle repo.
 */
export function categorySupportsSize(categoryId: string): boolean {
  return isDrinkCategory(categoryId);
}

/**
 * Slår størrelsen op for en logning. Returnerer `undefined` for kategorier
 * uden størrelse, så felterne udelades helt frem for at få en misvisende
 * "Lille" på en cigaret. Ukendt `sizeId` falder tilbage til Lille.
 */
export function getSize(
  sizeId: string | undefined,
  categoryId: string,
): DrinkSize | undefined {
  if (!categorySupportsSize(categoryId)) return undefined;
  if (sizeId === undefined) return DEFAULT_SIZE;
  return DRINK_SIZES.find((size) => size.id === sizeId) ?? DEFAULT_SIZE;
}

/**
 * Vægurets tid i dansk lokaltid for et givet epoch-ms-tidspunkt.
 *
 * Convex kører i UTC, så enhver døgngrænse skal regnes eksplicit i
 * Europe/Copenhagen — ellers rammer den forkert halvdelen af året.
 * Delt mellem drikkedagens 10:00-grænse og Sladesh-cooldownens
 * 12-timers blokke, som er to FORSKELLIGE grænser.
 */
export function localWallClock(now: number): {
  hour: number;
  minute: number;
  second: number;
  /** Millisekunder siden lokal midnat. Kan være 23 eller 25 timer om året. */
  msSinceLocalMidnight: number;
  /** Epoch ms for lokal midnat. */
  localMidnight: number;
} {
  const { year, month, day, hour, minute, second } = lokalDele(now);
  const localMidnight = epochForLokalTid(year, month, day, 0);

  return {
    hour,
    minute,
    second,
    msSinceLocalMidnight: now - localMidnight,
    localMidnight,
  };
}

/**
 * Starten på den drikkedag som `now` (epoch ms) falder i.
 *
 * Drikkedagen løber fra kl. 10:00 dansk tid til kl. 10:00 næste dag. Er
 * klokken før 10:00, hører tidspunktet til gårsdagens drikkedag.
 */
export function getDrinkDayStart(now: number): number {
  const { year, month, day } = lokalDele(now);
  const iDag = epochForLokalTid(year, month, day, DRINK_DAY_START_HOUR);

  if (now >= iDag) return iDag;

  const igaar = forrigeKalenderdag(year, month, day);
  return epochForLokalTid(
    igaar.year,
    igaar.month,
    igaar.day,
    DRINK_DAY_START_HOUR,
  );
}

// ---------------------------------------------------------------------------
// Tidszone-regning
// ---------------------------------------------------------------------------
//
// Convex kører i UTC, så enhver døgngrænse skal regnes eksplicit i
// Europe/Copenhagen. Det lyder som et opslag, men er det ikke: to gange om
// året er et døgn 23 eller 25 timer langt.
//
// FEJLEN DER LÅ HER FØR: lokal midnat blev regnet som `now` minus den
// forløbne VÆGURSTID siden midnat. På et almindeligt døgn er de to ens, men
// natten til den sidste søndag i oktober er der gået 11 rigtige timer, når
// uret viser 10:00 — og grænsen skred en time. Kl. 09:00 den morgen svarede
// `getDrinkDayStart`, at drikkedagen begyndte kl. 11:00 dagen før. Det ramte
// alt, der hænger på grænsen: stillingen, stræk, promille og historikken.
//
// I stedet regnes nu den anden vej: fra en lokal DATO og et klokkeslæt til et
// tidspunkt. Så er svaret rigtigt, uanset hvor lang dagen var.

type LokaleDele = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const DELE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** Væguret i dansk tid, opdelt. */
function lokalDele(ms: number): LokaleDele {
  const dele = DELE_FORMAT.formatToParts(new Date(ms));

  const hent = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(dele.find((del) => del.type === type)?.value ?? "0");

  return {
    year: hent("year"),
    month: hent("month"),
    day: hent("day"),
    // `hour: "numeric"` med hour12:false giver 24 for midnat i nogle runtimes.
    hour: hent("hour") % 24,
    minute: hent("minute"),
    second: hent("second"),
  };
}

/** Tidszonens forskydning fra UTC på et givet tidspunkt, i millisekunder. */
function forskydningVed(ms: number): number {
  const d = lokalDele(ms);
  const somUtc = Date.UTC(d.year, d.month - 1, d.day, d.hour, d.minute, d.second);
  // Millisekunderne skæres væk begge steder, så de ikke forstyrrer.
  return somUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Epoch ms for et klokkeslæt på en lokal dato.
 *
 * Forskydningen afhænger af det tidspunkt, vi er ved at finde — derfor gættes
 * der én gang og rettes én gang. To omgange er nok: et gæt kan højst være én
 * time galt, og en time er aldrig nok til at flytte os over endnu et skifte.
 */
export function epochForLokalTid(
  year: number,
  month: number,
  day: number,
  hour: number,
): number {
  const oensket = Date.UTC(year, month - 1, day, hour);
  const gaet = oensket - forskydningVed(oensket);
  return oensket - forskydningVed(gaet);
}

/** Kalenderdagen før. Ren datoregning, uden tidszoner indblandet. */
function forrigeKalenderdag(
  year: number,
  month: number,
  day: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - 1);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/**
 * Drikkedagen før denne.
 *
 * Regnes ved at gå ét millisekund tilbage fra grænsen og spørge om, hvilken
 * drikkedag DET tidspunkt hører til — ikke ved at trække 24 timer fra.
 * Forskellen betyder noget to gange om året: ved sommertidsskiftet er der 23
 * eller 25 timer mellem to grænser, og et fast døgn ville skride en time og
 * derefter lægge to dage i samme kasse.
 */
export function forrigeDrikkedag(dayStart: number): number {
  return getDrinkDayStart(dayStart - 1);
}

/**
 * De seneste `antal` drikkedage, ældste først.
 *
 * Sidste element er den drikkedag, `now` selv ligger i.
 */
export function drikkedageBagud(now: number, antal: number): number[] {
  const dage: number[] = [];
  let dag = getDrinkDayStart(now);

  for (let i = 0; i < antal; i++) {
    dage.push(dag);
    dag = forrigeDrikkedag(dag);
  }

  return dage.reverse();
}
