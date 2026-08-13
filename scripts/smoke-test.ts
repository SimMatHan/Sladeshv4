/**
 * Smoke-test mod dev-deploymentet.
 *
 * Kør:
 *   npx convex dev --once          # sørg for at seneste kode er deployet
 *   npm run smoke-test
 *
 * Den kører hele kernevejen igennem — bruger → kanal → check in → to drinks
 * → scoreboard — verificerer resultaterne undervejs, og rydder ALTID op til
 * sidst, også hvis en assertion fejler.
 *
 * Al testdata bærer præfikset "smoke-test+" / "SMOKE-", som oprydnings-
 * mutationen kræver. Kør aldrig mod produktion.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";

const url = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL;
if (!url) {
  console.error(
    "[Smoke] VITE_CONVEX_URL mangler. Kør `npx convex dev` først — den " +
      "skriver .env.local — og start scriptet via `npm run smoke-test`.",
  );
  process.exit(1);
}

const client = new ConvexHttpClient(url);

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}: ${JSON.stringify(actual)}`);
  } else {
    failures++;
    console.error(
      `  ✗ ${label}: forventede ${JSON.stringify(expected)}, fik ${JSON.stringify(actual)}`,
    );
  }
}

async function main(): Promise<void> {
  const stamp = Date.now();
  const email = `smoke-test+${stamp}@sladeshapp.dk`;
  const code = `SMOKE-${stamp}`;

  let userId: Id<"users"> | undefined;
  let channelId: Id<"kanaler"> | undefined;

  try {
    console.log(`[Smoke] kører mod ${url}`);

    // 1. Opret testbruger --------------------------------------------------
    console.log("\n[Smoke] 1/6 opretter testbruger");
    userId = await client.mutation(api.users.createUser, {
      authId: `smoke-${stamp}`,
      email,
      displayName: "Smoke Tester",
      emoji: "🍺",
      profileEmoji: "🚀",
    });
    console.log(`  bruger: ${userId}`);

    // Unikhedstjekket skal afvise den samme email igen.
    let rejected = false;
    try {
      await client.mutation(api.users.createUser, {
        authId: `smoke-dublet-${stamp}`,
        email,
        displayName: "Dublet",
      });
    } catch {
      rejected = true;
    }
    check("dubletemail afvist", rejected, true);

    // 2. Opret og join kanal ----------------------------------------------
    console.log("\n[Smoke] 2/6 opretter Kanal");
    channelId = await client.mutation(api.kanaler.createKanal, {
      name: "Ballade",
      code,
      createdBy: userId,
    });
    console.log(`  kanal: ${channelId}`);

    let codeRejected = false;
    try {
      await client.mutation(api.kanaler.createKanal, {
        name: "Dublet",
        code,
        createdBy: userId,
      });
    } catch {
      codeRejected = true;
    }
    check("dubletkode afvist", codeRejected, true);

    // joinKanal er idempotent — opretteren er allerede medlem.
    await client.mutation(api.kanaler.joinKanal, { userId, code });
    const kanal = await client.query(api.kanaler.getKanal, { channelId });
    check("kanalnavn bevaret ordret", kanal?.name, "Ballade");
    check("medlemmer", kanal?.members.length, 1);

    await client.mutation(api.users.setActiveChannel, { userId, channelId });

    // 3. Check In ----------------------------------------------------------
    console.log("\n[Smoke] 3/6 logger Check In");
    await client.mutation(api.checkIns.checkIn, {
      userId,
      venue: "Brøndby Stadion",
      channelId,
      location: { lat: 55.6533, lng: 12.4194 },
    });

    let user = await client.query(api.users.getUser, { userId });
    check("checkInStatus", user?.checkInStatus, true);
    check("lastCheckInVenue", user?.lastCheckInVenue, "Brøndby Stadion");
    check("checkInCount", user?.checkInCount, 1);

    // 4. To drinks ---------------------------------------------------------
    console.log("\n[Smoke] 4/6 logger to drinks");

    // Lille øl → 1.0 point
    await client.mutation(api.drinkLogs.logDrink, {
      userId,
      channelId,
      categoryId: "beer",
      variationName: "Tuborg",
      sizeId: "small",
    });
    // Stor øl → 2.0 point
    await client.mutation(api.drinkLogs.logDrink, {
      userId,
      channelId,
      categoryId: "beer",
      variationName: "Tuborg",
      sizeId: "large",
    });

    user = await client.query(api.users.getUser, { userId });
    check("totalPoints (1.0 + 2.0)", user?.totalPoints, 3);
    // Begge drinks ligger i samme drikkedag → stræk står på 1.
    check("currentDayStreak", user?.currentDayStreak, 1);
    check("longestStreak", user?.longestStreak, 1);

    // En cigaret må hverken give point eller flytte stræk.
    await client.mutation(api.drinkLogs.logDrink, {
      userId,
      channelId,
      categoryId: "other",
      variationName: "Cigaret",
    });
    user = await client.query(api.users.getUser, { userId });
    check("totalPoints uændret af cigaret", user?.totalPoints, 3);
    check("stræk uændret af cigaret", user?.currentDayStreak, 1);

    // 5. Scoreboard --------------------------------------------------------
    console.log("\n[Smoke] 5/6 henter scoreboard");
    const board = await client.query(api.scoreboard.getScoreboard, {
      channelId,
    });
    check("antal rækker", board.length, 1);
    check("navn", board[0]?.name, "Smoke Tester");
    check("drinksToday (vægtet, uden cigaret)", board[0]?.drinksToday, 3);
    check("stræk på scoreboard", board[0]?.streak, 1);

    // Sladesh-query'en skal svare null uden aktiv udfordring.
    const active = await client.query(api.sladesh.getActiveSladeshForUser, {
      userId,
    });
    check("ingen aktiv Sladesh", active, null);
  } finally {
    // 6. Ryd op ------------------------------------------------------------
    console.log("\n[Smoke] 6/6 rydder op");
    if (userId !== undefined || channelId !== undefined) {
      try {
        const { deleted } = await client.mutation(
          api.testing.cleanupSmokeTest,
          { userId, channelId },
        );
        console.log(`  slettet: ${JSON.stringify(deleted)}`);
      } catch (error) {
        failures++;
        console.error("  ✗ oprydning fejlede:", error);
      }
    }
  }

  if (failures > 0) {
    console.error(`\n[Smoke] FEJLET — ${failures} assertion(s) slog fejl`);
    process.exit(1);
  }
  console.log("\n[Smoke] OK — alle assertions passerede");
}

main().catch((error) => {
  console.error("\n[Smoke] uventet fejl:", error);
  process.exit(1);
});
