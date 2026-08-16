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
 *
 * ADVARSEL, ny fra fase 7: beacon-afsnittet kalder evalueringen, og den ser
 * på ALLE aktive beacons i deploymentet — ikke kun testens egne. Beacons
 * ældre end 2 timer bliver slukket, og sidste kørsel bruger endda et `now`
 * tre timer frem. Det er den samme oprydning som cron-jobbet foretager af
 * sig selv hvert 5. minut, så virkningen er kun at den sker med det samme.
 * Kør alligevel aldrig scriptet mod produktion.
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

  // Spærren mod at ramme produktion. Deploymentet spørges FØR der oprettes
  // noget som helst, så en forkert VITE_CONVEX_URL koster en fejlbesked og
  // ikke to testbrugere i produktionsdatabasen.
  const status = await new ConvexHttpClient(convexUrl!).query(
    api.testing.testmiljoStatus,
    {},
  );
  if (!status.tilladt) {
    console.error(
      `[Smoke] AFBRUDT — deploymentet tillader ikke testfunktioner.\n` +
        `  ${convexUrl}\n` +
        `  Smoke-testen opretter brugere, sender beskeder og kører\n` +
        `  beacon-evalueringen. Den må kun ramme dev.\n\n` +
        `  Er dette rent faktisk dit dev-deployment, så åbn for det:\n` +
        `    npx convex env set TILLAD_TESTFUNKTIONER ja`,
    );
    process.exit(1);
  }

  // 0. Login -------------------------------------------------------------
  console.log("\n[Smoke] 0/11 logger begge testkonti ind via Firebase (oprettes hvis de mangler)");
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
    console.log("\n[Smoke] 1/11 opretter profiler");
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
    console.log("\n[Smoke] 2/11 verificerer at uautentificerede kald ikke slipper igennem");
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
    console.log("\n[Smoke] 3/11 opretter Kanal");
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
    console.log("\n[Smoke] 4/11 verificerer adgangskontrol mellem brugere");
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
    console.log("\n[Smoke] 5/11 logger Check In");
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
    console.log("\n[Smoke] 6/11 logger to drinks");
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
    console.log("\n[Smoke] 7/11 henter scoreboard");
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
    console.log("\n[Smoke] 8/11 Sladesh-livscyklussen");

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
    check("A kan IKKE sende igen (canSend)", cooldownEfter.canSend, false);
    check("A er blokeret (blocked)", cooldownEfter.blocked, true);
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

    // --- Udløb -----------------------------------------------------------
    // Den mest komplekse nye sti. Hovedflowet ovenfor gennemfører inden for
    // de 10 minutter, så `expired` sættes aldrig — og at vente på
    // scheduleren ville gøre testen upålidelig og langsom.
    //
    // I stedet sender B med et tilbagedateret `now`, så fristen allerede er
    // overskredet i samme øjeblik udfordringen findes. Enhver handling på
    // den udløser så oprydningen synkront.
    console.log("\n[Smoke] udløb (tilbagedateret frist)");

    const eluft = 11 * 60 * 1000; // ældre end fristen på 10 minutter
    const forGammel = Date.now() - eluft;

    // Baseline SKAL tages før afsendelsen.
    //
    // `ctx.scheduler.runAt()` med et fortidigt tidspunkt kører straks, så
    // `udloebSladesh` kan nå at lukke udfordringen, allerede inden dette
    // script får svar på næste kald. En assertion om at tælleren "endnu er
    // nul" efter afsendelsen er derfor ikke veldefineret — den afhænger af,
    // hvem der vinder kapløbet.
    //
    // Det er præcis den situation begge oprydningsveje er bygget til at
    // klare, og +1-kontrollen nedenfor beviser, at kun én af dem talte.
    const foerSend = await klientA.query(api.users.getMe, {});
    const fejledeFoer = foerSend?.sladeshFailedCount ?? 0;

    const udloebetId = await klientB.mutation(api.sladesh.sendSladesh, {
      recipientId: userIdA,
      channelId,
      idempotencyKey: crypto.randomUUID(),
      now: forGammel,
    });

    // A er modtager her. Ethvert forsøg på at rykke frem skal afvises —
    // enten fordi scheduleren allerede lukkede udfordringen, eller fordi
    // dette kald selv opdager at fristen er overskredet.
    await checkRejected("A rykker frem på en udløbet udfordring", () =>
      klientA.mutation(api.sladesh.registrerBevis, {
        challengeId: udloebetId,
        phase: "awaiting_filled",
      }),
    );

    const efterUdloeb = await klientA.query(api.users.getMe, {});
    check(
      "udløb tæller PRÆCIS én gang som fejlet",
      efterUdloeb?.sladeshFailedCount,
      fejledeFoer + 1,
    );
    check(
      "en udløbet udfordring er ikke længere aktiv",
      await klientA.query(api.sladesh.getActiveSladeshForUser, {}),
      null,
    );
    check(
      "B er heller ikke længere bundet",
      await klientB.query(api.sladesh.getActiveSladeshForUser, {}),
      null,
    );

    // 9. Chat -------------------------------------------------------------
    console.log("\n[Smoke] 9/11 kanal-chat");

    await checkRejected("tom besked afvist", () =>
      klientA.mutation(api.messages.sendMessage, { channelId: channelId!, text: "   " }),
    );
    await checkRejected("for lang besked afvist", () =>
      klientA.mutation(api.messages.sendMessage, {
        channelId: channelId!,
        text: "x".repeat(2001),
      }),
    );

    // En Kanal kun B er medlem af — så A's manglende adgang kan afprøves.
    const kodeB = `SMOKE-${Date.now()}-b`;
    const kanalKunB = await klientB.mutation(api.kanaler.createKanal, {
      name: "Kun B",
      code: kodeB,
    });
    await checkRejected("A skriver i en Kanal han ikke er medlem af", () =>
      klientA.mutation(api.messages.sendMessage, {
        channelId: kanalKunB,
        text: "Hej?",
      }),
    );
    await checkRejected("A læser beskederne i B's Kanal", () =>
      klientA.query(api.messages.getMessages, { channelId: kanalKunB }),
    );

    await klientA.mutation(api.messages.sendMessage, {
      channelId,
      text: "  Skål, Brøndby!  ",
    });
    const beskedId = await klientA.mutation(api.messages.sendMessage, {
      channelId,
      text: "Første omgang er min 🍺",
    });

    const beskeder = await klientA.query(api.messages.getMessages, { channelId });
    check("to beskeder i Kanalen", beskeder.length, 2);
    check("teksten er trimmet", beskeder[0]?.text, "Skål, Brøndby!");
    check("ældste besked står først", beskeder[1]?._id, beskedId);
    check("afsendernavn snapshottet", beskeder[0]?.senderName, "Smoke Tester");
    check("afsender-emoji snapshottet", beskeder[0]?.senderEmoji, "🚀");

    // Ulæst-status. B har ikke åbnet chatten endnu.
    const ulaesteB = await klientB.query(api.messages.getUlaeste, {});
    const kanalHosB = ulaesteB.find((r) => r.channelId === channelId);
    check("B har ulæste beskeder", kanalHosB?.ulaest, true);
    check("Kanalnavnet følger med", kanalHosB?.navn, "Ballade");

    const ulaesteA = await klientA.query(api.messages.getUlaeste, {});
    check(
      "A's egne beskeder står ikke som ulæste for A selv",
      ulaesteA.find((r) => r.channelId === channelId)?.ulaest,
      false,
    );

    await klientB.mutation(api.messages.markerLaest, { channelId });
    check(
      "B har intet ulæst efter markering",
      (await klientB.query(api.messages.getUlaeste, {})).find(
        (r) => r.channelId === channelId,
      )?.ulaest,
      false,
    );

    // Varslingsmodtagere: afsenderen selv skal aldrig med, og den der sidder
    // med chatten åben heller ikke.
    check(
      "B skal varsles om A's besked",
      await klientA.query(api.messages.getVarslingsmodtagere, {
        messageId: beskedId,
      }),
      [userIdB],
    );

    await klientB.mutation(api.messages.setAktivChat, { channelId });
    check(
      "B varsles ikke mens chatten er åben",
      await klientA.query(api.messages.getVarslingsmodtagere, {
        messageId: beskedId,
      }),
      [],
    );

    await klientB.mutation(api.messages.setAktivChat, {});
    check(
      "B varsles igen når chatten lukkes",
      await klientA.query(api.messages.getVarslingsmodtagere, {
        messageId: beskedId,
      }),
      [userIdB],
    );

    // 10. Achievements, promille og fortrydelser --------------------------
    console.log("\n[Smoke] 10/11 achievements, promille og fortrydelser");

    // A er endnu IKKE admin — beacon-afsnittet nedenfor er det der gør ham
    // det. Derfor ligger admin-spærren for manuelle achievements her.
    await checkRejected("almindelig bruger tildeler achievement manuelt", () =>
      klientA.mutation(api.achievements.tildelManuelt, {
        userId: userIdA,
        achievementId: "top_donor",
      }),
    );

    // Feinschmecker har tærskel 1: én Vermouth Tonic er nok.
    const vermouth = {
      channelId,
      categoryId: "cocktail",
      variationName: "Vermouth Tonic",
      sizeId: "small",
    };
    const foerste = await klientA.mutation(api.drinkLogs.logDrink, vermouth);
    check("logningen låser Feinschmecker op", foerste.nyeAchievements, [
      "feinschmecker",
    ]);

    // Kumulativ og gentagelig: nummer to er milepæl nummer to.
    const anden = await klientA.mutation(api.drinkLogs.logDrink, vermouth);
    check("kumulativ achievement låses op igen", anden.nyeAchievements, [
      "feinschmecker",
    ]);

    let liste = await klientA.query(api.achievements.getAchievementsForUser, {});
    const fein = liste.find((a) => a.achievementId === "feinschmecker");
    check("tælleren står på 2", fein?.count, 2);
    check("teksten er bevaret ordret", fein?.title, "Feinschmecker");
    check("firstUnlockedAt er sat", typeof fein?.firstUnlockedAt, "number");

    const puffFoer = liste.find((a) => a.achievementId === "puff_minister");
    // Cigaretten fra afsnit 6 tæller allerede med.
    check("Puffminister står på 1 af 5", puffFoer?.current, 1);
    check("og er ikke låst op endnu", puffFoer?.unlocked, false);
    check("manuelle har ingen fremdrift", liste.find((a) => a.achievementId === "top_donor")?.current, undefined);

    const naeste = await klientA.query(api.achievements.getNaesteMilepael, {});
    check("der findes en næste milepæl", naeste !== null, true);

    const cigaret = {
      channelId,
      categoryId: "other",
      variationName: "Cigaret",
    };
    let sidsteCigaret = foerste;
    for (let i = 0; i < 4; i++) {
      sidsteCigaret = await klientA.mutation(api.drinkLogs.logDrink, cigaret);
    }
    check("den femte cigaret låser Puffminister op", sidsteCigaret.nyeAchievements, [
      "puff_minister",
    ]);

    // --- Promille ---------------------------------------------------------
    await checkRejected("urimelig vægt afvises", () =>
      klientA.mutation(api.promille.setPromilleIndstilling, {
        enabled: true,
        weight: 900,
      }),
    );

    const uden = await klientA.query(api.promille.getMinPromille, {});
    check("uden indstilling kan der ikke regnes", uden.konfigureret, false);
    check("og der udleveres intet tal", uden.promille, null);

    await klientA.mutation(api.promille.setPromilleIndstilling, {
      enabled: true,
      gender: "male",
      weight: 80,
    });

    const bac = await klientA.query(api.promille.getMinPromille, {});
    check("promillen kan nu beregnes", bac.konfigureret, true);
    // 1 lille + 1 stor øl + 2 cocktails = 12 + 24 + 16 + 16 = 68 g.
    // 68 / (80 × 0,68) ≈ 1,25 ‰ minus et par sekunders forbrænding.
    const bacVaerdi = bac.promille ?? 0;
    check("promillen ligger i det forventede leje", bacVaerdi > 1.2 && bacVaerdi < 1.3, true);
    check("niveauet er beregnet", bac.niveau?.label, "Beruset");
    check("der er timer tilbage til ædru", (bac.timerTilAedru ?? 0) > 0, true);

    const boardMedPromille = await klientA.query(api.scoreboard.getScoreboard, {
      channelId,
    });
    const raekkeA = boardMedPromille.find((r) => r.userId === userIdA);
    check("scoreboardet viser en rigtig promille", (raekkeA?.promille ?? 0) > 1, true);

    // --- Fortrydelse ------------------------------------------------------
    const midlertidig = await klientA.mutation(api.drinkLogs.logDrink, {
      channelId,
      categoryId: "beer",
      variationName: "Tuborg",
      sizeId: "large",
    });

    const foerFortryd = await klientA.query(api.users.getMe, {});
    const fortrydelseId = await klientA.mutation(api.drinkLogs.removeDrink, {
      logId: midlertidig.logId,
    });

    const efterFortryd = await klientA.query(api.users.getMe, {});
    check(
      "en stor øl trækker 2 point fra igen",
      efterFortryd?.totalPoints,
      (foerFortryd?.totalPoints ?? 0) - 2,
    );

    await checkRejected("samme logning kan ikke fortrydes to gange", () =>
      klientA.mutation(api.drinkLogs.removeDrink, { logId: midlertidig.logId }),
    );
    await checkRejected("B fortryder A's logning", () =>
      klientB.mutation(api.drinkLogs.removeDrink, { logId: midlertidig.logId }),
    );
    await checkRejected("en fortrydelse kan ikke selv fortrydes", () =>
      klientA.mutation(api.drinkLogs.removeDrink, { logId: fortrydelseId }),
    );

    // --- Nulstilling ------------------------------------------------------
    const foerReset = await klientA.query(api.scoreboard.getScoreboard, { channelId });
    check(
      "stillingen har genstande før nulstillingen",
      (foerReset.find((r) => r.userId === userIdA)?.drinksToday ?? 0) > 0,
      true,
    );

    await klientA.mutation(api.drinkLogs.resetRun, { channelId });

    const efterReset = await klientA.query(api.scoreboard.getScoreboard, { channelId });
    check(
      "nulstillingen nulstiller også stillingen",
      efterReset.find((r) => r.userId === userIdA)?.drinksToday,
      0,
    );
    check(
      "og promillen starter forfra",
      (await klientA.query(api.promille.getMinPromille, {})).promille,
      0,
    );

    // Run-baserede achievements kan opnås igen i et NYT run.
    let cigaretIgen = sidsteCigaret;
    for (let i = 0; i < 5; i++) {
      cigaretIgen = await klientA.mutation(api.drinkLogs.logDrink, cigaret);
    }
    check("Puffminister kan opnås igen efter en nulstilling", cigaretIgen.nyeAchievements, [
      "puff_minister",
    ]);

    liste = await klientA.query(api.achievements.getAchievementsForUser, {});
    check(
      "Puffminister står nu på 2",
      liste.find((a) => a.achievementId === "puff_minister")?.count,
      2,
    );

    // Tre nulstillinger i alt låser "Are you sure about that?" op.
    await klientA.mutation(api.drinkLogs.resetRun, {});
    const tredjeReset = await klientA.mutation(api.drinkLogs.resetRun, {});
    check(
      "tre nulstillinger låser reset_confirmed op",
      tredjeReset.nyeAchievements,
      ["reset_confirmed"],
    );

    // 11. Beacons ---------------------------------------------------------
    console.log("\n[Smoke] 11/11 beacons");

    const braendbyLat = 55.6533;
    const braendbyLng = 12.4194;

    await checkRejected("almindelig bruger opretter beacon", () =>
      klientA.mutation(api.beacons.opretBeacon, {
        lat: braendbyLat,
        lng: braendbyLng,
      }),
    );

    // Testkontoen gøres til admin. Spærren i convex/testing.ts sikrer at det
    // kun kan lade sig gøre for "smoke-test+"-konti.
    await klientA.mutation(api.testing.setSmokeTestAdmin, {});

    await checkRejected("beacon uden for jorden afvist", () =>
      klientA.mutation(api.beacons.opretBeacon, { lat: 91, lng: 0 }),
    );

    // B skal være checket ind med en frisk position for at kunne varsles.
    await klientB.mutation(api.checkIns.checkIn, {
      venue: "Brøndby Stadion",
      channelId,
      location: { lat: braendbyLat, lng: braendbyLng + 0.0001 },
    });
    await klientB.mutation(api.users.opdaterPosition, {
      lat: braendbyLat,
      lng: braendbyLng + 0.0001,
    });

    // Beaconen bindes til test-Kanalen, så evalueringen kun kan ramme A og B
    // — ikke andre data der måtte ligge i dev-deploymentet.
    const beaconId = await klientA.mutation(api.beacons.opretBeacon, {
      lat: braendbyLat,
      lng: braendbyLng,
      venue: "Brøndby Stadion",
      channelId,
    });

    const findBeacon = async (id: Id<"beacons">) =>
      (await klientA.query(api.beacons.getBeacons, {})).find((b) => b._id === id);

    const nyBeacon = await findBeacon(beaconId);
    check("titel falder tilbage til stedet", nyBeacon?.title, "Brøndby Stadion");
    check("standardbesked sat", nyBeacon?.message, "Stress signal aktiveret!");
    check("standardradius 50 m", nyBeacon?.radius, 50);
    check("type er stress", nyBeacon?.type, "stress");
    check("beacon er aktiv", nyBeacon?.active, true);

    check(
      "B (ikke-admin) kan se den aktive beacon",
      (await klientB.query(api.beacons.getBeacons, {})).some(
        (b) => b._id === beaconId,
      ),
      true,
    );

    /** Varslingen for netop denne beacon — dev-deploymentet kan rumme andre. */
    const varslingFor = (
      resultat: { varslinger: Array<{ beaconId: Id<"beacons">; modtagere: Id<"users">[] }> },
      id: Id<"beacons">,
    ) => resultat.varslinger.find((v) => v.beaconId === id);

    const runde1 = await klientA.mutation(api.testing.koerBeaconEvaluering, {});
    check(
      "B varsles om beaconen",
      varslingFor(runde1, beaconId)?.modtagere,
      [userIdB],
    );
    check(
      "A varsles ikke om sin egen beacon",
      varslingFor(runde1, beaconId)?.modtagere.includes(userIdA),
      false,
    );
    check("én runde talt", (await findBeacon(beaconId))?.notificationsSent, 1);

    // Anden kørsel: B er allerede varslet, så der sker ingenting.
    const runde2 = await klientA.mutation(api.testing.koerBeaconEvaluering, {});
    check("ingen gentagen varsling", varslingFor(runde2, beaconId), undefined);
    check("runde-tælleren står stille", (await findBeacon(beaconId))?.notificationsSent, 1);

    // En beacon langt væk (Rådhuspladsen, ca. 10 km) rammer ingen.
    const fjernId = await klientA.mutation(api.beacons.opretBeacon, {
      lat: 55.6761,
      lng: 12.5683,
      venue: "Rådhuspladsen",
      channelId,
    });
    const runde3 = await klientA.mutation(api.testing.koerBeaconEvaluering, {});
    check("ingen varsles uden for radius", varslingFor(runde3, fjernId), undefined);

    // Udløb: 3 timer frem deaktiverer begge, uden at varsle nogen.
    const treTimerFrem = Date.now() + 3 * 60 * 60 * 1000;
    const runde4 = await klientA.mutation(api.testing.koerBeaconEvaluering, {
      now: treTimerFrem,
    });
    check("udløbne beacons varsler ikke", varslingFor(runde4, beaconId), undefined);
    check("beaconen er slukket efter 2 timer", (await findBeacon(beaconId))?.active, false);
    check("den fjerne beacon er også slukket", (await findBeacon(fjernId))?.active, false);
    check(
      "deactivatedAt er sat",
      typeof (await findBeacon(beaconId))?.deactivatedAt,
      "number",
    );

    check(
      "B (ikke-admin) ser ikke slukkede beacons",
      (await klientB.query(api.beacons.getBeacons, {})).some(
        (b) => b._id === beaconId,
      ),
      false,
    );

    await checkRejected("B (ikke-admin) deaktiverer en beacon", () =>
      klientB.mutation(api.beacons.deaktiverBeacon, { beaconId }),
    );

    // Til sidst: en beacon i en Kanal A ikke er medlem af må A ikke kunne se
    // — heller ikke som admin. Derfor står den efter de to ikke-admin-tjek
    // ovenfor, som B's nye rettighed ellers ville ugyldiggøre.
    await klientB.mutation(api.testing.setSmokeTestAdmin, {});
    const beaconKunB = await klientB.mutation(api.beacons.opretBeacon, {
      lat: braendbyLat,
      lng: braendbyLng,
      channelId: kanalKunB,
    });
    check(
      "A (admin) ser ikke beacons i en Kanal han ikke er medlem af",
      (await klientA.query(api.beacons.getBeacons, {})).some(
        (b) => b._id === beaconKunB,
      ),
      false,
    );
    check(
      "B ser selv sin kanalbundne beacon",
      (await klientB.query(api.beacons.getBeacons, {})).some(
        (b) => b._id === beaconKunB,
      ),
      true,
    );

    // Manuelle achievements kræver admin, og A blev det først i dette
    // afsnit — derfor ligger de to sidste achievement-tjek her.
    await klientA.mutation(api.achievements.tildelManuelt, {
      userId: userIdA,
      achievementId: "top_donor",
    });
    check(
      "Top Donor tildelt i hånden",
      (await klientA.query(api.achievements.getAchievementsForUser, {})).find(
        (a) => a.achievementId === "top_donor",
      )?.unlocked,
      true,
    );
    await checkRejected("automatisk achievement kan ikke tildeles i hånden", () =>
      klientA.mutation(api.achievements.tildelManuelt, {
        userId: userIdA,
        achievementId: "obeerma",
      }),
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
