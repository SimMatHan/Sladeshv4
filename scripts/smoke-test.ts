/**
 * Smoke-test mod dev-deploymentet, autentificeret med Firebase.
 *
 * Kør:
 *   npx convex dev --once          # sørg for at seneste kode er deployet
 *   npm run smoke-test
 *
 * Der kræves INGEN manuel opsætning. Scriptet bruger to faste testkonti og
 * OPRETTER dem i Firebase Auth første gang, hvis de ikke findes. Kontiene
 * genbruges derefter.
 *
 *   smoke-test+a@sladeshapp.dk
 *   smoke-test+b@sladeshapp.dk
 *
 * Der skal to konti til, fordi adgangskontrollen mellem brugere ikke kan
 * afprøves med én: bruger B skal forsøge at læse bruger A's Kanal og blive
 * afvist.
 *
 * Vil man overstyre, kan SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD og
 * SMOKE_TEST_EMAIL_2 / SMOKE_TEST_PASSWORD_2 sættes i .env.local. Emailen
 * SKAL starte med "smoke-test+", ellers nægter oprydningsmutationen at slette
 * noget. Brug aldrig en rigtig brugerkonto.
 *
 * Firebase-kontiene bliver liggende efter testen — kun Convex-data ryddes op.
 * Det er med vilje, så de kan genbruges. Slet dem i Firebase Console hvis du
 * vil af med dem.
 *
 * Der logges ind via Firebase Auth REST-API'et frem for browser-SDK'et — det
 * giver det samme ID-token, uden at scriptet skal simulere et browsermiljø.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";

const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL;
const apiKey = process.env.VITE_FIREBASE_API_KEY;

/**
 * Faste testkonti. Adgangskoden er ikke en hemmelighed — kontiene oprettes af
 * dette script i dit eget Firebase-projekt, indeholder kun testdata, og er
 * spærret til "smoke-test+"-præfikset af oprydningsmutationen.
 */
const STANDARD_PASSWORD = "smoke-test-kodeord-1234";

const accounts = [
  {
    email: process.env.SMOKE_TEST_EMAIL ?? "smoke-test+a@sladeshapp.dk",
    password: process.env.SMOKE_TEST_PASSWORD ?? STANDARD_PASSWORD,
  },
  {
    email: process.env.SMOKE_TEST_EMAIL_2 ?? "smoke-test+b@sladeshapp.dk",
    password: process.env.SMOKE_TEST_PASSWORD_2 ?? STANDARD_PASSWORD,
  },
];

const missing = Object.entries({
  VITE_CONVEX_URL: convexUrl,
  VITE_FIREBASE_API_KEY: apiKey,
})
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(
    `[Smoke] mangler: ${missing.join(", ")}\n` +
      `  VITE_CONVEX_URL skrives af \`npx convex dev\` til .env.local.\n` +
      `  VITE_FIREBASE_API_KEY skal stå i .env eller .env.local.`,
  );
  process.exit(1);
}

for (const { email } of accounts) {
  if (!email.startsWith("smoke-test+")) {
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

type FirebaseKonto = { idToken: string; localId: string };

/** Rå kald til Firebase Auth REST. */
async function identityToolkit(
  metode: "signInWithPassword" | "signUp",
  mail: string,
  pass: string,
): Promise<{ ok: boolean; body: FirebaseSvar }> {
  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:${metode}?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: mail, password: pass, returnSecureToken: true }),
  });

  return { ok: response.ok, body: (await response.json()) as FirebaseSvar };
}

type FirebaseSvar = {
  idToken?: string;
  localId?: string;
  error?: { message?: string };
};

/**
 * Logger ind — og opretter kontoen først, hvis den ikke findes.
 *
 * Det fjerner et manuelt opsætningstrin: testkontiene behøver ikke være
 * oprettet i Firebase Console på forhånd. Første kørsel opretter dem,
 * efterfølgende kørsler genbruger dem.
 *
 * Firebase svarer forskelligt på en ukendt konto afhængigt af om
 * "email enumeration protection" er slået til: enten EMAIL_NOT_FOUND eller
 * det generiske INVALID_LOGIN_CREDENTIALS. Begge behandles som "prøv at
 * oprette", og hvis oprettelsen så siger EMAIL_EXISTS, var det i
 * virkeligheden en forkert adgangskode.
 */
