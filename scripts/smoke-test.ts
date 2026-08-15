/**
 * Smoke-test mod dev-deploymentet, autentificeret med Firebase.
 *
 * Kør:
 *   npx convex dev --once          # sørg for at seneste kode er deployet
 *   npm run smoke-test
 *
 * Kræver i .env.local (ud over Convex- og Firebase-værdierne) TO dedikerede
 * testkonti i Firebase Auth:
 *
 *   SMOKE_TEST_EMAIL       SMOKE_TEST_PASSWORD
 *   SMOKE_TEST_EMAIL_2     SMOKE_TEST_PASSWORD_2
 *
 * Der skal to konti til, fordi adgangskontrollen mellem brugere ikke kan
 * afprøves med én: bruger B skal forsøge at læse bruger A's Kanal og blive
 * afvist. Begge emails SKAL starte med "smoke-test+", ellers nægter
 * oprydningsmutationen at slette noget. Brug aldrig rigtige brugerkonti.
 *
 * Der logges ind via Firebase Auth REST-API'et frem for browser-SDK'et — det
 * giver det samme ID-token, uden at scriptet skal simulere et browsermiljø.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";

const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL;
const apiKey = process.env.VITE_FIREBASE_API_KEY;

const accounts = [
  { email: process.env.SMOKE_TEST_EMAIL, password: process.env.SMOKE_TEST_PASSWORD },
  { email: process.env.SMOKE_TEST_EMAIL_2, password: process.env.SMOKE_TEST_PASSWORD_2 },
];

const missing = Object.entries({
  VITE_CONVEX_URL: convexUrl,
  VITE_FIREBASE_API_KEY: apiKey,
  SMOKE_TEST_EMAIL: accounts[0].email,
  SMOKE_TEST_PASSWORD: accounts[0].password,
  SMOKE_TEST_EMAIL_2: accounts[1].email,
  SMOKE_TEST_PASSWORD_2: accounts[1].password,
})
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(`[Smoke] mangler i .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

for (const { email } of accounts) {
  if (!email!.startsWith("smoke-test+")) {
    console.error(
      `[Smoke] testkonti skal have en email der starter med "smoke-test+" — ` +
        `ellers kan oprydningen ikke køre. Fik: ${email}`,
    );
    process.exit(1);
  }
}

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✓ ${label}: ${JSON.stringify(actual)}`);
  } else {
    failures++;
    console.error(
      `  ✗ ${label}: forventede ${JSON.stringify(expected)}, fik ${JSON.stringify(actual)}`,
    );
  }
}

/** Kører `fn` og bekræfter at den bliver afvist. */
async function checkRejected(
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    failures++;
    console.error(`  ✗ ${label}: forventede en afvisning, men kaldet lykkedes`);
  } catch {
    console.log(`  ✓ ${label}: afvist`);
  }
}

/** Logger ind via Firebase Auth REST og returnerer et ID-token. */
async function firebaseSignIn(
  mail: string,
  pass: string,
): Promise<{ idToken: string; localId: string }> {
  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: mail, password: pass, returnSecureToken: true }),
  });

  const body = (await response.json()) as {
    idToken?: string;
    localId?: string;
    error?: { message?: string };
  };

  if (!response.ok || !body.idToken) {
    throw new Error(
      `Firebase-login fejlede for ${mail}: ${body.error?.message ?? response.statusText}. ` +
        `Opret testkontoen i Firebase Console først.`,
    );
  }

  return { idToken: body.idToken, localId: body.localId! };
}

