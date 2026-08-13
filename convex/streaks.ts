import { getDrinkDayStart, isDrinkCategory } from "./constants";

/**
 * Stræk-logik.
 *
 * Rekonstrueret 1:1 fra det gamle repos `drinkService.ts` (linje 142-175),
 * som er det eneste sted stræk faktisk blev vedligeholdt.
 *
 * Reglerne, målt i DRIKKEDAGE (10:00-grænser), ikke kalenderdage:
 *
 *   ingen tidligere genstand  → stræk = 1        (første genstand nogensinde)
 *   daysDiff === 0            → stræk uændret    (samme drikkedag)
 *   daysDiff === 1            → stræk + 1        (næste drikkedag i træk)
 *   daysDiff >= 2             → stræk = 1        (hul → NULSTILLES til 1, ikke 0)
 *
 * hvor daysDiff = antal hele døgn mellem drikkedagsgrænsen for den forrige
 * genstand og grænsen for den nye.
 *
 * To detaljer der er nemme at overse, og som er bevaret bevidst:
 *
 * 1. Stræk opdateres KUN når der tilføjes en RIGTIG drikkevare. Kategorien
 *    "other" (Andet — fx Cigaret) rører ikke stræk. I det gamle repo var
 *    betingelsen `delta > 0 && !isNonDrink`.
 * 2. Et hul nulstiller til 1, ikke til 0 — den genstand der netop blev logget,
 *    starter selv en ny stræk.
 *
 * Bemærk at en drikkedag går fra kl. 10:00 til kl. 10:00. Drikker man kl. 02:00
 * natten til tirsdag, hører det til mandagens drikkedag.
 *
 * `longestStreak` fandtes ikke i den gamle logik (initialiseret til 0, aldrig
 * skrevet). Den udledes her som max(longestStreak, currentDayStreak).
 */

export type StreakInput = {
  /** Tidspunkt for den nye genstand (epoch ms). */
  now: number;
  /** Brugerens `lastDrinkAt` før denne genstand, hvis nogen. */
  lastDrinkAt: number | undefined;
  /** Brugerens `currentDayStreak` før denne genstand. */
  currentDayStreak: number | undefined;
  /** Brugerens `longestStreak` før denne genstand. */
  longestStreak: number | undefined;
  /** Kategorien for den nye genstand — afgør om stræk overhovedet røres. */
  categoryId: string;
};

export type StreakResult = {
  currentDayStreak: number;
  longestStreak: number;
  /** Drikkedagens start for den nye genstand — skrives til lastDrinkDayStart. */
  drinkDayStart: number;
  /** Om stræk blev rørt. False for ikke-drikkevarer. */
  changed: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeStreak(input: StreakInput): StreakResult {
  const { now, lastDrinkAt, categoryId } = input;
  const previousStreak = input.currentDayStreak ?? 0;
  const previousLongest = input.longestStreak ?? 0;
  const drinkDayStart = getDrinkDayStart(now);

  // Ikke-drikkevarer ("Andet") rører aldrig stræk — jf. `!isNonDrink`.
  if (!isDrinkCategory(categoryId)) {
    return {
      currentDayStreak: previousStreak,
      longestStreak: previousLongest,
      drinkDayStart,
      changed: false,
    };
  }

  let currentDayStreak: number;

  if (lastDrinkAt === undefined) {
    // Første genstand nogensinde.
    currentDayStreak = 1;
  } else {
    const previousBoundary = getDrinkDayStart(lastDrinkAt);
    const daysDiff = Math.floor((drinkDayStart - previousBoundary) / MS_PER_DAY);

    if (daysDiff === 0) {
      // Samme drikkedag — stræk er allerede talt for i dag.
      // Er den 0 (fx efter en nulstilling), starter denne genstand stræk på 1.
      currentDayStreak = previousStreak === 0 ? 1 : previousStreak;
    } else if (daysDiff === 1) {
      // Næste drikkedag i træk.
      currentDayStreak = previousStreak + 1;
    } else {
      // Hul i rækken — nulstil til 1, ikke 0.
      currentDayStreak = 1;
    }
  }

  return {
    currentDayStreak,
    longestStreak: Math.max(previousLongest, currentDayStreak),
    drinkDayStart,
    changed: true,
  };
}

/**
 * Point for én genstand.
 *
 * Der fandtes intet pointsystem i det gamle repo (`totalPoints` blev
 * initialiseret til 0 og aldrig skrevet). Aftalt konvention: 1 point per
 * genstand vægtet med størrelsen — Lille 1.0, Mellem 1.5, Stor 2.0 — og 0
 * point for ikke-drikkevarer. Samme vægtning som den gamle `totalDrinks`.
 */
export function pointsForDrink(
  categoryId: string,
  sizeMultiplier: number | undefined,
): number {
  if (!isDrinkCategory(categoryId)) return 0;
  return sizeMultiplier ?? 1;
}