async function firebaseSignInOrCreate(
  mail: string,
  pass: string,
): Promise<FirebaseKonto> {
  const login = await identityToolkit("signInWithPassword", mail, pass);
  if (login.ok && login.body.idToken) {
    return { idToken: login.body.idToken, localId: login.body.localId! };
  }

  const loginFejl = login.body.error?.message ?? "UKENDT_FEJL";
  const kontoFindesMåskeIkke =
    loginFejl.startsWith("EMAIL_NOT_FOUND") ||
    loginFejl.startsWith("INVALID_LOGIN_CREDENTIALS") ||
    loginFejl.startsWith("INVALID_PASSWORD");

  if (!kontoFindesMåskeIkke) {
    throw new Error(`Firebase-login fejlede for ${mail}: ${loginFejl}`);
  }

  console.log(`  opretter testkonto ${mail} …`);
  const oprettelse = await identityToolkit("signUp", mail, pass);

  if (oprettelse.ok && oprettelse.body.idToken) {
    return {
      idToken: oprettelse.body.idToken,
      localId: oprettelse.body.localId!,
    };
  }

  const oprettelseFejl = oprettelse.body.error?.message ?? "UKENDT_FEJL";

  if (oprettelseFejl.startsWith("EMAIL_EXISTS")) {
    throw new Error(
      `Testkontoen ${mail} findes allerede, men adgangskoden passer ikke. ` +
        `Sæt SMOKE_TEST_PASSWORD i .env.local til den rigtige, eller slet ` +
        `kontoen i Firebase Console og kør igen.`,
    );
  }

  if (oprettelseFejl.startsWith("OPERATION_NOT_ALLOWED")) {
    throw new Error(
      `Email/adgangskode-login er ikke slået til i Firebase-projektet. ` +
        `Slå det til under Authentication → Sign-in method.`,
    );
  }

  throw new Error(
    `Kunne ikke oprette testkontoen ${mail}: ${oprettelseFejl}`,
  );
}

/**
 * Uploader et lille testbillede til Convex storage og returnerer id'et.
 *
 * Convex-flowet er: mutation giver en engangs-URL, klienten POSTer bytes
 * direkte dertil, og svaret indeholder storage-id'et.
 */