async function main(): Promise<void> {
  console.log(`[Smoke] kører mod ${convexUrl}`);

  // 0. Login -------------------------------------------------------------
  console.log("\n[Smoke] 0/7 logger begge testkonti ind via Firebase");
  const a = await firebaseSignIn(accounts[0].email!, accounts[0].password!);
  const b = await firebaseSignIn(accounts[1].email!, accounts[1].password!);
  console.log(`  A: ${a.localId}`);
  console.log(`  B: ${b.localId}`);

  const klientA = new ConvexHttpClient(convexUrl!);
  klientA.setAuth(a.idToken);
  const klientB = new ConvexHttpClient(convexUrl!);
  klientB.setAuth(b.idToken);

  // Uden token — bekræfter at intet er åbent.
  const anonym = new ConvexHttpClient(convexUrl!);

  let channelId: Id<"kanaler"> | undefined;

  try {
    // 1. Profiler --------------------------------------------------------
    console.log("\n[Smoke] 1/7 opretter profiler");
    const userIdA = await klientA.mutation(api.users.createUser, {
      displayName: "Smoke Tester",
      emoji: "🍺",
      profileEmoji: "🚀",
    });
    await klientB.mutation(api.users.createUser, { displayName: "Smoke Tester B" });
    console.log(`  A-profil: ${userIdA}`);

    const me = await klientA.query(api.users.getMe, {});
    check("authId = Firebase UID", me?.authId, a.localId);
    check("email fra token", me?.email, accounts[0].email!.toLowerCase());

    const igen = await klientA.mutation(api.users.createUser, {});
    check("createUser er idempotent", igen, userIdA);

    // 2. Uautentificeret adgang ------------------------------------------
    console.log("\n[Smoke] 2/7 verificerer at uautentificerede kald afvises");
    await checkRejected("anonym createUser", () =>
      anonym.mutation(api.users.createUser, {}),
    );
    await checkRejected("anonym logDrink", () =>
      anonym.mutation(api.drinkLogs.logDrink, {
        categoryId: "beer",
        variationName: "Tuborg",
      }),
    );
    await checkRejected("anonym getMe", () => anonym.query(api.users.getMe, {}));

    // 3. Kanal -----------------------------------------------------------
    console.log("\n[Smoke] 3/7 opretter Kanal");
    const code = `SMOKE-${Date.now()}`;
    channelId = await klientA.mutation(api.kanaler.createKanal, {
      name: "Ballade",
      code,
    });
    console.log(`  kanal: ${channelId}`);

    await checkRejected("dubletkode afvist", () =>
      klientA.mutation(api.kanaler.createKanal, { name: "Dublet", code }),
    );

    const kanal = await klientA.query(api.kanaler.getKanal, { channelId });
    check("kanalnavn bevaret ordret", kanal?.name, "Ballade");
    check("isDefault kan ikke sættes af klienten", kanal?.isDefault, false);

    await klientA.mutation(api.users.setActiveChannel, { channelId });

    // 4. Adgangskontrol mellem brugere -----------------------------------
    // Kernen i fase 3: B er logget ind, men er IKKE medlem af A's Kanal.
    console.log("\n[Smoke] 4/7 verificerer adgangskontrol mellem brugere");
    await checkRejected("B læser A's scoreboard", () =>
      klientB.query(api.scoreboard.getScoreboard, { channelId: channelId! }),
    );
    await checkRejected("B logger drink i A's Kanal", () =>
      klientB.mutation(api.drinkLogs.logDrink, {
        channelId: channelId!,
        categoryId: "beer",
        variationName: "Tuborg",
      }),
    );
    await checkRejected("B læser A's Kanal", () =>
      klientB.query(api.kanaler.getKanal, { channelId: channelId! }),
    );
    await checkRejected("B læser A's profil (ingen delt Kanal)", () =>
      klientB.query(api.users.getUser, { userId: userIdA }),
    );
    await checkRejected("B læser A's drikkelogninger", () =>
      klientB.query(api.drinkLogs.getDrinkLogsForUser, { userId: userIdA }),
    );

    // 5. Check In --------------------------------------------------------
    console.log("\n[Smoke] 5/7 logger Check In");
    await klientA.mutation(api.checkIns.checkIn, {
      venue: "Brøndby Stadion",
      channelId,
      location: { lat: 55.6533, lng: 12.4194 },
    });

    let profil = await klientA.query(api.users.getMe, {});
    check("checkInStatus", profil?.checkInStatus, true);
    check("lastCheckInVenue", profil?.lastCheckInVenue, "Brøndby Stadion");
    check("checkInCount", profil?.checkInCount, 1);

    // 6. Drinks ----------------------------------------------------------
    console.log("\n[Smoke] 6/7 logger to drinks");
    await klientA.mutation(api.drinkLogs.logDrink, {
      channelId,
      categoryId: "beer",
      variationName: "Tuborg",
      sizeId: "small",
    });
    await klientA.mutation(api.drinkLogs.logDrink, {
      channelId,
      categoryId: "beer",
      variationName: "Tuborg",
      sizeId: "large",
    });

    profil = await klientA.query(api.users.getMe, {});
    check("totalPoints (1.0 + 2.0)", profil?.totalPoints, 3);
    check("currentDayStreak", profil?.currentDayStreak, 1);
    check("longestStreak", profil?.longestStreak, 1);

    await klientA.mutation(api.drinkLogs.logDrink, {
      channelId,
      categoryId: "other",
      variationName: "Cigaret",
    });
    profil = await klientA.query(api.users.getMe, {});
    check("totalPoints uændret af cigaret", profil?.totalPoints, 3);
    check("stræk uændret af cigaret", profil?.currentDayStreak, 1);

    // 7. Scoreboard ------------------------------------------------------
    console.log("\n[Smoke] 7/7 henter scoreboard");
    const board = await klientA.query(api.scoreboard.getScoreboard, { channelId });
    check("antal rækker", board.length, 1);
    check("navn", board[0]?.name, "Smoke Tester");
    check("drinksToday (vægtet, uden cigaret)", board[0]?.drinksToday, 3);

    const active = await klientA.query(api.sladesh.getActiveSladeshForUser, {});
    check("ingen aktiv Sladesh", active, null);

    // B melder sig ind — nu MÅ B se stillingen.
    await klientB.mutation(api.kanaler.joinKanal, { code });
    const boardB = await klientB.query(api.scoreboard.getScoreboard, { channelId });
    check("B ser stillingen efter indmeldelse", boardB.length, 1);
  } finally {
    // Oprydning ----------------------------------------------------------
    console.log("\n[Smoke] rydder op");
    for (const [navn, klient] of [
      ["B", klientB],
      ["A", klientA],
    ] as const) {
      try {
        const { deleted } = await klient.mutation(api.testing.cleanupSmokeTest, {});
        console.log(`  ${navn}: slettet ${JSON.stringify(deleted)}`);
      } catch (error) {
        failures++;
        console.error(`  ✗ oprydning for ${navn} fejlede:`, error);
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
