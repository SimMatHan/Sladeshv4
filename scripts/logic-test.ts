/**
 * Lokal logiktest af de rene funktioner — stræk, point og drikkedags-grænsen.
 *
 * Kører UDEN et Convex-deployment, så forretningsreglerne kan verificeres
 * isoleret og hurtigt. Databasedelen dækkes af scripts/smoke-test.ts, som
 * kræver et dev-deployment.
 *
 * Kør: npm run test:logic
 */

import { getDrinkDayStart, getSize } from "../convex/constants";
import { computeStreak, pointsForDrink } from "../convex/streaks";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(
      `  ✗ ${label}\n      forventede: ${JSON.stringify(expected)}\n      fik:        ${JSON.stringify(actual)}`,
    );
  }
}

/** Kobenhavnsk vægtid → epoch ms. August er CEST (UTC+2). */
function cest(iso: string): number {
  return Date.parse(`${iso}+02:00`);
}
/** Januar er CET (UTC+1). */
function cet(iso: string): number {
  return Date.parse(`${iso}+01:00`);
}

const DAY = 24 * 60 * 60 * 1000;

console.log("\n[Logic] drikkedagens grænse (10:00, Europe/Copenhagen)");
{
  // Kl. 11:00 hører til samme dags 10:00-grænse.
  check(
    "11:00 → samme dag kl. 10:00",
    getDrinkDayStart(cest("2026-08-13T11:00:00")),
    cest("2026-08-13T10:00:00"),
  );
  // Kl. 09:00 er FØR grænsen → gårsdagens drikkedag.
  check(
    "09:00 → gårsdagens kl. 10:00",
    getDrinkDayStart(cest("2026-08-13T09:00:00")),
    cest("2026-08-12T10:00:00"),
  );
  // Natten til torsdag kl. 02:00 hører stadig til onsdagens drikkedag.
  check(
    "02:00 → gårsdagens kl. 10:00",
    getDrinkDayStart(cest("2026-08-13T02:00:00")),
    cest("2026-08-12T10:00:00"),
  );
  // Præcis kl. 10:00 hører til den nye drikkedag.
  check(
    "10:00 præcis → samme dag",
    getDrinkDayStart(cest("2026-08-13T10:00:00")),
    cest("2026-08-13T10:00:00"),
  );
  // Vintertid (CET, UTC+1) skal også ramme 10:00 lokal tid.
  check(
    "vintertid 09:00 → gårsdagens kl. 10:00",
    getDrinkDayStart(cet("2026-01-15T09:00:00")),
    cet("2026-01-14T10:00:00"),
  );
}

console.log("\n[Logic] stræk");
{
  const base = {
    currentDayStreak: undefined,
    longestStreak: undefined,
    categoryId: "beer",
  };

  // Første genstand nogensinde.
  check(
    "første genstand → stræk 1",
    computeStreak({ ...base, now: cest("2026-08-13T12:00:00"), lastDrinkAt: undefined })
      .currentDayStreak,
    1,
  );

  // Samme drikkedag → uændret.
  check(
    "samme drikkedag → uændret",
    computeStreak({
      ...base,
      now: cest("2026-08-13T20:00:00"),
      lastDrinkAt: cest("2026-08-13T12:00:00"),
      currentDayStreak: 4,
    }).currentDayStreak,
    4,
  );

  // Næste drikkedag → +1.
  check(
    "næste drikkedag → +1",
    computeStreak({
      ...base,
      now: cest("2026-08-14T12:00:00"),
      lastDrinkAt: cest("2026-08-13T12:00:00"),
      currentDayStreak: 4,
    }).currentDayStreak,
    5,
  );

  // Sent om aftenen → tidligt næste morgen er STADIG samme drikkedag.
  check(
    "23:00 → 02:00 er samme drikkedag",
    computeStreak({
      ...base,
      now: cest("2026-08-14T02:00:00"),
      lastDrinkAt: cest("2026-08-13T23:00:00"),
      currentDayStreak: 4,
    }).currentDayStreak,
    4,
  );

  // Hul på to dage → nulstil til 1 (ikke 0).
  check(
    "hul på 2 dage → nulstil til 1",
    computeStreak({
      ...base,
      now: cest("2026-08-16T12:00:00"),
      lastDrinkAt: cest("2026-08-13T12:00:00"),
      currentDayStreak: 9,
    }).currentDayStreak,
    1,
  );

  // Ikke-drikkevare rører ikke stræk.
  const cigaret = computeStreak({
    now: cest("2026-08-14T12:00:00"),
    lastDrinkAt: cest("2026-08-13T12:00:00"),
    currentDayStreak: 4,
    longestStreak: 7,
    categoryId: "other",
  });
  check("cigaret → stræk uændret", cigaret.currentDayStreak, 4);
  check("cigaret → changed=false", cigaret.changed, false);
  check("cigaret → longestStreak uændret", cigaret.longestStreak, 7);

  // longestStreak følger med op, men falder aldrig.
  check(
    "longestStreak vokser",
    computeStreak({
      ...base,
      now: cest("2026-08-14T12:00:00"),
      lastDrinkAt: cest("2026-08-13T12:00:00"),
      currentDayStreak: 7,
      longestStreak: 7,
    }).longestStreak,
    8,
  );
  check(
    "longestStreak bevares efter nulstilling",
    computeStreak({
      ...base,
      now: cest("2026-08-20T12:00:00"),
      lastDrinkAt: cest("2026-08-13T12:00:00"),
      currentDayStreak: 9,
      longestStreak: 12,
    }).longestStreak,
    12,
  );

  // lastDrinkDayStart skrives med.
  check(
    "drinkDayStart sat",
    computeStreak({ ...base, now: cest("2026-08-13T23:00:00"), lastDrinkAt: undefined })
      .drinkDayStart,
    cest("2026-08-13T10:00:00"),
  );

  // En lang ubrudt række.
  let streak = 0;
  let last: number | undefined = undefined;
  let longest = 0;
  for (let day = 0; day < 5; day++) {
    const now = cest("2026-08-13T12:00:00") + day * DAY;
    const result = computeStreak({
      now,
      lastDrinkAt: last,
      currentDayStreak: streak,
      longestStreak: longest,
      categoryId: "beer",
    });
    streak = result.currentDayStreak;
    longest = result.longestStreak;
    last = now;
  }
  check("5 dage i træk → stræk 5", streak, 5);
}

console.log("\n[Logic] point og størrelser");
{
  check("lille øl → 1 point", pointsForDrink("beer", getSize("small", "beer")?.multiplier), 1);
  check("mellem øl → 1.5 point", pointsForDrink("beer", getSize("medium", "beer")?.multiplier), 1.5);
  check("stor øl → 2 point", pointsForDrink("beer", getSize("large", "beer")?.multiplier), 2);
  check("uden størrelse → 1 point (default Lille)", pointsForDrink("beer", getSize(undefined, "beer")?.multiplier), 1);
  check("cigaret → 0 point", pointsForDrink("other", getSize(undefined, "other")?.multiplier), 0);
  check("cigaret har ingen størrelse", getSize("large", "other"), undefined);
  check("ukendt størrelse falder tilbage til Lille", getSize("gigantisk", "beer")?.label, "Lille");
  check(
    "størrelsesnavne er danske",
    ["small", "medium", "large"].map((id) => getSize(id, "beer")?.label),
    ["Lille", "Mellem", "Stor"],
  );
}

console.log(
  `\n[Logic] ${passed} passerede, ${failed} fejlede\n`,
);
if (failed > 0) process.exit(1);
