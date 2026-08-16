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

/** Placeholder-promille per genstand — overtaget fra useLeaderboard.ts. */
export const PROMILLE_PER_DRINK = 0.18;

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
  /** Millisekunder siden lokal midnat. */
  msSinceLocalMidnight: number;
  /** Epoch ms for lokal midnat. */
  localMidnight: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hour12: false,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(now));

  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  // `hour: "numeric"` med hour12:false giver 24 for midnat i nogle runtimes.
  const hour = get("hour") % 24;
  const minute = get("minute");
  const second = get("second");

  const msSinceLocalMidnight =
    ((hour * 60 + minute) * 60 + second) * 1000 + (now % 1000);

  return {
    hour,
    minute,
    second,
    msSinceLocalMidnight,
    localMidnight: now - msSinceLocalMidnight,
  };
}

/**
 * Starten på den drikkedag som `now` (epoch ms) falder i.
 *
 * Drikkedagen løber fra kl. 10:00 dansk tid til kl. 10:00 næste dag. Er
 * klokken før 10:00, hører tidspunktet til gårsdagens drikkedag.
 */
export function getDrinkDayStart(now: number): number {
  const { localMidnight } = localWallClock(now);
  const boundary = localMidnight + DRINK_DAY_START_HOUR * 60 * 60 * 1000;

  // Før kl. 10:00 hører vi stadig til gårsdagens drikkedag.
  return now >= boundary ? boundary : boundary - 24 * 60 * 60 * 1000;
}