async function uploadTestbillede(
  klient: ConvexHttpClient,
): Promise<Id<"_storage">> {
  const uploadUrl = await klient.mutation(api.sladesh.genererUploadUrl, {});

  // Mindst mulige gyldige JPEG-header — indholdet er uden betydning her.
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

  const svar = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: bytes,
  });

  if (!svar.ok) {
    throw new Error(`Upload til Convex storage fejlede: ${svar.status}`);
  }

  const { storageId } = (await svar.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

async function main(): Promise<void> {
  console.log(`[Smoke] kører mod ${convexUrl}`);

  // 0. Login -------------------------------------------------------------
  console.log("\n[Smoke] 0/7 logger begge testkonti ind via Firebase (oprettes hvis de mangler)");
  const a = await firebaseSignInOrCreate(accounts[0].email, accounts[0].password);
  const b = await firebaseSignInOrCreate(accounts[1].email, accounts[1].password);
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
    check("email fra token", me?.email, accounts[0].email.toLowerCase());

    const igen = await klientA.mutation(api.users.createUser, {});
    check("createUser er idempotent", igen, userIdA);

    // 2. Uautentificeret adgang ------------------------------------------
    console.log("\n[Smoke] 2/7 verificerer at uautentificerede kald ikke slipper igennem");
    await checkRejected("anonym createUser", () =>
      anonym.mutation(api.users.createUser, {}),
    );
    await checkRejected("anonym logDrink", () =>
      anonym.mutation(api.drinkLogs.logDrink, {
        categoryId: "beer",
        variationName: "Tuborg",
      }),
    );
    // `getMe` kaster bevidst IKKE uden login — den svarer null.
    // Frontenden kalder den på hver render for at afgøre om login-skærmen
    // eller profilen skal vises, også mens man er logget ud og mens Convex
    // stadig er ved at verificere tokenet. Kastede den, ville login-skærmen
    // fejle i stedet for at blive vist. Sikkerhedsegenskaben er derfor ikke
    // "afvis kaldet", men "udlever ingen data".
    check(
      "anonym getMe udleverer ingen data",
      await anonym.query(api.users.getMe, {}),
      null,
    );
    check(
      "anonym hasProfile udleverer ingen data",
      await anonym.query(api.users.hasProfile, {}),
      false,
    );

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

    // 8. Sladesh-livscyklus ----------------------------------------------
    // B er nu medlem af A's Kanal, så A må sende til B.
    console.log("\n[Smoke] 8/8 Sladesh-livscyklussen");

    await checkRejected("A sender Sladesh til sig selv", () =>
      klientA.mutation(api.sladesh.sendSladesh, {
        recipientId: userIdA,
        idempotencyKey: crypto.randomUUID(),
      }),
    );

    const cooldownFoer = await klientA.query(api.sladesh.getCooldown, {});
    check("A må sende inden første Sladesh", cooldownFoer.canSend, true);

    const noegle = crypto.randomUUID();
    const userIdB = (await klientB.query(api.users.getMe, {}))!._id;
    const challengeId = await klientA.mutation(api.sladesh.sendSladesh, {
      recipientId: userIdB,
      channelId,
      idempotencyKey: noegle,
      venue: "Brøndby Stadion",
    });
    console.log(`  udfordring: ${challengeId}`);

    // Samme nøgle igen må ikke lave en dublet — det var fejlen i det gamle repo.
    const igenSamme = await klientA.mutation(api.sladesh.sendSladesh, {
      recipientId: userIdB,
      channelId,
      idempotencyKey: noegle,
    });
    check("samme idempotencyKey → samme udfordring", igenSamme, challengeId);

    const cooldownEfter = await klientA.query(api.sladesh.getCooldown, {});
    check("A er i cooldown efter afsendelse", cooldownEfter.canSend, false);
    check("cooldown har en sluttid", cooldownEfter.msTilNaesteBlok > 0, true);

    await checkRejected("A sender igen i samme blok", () =>
      klientA.mutation(api.sladesh.sendSladesh, {
        recipientId: userIdB,
        channelId,
        idempotencyKey: crypto.randomUUID(),
      }),
    );

    const aktivB = await klientB.query(api.sladesh.getActiveSladeshForUser, {});
    check("B ser sin aktive udfordring", aktivB?._id, challengeId);
    check("status starter som pending", aktivB?.status, "pending");
    check("navne er snapshottet", aktivB?.recipientName, "Smoke Tester B");

    // Kun modtageren må rykke faserne frem.
    await checkRejected("A (afsender) rykker fase frem", () =>
      klientA.mutation(api.sladesh.registrerBevis, {
        challengeId,
        phase: "awaiting_filled",
      }),
    );

    await klientB.mutation(api.sladesh.registrerBevis, {
      challengeId,
      phase: "awaiting_filled",
    });

    // Baglæns er ikke tilladt.
    await checkRejected("B går baglæns i faserne", () =>
      klientB.mutation(api.sladesh.registrerBevis, {
        challengeId,
        phase: "awaiting_filled",
      }),
    );

    // Bevisbillede op i Convex storage.
    const storageIdFyldt = await uploadTestbillede(klientB);
    await klientB.mutation(api.sladesh.registrerBevis, {
      challengeId,
      phase: "filled_captured",
      storageId: storageIdFyldt,
    });

    let udfordring = await klientB.query(api.sladesh.getActiveSladeshForUser, {});
    check("status blev in_progress", udfordring?.status, "in_progress");
    check("bevisbillede gemt", udfordring?.proofBeforeImage, storageIdFyldt);
    check("filledCapturedAt sat", typeof udfordring?.filledCapturedAt, "number");

    // Man kan ikke gennemføre før begge beviser er der.
    await checkRejected("gennemfør for tidligt", () =>
      klientB.mutation(api.sladesh.afslutSladesh, { challengeId }),
    );

    await klientB.mutation(api.sladesh.registrerBevis, {
      challengeId,
      phase: "awaiting_empty",
    });
    const storageIdTom = await uploadTestbillede(klientB);
    await klientB.mutation(api.sladesh.registrerBevis, {
      challengeId,
      phase: "empty_captured",
      storageId: storageIdTom,
    });

    await klientB.mutation(api.sladesh.afslutSladesh, { challengeId });

    const efter = await klientB.query(api.users.getMe, {});
    check("B har gennemført 1", efter?.sladeshCompletedCount, 1);
    check("B har modtaget 1", efter?.sladeshReceived, 1);
    const afsenderEfter = await klientA.query(api.users.getMe, {});
    check("A har sendt 1", afsenderEfter?.sladeshSent, 1);

    check(
      "ingen aktiv udfordring efter gennemførsel",
      await klientB.query(api.sladesh.getActiveSladeshForUser, {}),
      null,
    );

    await checkRejected("gennemfør en afsluttet udfordring igen", () =>
      klientB.mutation(api.sladesh.afslutSladesh, { challengeId }),
    );
    await checkRejected("opgiv en afsluttet udfordring", () =>
      klientB.mutation(api.sladesh.opgivSladesh, { challengeId }),
    );
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
