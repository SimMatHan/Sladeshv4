/**
 * Lokal logiktest af de rene funktioner — stræk, point og drikkedags-grænsen.
 *
 * Kører UDEN et Convex-deployment, så forretningsreglerne kan verificeres
 * isoleret og hurtigt. Databasedelen dækkes af scripts/smoke-test.ts, som
 * kræver et dev-deployment.
 *
 * Kør: npm run test:logic
 */

import {
  AVATAR_COLORS,
  AVATAR_COLOR_NAMES,
  DRINK_CATEGORIES,
  drikkedageBagud,
  forrigeDrikkedag,
  getDrinkDayStart,
  isAvatarColor,
} from "../convex/constants";
import { computeStreak, pointsForDrink } from "../convex/streaks";
import schema from "../convex/schema.ts";
import type { ScoreboardRow } from "../convex/scoreboard.ts";
import {
  medGenstand,
  udenGenstand,
  vaegtForGenstand,
} from "../src/lib/optimistisk.ts";
import {
  PHASE_ORDER,
  beregnCooldown,
  erAfsluttetStatus,
  erAktivStatus,
  erCooldownAktiv,
  erFremadrettet,
  erUdloebet,
  getBlockEnd,
  getBlockStart,
  SLADESH_TIME_LIMIT_MS,
  sladeshUdfaldVarsling,
  sladeshVarsling,
} from "../convex/sladeshRules.ts";
import {
  BESKED_MAX_LAENGDE,
  beskedFejl,
  graenseForGamleBeskeder,
  harUlaeste,
  trimBesked,
} from "../convex/messageRules.ts";
import {
  BEACON_MAX_RUNDER,
  BEACON_STANDARD_TITEL,
  afstandIMeter,
  BEACON_UKENDT_OPRETTER,
  beaconTitel,
  beaconVarsling,
  beslutVarsling,
  erBeaconUdloebet,
  erPositionForaeldet,
  erRunderOpbrugt,
  laesPosition,
} from "../convex/beaconRules.ts";
import {
  alkoholGram,
  beregnPromille,
  beruselsesniveau,
  foersteGenstandTid,
  kanBeregnePromille,
  timerTilAedru,
} from "../convex/promilleRules.ts";
import {
  beregnRunStart,
  byggAggregat,
  erUdeIDag,
  nettoForVariant,
  variantNoegle,
} from "../convex/drinkRules.ts";
import {
  ACHIEVEMENTS,
  beregnOplaasninger,
  erOpnaaet,
  findAchievement,
  maalFor,
  naesteMilepael,
  taerskelFor,
  type Maalinger,
} from "../convex/achievementRules.ts";
import { kendteFelter, valider, type AnyValidator } from "./lib/validate.ts";

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

  // --- Sommertidsskiftene -------------------------------------------------
  // Her lå en fejl indtil historikken blev bygget: grænsen blev regnet som
  // "nu minus forløben vægurstid siden midnat", og de to er ikke det samme
  // på et døgn med 23 eller 25 timer. Kl. 09:00 den 25. oktober svarede
  // funktionen, at drikkedagen begyndte kl. 11:00 dagen før.
  check(
    "efterårets 25-timers døgn, kl. 09:00 → gårsdagens kl. 10:00",
    getDrinkDayStart(cet("2026-10-25T09:00:00")),
    cest("2026-10-24T10:00:00"),
  );
  check(
    "efterårets 25-timers døgn, kl. 12:00 → samme dags kl. 10:00",
    getDrinkDayStart(cet("2026-10-25T12:00:00")),
    cet("2026-10-25T10:00:00"),
  );
  check(
    "forårets 23-timers døgn, kl. 09:00 → gårsdagens kl. 10:00",
    getDrinkDayStart(cest("2026-03-29T09:00:00")),
    cet("2026-03-28T10:00:00"),
  );
  check(
    "forårets 23-timers døgn, kl. 12:00 → samme dags kl. 10:00",
    getDrinkDayStart(cest("2026-03-29T12:00:00")),
    cest("2026-03-29T10:00:00"),
  );

  // Sladesh-blokkene deler den samme regning og var derfor ramt af det samme.
  check(
    "12-timers blokken rammer også rigtigt på skiftedøgnet",
    getBlockStart(cet("2026-10-25T09:00:00")),
    cest("2026-10-25T00:00:00"),
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

console.log("\n[Logic] point");
{
  // Størrelserne er væk: nye logninger sender ingen multiplikator, og
  // `pointsForDrink` får derfor `undefined`. Se kommentaren, hvor
  // `DRINK_SIZES` stod, i convex/constants.ts.
  check("en genstand → 1 point", pointsForDrink("beer", undefined), 1);
  check("cigaret → 0 point", pointsForDrink("other", undefined), 0);

  // GAMLE rækker bærer stadig deres egen vægt, og den skal blive ved med at
  // tælle. Det er hele grunden til, at der ikke er nogen migrering.
  check("gammel mellem-øl tæller stadig 1,5", pointsForDrink("beer", 1.5), 1.5);
  check("gammel stor øl tæller stadig 2", pointsForDrink("beer", 2), 2);
  check("gammel cigaret tæller stadig 0", pointsForDrink("other", 2), 0);

  // Modposten fra en fortrydelse. `removeDrink` skriver den negative vægt.
  check("fortrydelse trækker fra", pointsForDrink("beer", -1), -1);
}

console.log("\n[Logic] er man ude i dag?");
{
  // `erUdeIDag` afgør fem ting: hvem der står på stillingen, hvem der ses på
  // kortet, om positionen gemmes, om aftenens første genstand checker dig
  // ind — og om Kanalen får besked om, at du er gået ud. Den sidste er ny,
  // og den er grunden til, at grænsen fortjener sine egne prøver: fyrer den
  // to gange på én aften, får alle to notifikationer om den samme person.
  const fredag = getDrinkDayStart(cest("2026-08-14T20:00:00"));

  check("checket ind i aften", erUdeIDag({ checkInStatus: true, lastCheckIn: fredag + 3600_000 }, fredag), true);
  check("checket ind præcis ved døgnskiftet", erUdeIDag({ checkInStatus: true, lastCheckIn: fredag }, fredag), true);

  // Flaget bliver stående, til man checker ud. Uden tidsgrænsen ville et
  // check-in fra i går stadig se sandt ud i aften — og så ville aftenens
  // første genstand hverken checke én ind eller sige det til nogen.
  check("checket ind i går tæller ikke", erUdeIDag({ checkInStatus: true, lastCheckIn: fredag - 1 }, fredag), false);

  check("checket ud", erUdeIDag({ checkInStatus: false, lastCheckIn: fredag + 3600_000 }, fredag), false);
  check("aldrig checket ind", erUdeIDag({}, fredag), false);
  check("flag uden tidspunkt", erUdeIDag({ checkInStatus: true }, fredag), false);
}

console.log("\n[Logic] sladesh-varslingen");
{
  // Teksten er det eneste, modtageren ser, hvis telefonen ligger i lommen.
  // Den var indtil videre ikke skrevet nogen steder: `sendSladesh` sendte
  // ingen push overhovedet.
  const varsling = sladeshVarsling("Frederik");
  check("titlen siger hvad der er sket", varsling.titel, "🍺 Du er blevet sladeshet");
  check("afsenderens navn står forrest", varsling.tekst.startsWith("Frederik "), true);

  // Minuttallet REGNES af fristen. Står de to hver sit sted, kan appen
  // komme til at love ti minutter og give noget andet.
  check(
    "minuttallet følger fristen",
    varsling.tekst.includes(`${Math.round(SLADESH_TIME_LIMIT_MS / 60000)} minutter`),
    true,
  );
  check("fristen er 10 minutter", SLADESH_TIME_LIMIT_MS, 10 * 60 * 1000);

  check(
    "et tomt navn falder tilbage",
    sladeshVarsling("   ").tekst.startsWith("Nogen "),
    true,
  );

  // Og den anden vej: hvordan gik det. Afsenderen sad før tilbage med en
  // venterbjælke, der bare forsvandt.
  //
  // De TRE udfald har hver sin tekst med vilje. "Gav op" og "nåede det
  // ikke" er to forskellige ting at have gjort, og afsenderen sendte den
  // for at vide hvilken — så en fælles "det gik ikke" ville tage netop den
  // oplysning væk.
  check(
    "gennemført",
    sladeshUdfaldVarsling("Mathias", "completed"),
    { titel: "🍺 Sladesh gennemført", tekst: "Mathias klarede den." },
  );
  check(
    "opgivet",
    sladeshUdfaldVarsling("Mathias", "failed"),
    { titel: "Sladesh opgivet", tekst: "Mathias gav op." },
  );
  check(
    "udløbet nævner fristen",
    sladeshUdfaldVarsling("Mathias", "expired"),
    {
      titel: "Sladesh udløbet",
      tekst: `Mathias nåede det ikke inden for ${Math.round(SLADESH_TIME_LIMIT_MS / 60000)} minutter.`,
    },
  );

  // De tre er FORSKELLIGE. Prøven findes, fordi en fælles tekst er præcis
  // den forenkling, nogen ville lave en dag.
  const udfald = (["completed", "failed", "expired"] as const).map(
    (u) => sladeshUdfaldVarsling("Mathias", u).tekst,
  );
  check("tre udfald, tre tekster", new Set(udfald).size, 3);

  check(
    "et tomt navn falder også tilbage her",
    sladeshUdfaldVarsling("  ", "completed").tekst,
    "Nogen klarede den.",
  );
}

console.log("\n[Logic] fortrydelser (action: \"remove\", negativ sizeMultiplier)");
{
  // Det gamle repo logger en fortrydelse som en EKSTRA række med negativ
  // sizeMultiplier (drinkService.ts:281), ikke ved at slette den oprindelige.
  // 109 sådanne rækker findes i produktion. Fortegnet bærer semantikken, så
  // aggregeringer trækker dem fra af sig selv — det er utestet og let at
  // ødelægge ved et uheld, derfor disse tests.

  // 1. Point: en fortrydelse giver negative point, så genberegnet totalPoints
  //    ikke tæller fortrudte genstande med.
  check("fortrudt lille øl → -1 point", pointsForDrink("beer", -1), -1);
  check("fortrudt stor øl → -2 point", pointsForDrink("beer", -2), -2);
  check("fortrudt cigaret → 0 point", pointsForDrink("other", -1), 0);

  // En logning plus dens fortrydelse skal gå i nul.
  const logninger: [string, number][] = [
    ["beer", 1],
    ["beer", 2],
    ["beer", -2],
  ];
  check(
    "logning + fortrydelse går i nul",
    logninger.reduce((sum, [kat, mult]) => sum + pointsForDrink(kat, mult), 0),
    1,
  );

  // 2. Scoreboardets sum: samme regnestykke som i convex/scoreboard.ts.
  const sum = (rækker: number[]) =>
    Number(rækker.reduce((a, b) => a + b, 0).toFixed(2));
  check("sizeMultiplier -1 trækker 1 fra summen", sum([1, 2, -1]), 2);
  check("alt fortrudt → 0", sum([1, -1]), 0);

  // 3. Stræk: en fortrydelse må ALDRIG forlænge en stræk. Uden dette ville
  //    man kunne holde en stræk i live ved at logge og fortryde.
  const fortrydelse = computeStreak({
    now: cest("2026-08-14T12:00:00"),
    lastDrinkAt: cest("2026-08-13T12:00:00"),
    currentDayStreak: 4,
    longestStreak: 7,
    categoryId: "beer",
    sizeMultiplier: -1,
  });
  check("fortrydelse → stræk uændret", fortrydelse.currentDayStreak, 4);
  check("fortrydelse → changed=false", fortrydelse.changed, false);
  check("fortrydelse → longestStreak uændret", fortrydelse.longestStreak, 7);

  // Kontrolprøve: samme række med positiv vægt SKAL forlænge stræk.
  check(
    "kontrol: positiv vægt forlænger stræk",
    computeStreak({
      now: cest("2026-08-14T12:00:00"),
      lastDrinkAt: cest("2026-08-13T12:00:00"),
      currentDayStreak: 4,
      longestStreak: 7,
      categoryId: "beer",
      sizeMultiplier: 1,
    }).currentDayStreak,
    5,
  );
}

console.log("\n[Logic] Sladesh — 12-timers cooldown-blokke");
{
  // Blokkene er 00:00-12:00 og 12:00-24:00 i DANSK tid. Bemærk at dette er
  // en ANDEN grænse end drikkedagens kl. 10:00 — appen har bevidst to
  // forskellige døgninddelinger, og de må ikke forveksles.
  check(
    "08:00 → blokken startede kl. 00:00",
    getBlockStart(cest("2026-08-13T08:00:00")),
    cest("2026-08-13T00:00:00"),
  );
  check(
    "13:00 → blokken startede kl. 12:00",
    getBlockStart(cest("2026-08-13T13:00:00")),
    cest("2026-08-13T12:00:00"),
  );
  check(
    "11:59 → stadig formiddagsblokken",
    getBlockStart(cest("2026-08-13T11:59:59")),
    cest("2026-08-13T00:00:00"),
  );
  check(
    "12:00 præcis → eftermiddagsblokken",
    getBlockStart(cest("2026-08-13T12:00:00")),
    cest("2026-08-13T12:00:00"),
  );
  check(
    "blokken slutter 12 timer senere",
    getBlockEnd(cest("2026-08-13T13:00:00")),
    cest("2026-08-14T00:00:00"),
  );
  // Vintertid skal ramme samme lokale klokkeslæt.
  check(
    "vintertid 13:00 → kl. 12:00 lokal tid",
    getBlockStart(cet("2026-01-15T13:00:00")),
    cet("2026-01-15T12:00:00"),
  );

  // Cooldown-grænsen er IKKE den samme som drikkedagens.
  check(
    "kl. 09:00: blokgrænse og drikkedagsgrænse er forskellige",
    getBlockStart(cest("2026-08-13T09:00:00")) ===
      getDrinkDayStart(cest("2026-08-13T09:00:00")),
    false,
  );

  // Selve cooldown-reglen.
  check("aldrig sendt → ingen cooldown", erCooldownAktiv(undefined, cest("2026-08-13T13:00:00")), false);
  check(
    "sendt tidligere i samme blok → cooldown",
    erCooldownAktiv(cest("2026-08-13T12:30:00"), cest("2026-08-13T13:00:00")),
    true,
  );
  check(
    "sendt i forrige blok → må sende igen",
    erCooldownAktiv(cest("2026-08-13T11:00:00"), cest("2026-08-13T13:00:00")),
    false,
  );
  check(
    "sendt i går → må sende igen",
    erCooldownAktiv(cest("2026-08-12T13:00:00"), cest("2026-08-13T13:00:00")),
    false,
  );

  const blokeret = beregnCooldown(
    cest("2026-08-13T12:30:00"),
    cest("2026-08-13T13:00:00"),
  );
  check("blokeret → canSend false", blokeret.canSend, false);
  check(
    "blokeret → tid til næste blok",
    blokeret.msTilNaesteBlok,
    cest("2026-08-14T00:00:00") - cest("2026-08-13T13:00:00"),
  );
  check(
    "fri → msTilNaesteBlok er 0",
    beregnCooldown(undefined, cest("2026-08-13T13:00:00")).msTilNaesteBlok,
    0,
  );
}

console.log("\n[Logic] Sladesh — faser, status og frist");
{
  // Fremdrift er kun fremad.
  check("intro → awaiting_filled", erFremadrettet("intro", "awaiting_filled"), true);
  check(
    "filled_captured → awaiting_empty",
    erFremadrettet("filled_captured", "awaiting_empty"),
    true,
  );
  check(
    "awaiting_empty → filled_captured er baglæns",
    erFremadrettet("awaiting_empty", "filled_captured"),
    false,
  );
  check(
    "samme fase igen er ikke fremad",
    erFremadrettet("filled_captured", "filled_captured"),
    false,
  );
  check(
    "man må gerne springe en fase over",
    erFremadrettet("intro", "empty_captured"),
    true,
  );
  check("faserækkefølgen har 7 trin", PHASE_ORDER.length, 7);

  // Status-klassifikation.
  check("pending er aktiv", erAktivStatus("pending"), true);
  check("in_progress er aktiv", erAktivStatus("in_progress"), true);
  check("completed er ikke aktiv", erAktivStatus("completed"), false);
  check("expired er ikke aktiv", erAktivStatus("expired"), false);
  check("completed er afsluttet", erAfsluttetStatus("completed"), true);
  check("failed er afsluttet", erAfsluttetStatus("failed"), true);
  check("expired er afsluttet", erAfsluttetStatus("expired"), true);
  check("pending er ikke afsluttet", erAfsluttetStatus("pending"), false);

  // Fristen er 10 minutter.
  check("fristen er 10 minutter", SLADESH_TIME_LIMIT_MS, 10 * 60 * 1000);
  const start = cest("2026-08-13T20:00:00");
  const frist = start + SLADESH_TIME_LIMIT_MS;
  check("ikke udløbet et sekund før", erUdloebet(frist, frist - 1000), false);
  check("ikke udløbet præcis på fristen", erUdloebet(frist, frist), false);
  check("udløbet et sekund efter", erUdloebet(frist, frist + 1000), true);
}

console.log("\n[Logic] validator-walker mod det rigtige schema");
{
  // Walkeren bruges af datarevisionen til at måle produktionsdata mod
  // convex/schema.ts. Den testes her mod de FAKTISKE validatorer, så en
  // schemaændring der bryder den, fanges med det samme.
  const users = (schema.tables.users as unknown as { validator: AnyValidator })
    .validator;

  const gyldig = {
    authId: "firebase-uid",
    email: "a@b.dk",
    displayName: "Tester",
    joinedChannelIds: [],
    createdAt: 1_700_000_000_000,
  };

  check("gyldigt brugerdokument → ingen overtrædelser", valider(gyldig, users), []);

  const { email: _udeladt, ...udenEmail } = gyldig;
  check(
    "manglende påkrævet felt fanges",
    valider(udenEmail, users).map((f) => f.sti),
    ["email"],
  );

  check(
    "forkert type fanges",
    valider({ ...gyldig, displayName: 42 }, users).map((f) => f.årsag),
    ["forventede string, fik number"],
  );

  check(
    "valgfrit felt må mangle",
    valider({ ...gyldig, emoji: undefined }, users),
    [],
  );

  // currentLocation er en union af objekt og null — begge grene skal passere.
  check(
    "union: null-grenen accepteres",
    valider({ ...gyldig, currentLocation: null }, users),
    [],
  );
  check(
    "union: objekt-grenen accepteres",
    valider(
      {
        ...gyldig,
        currentLocation: { lat: 55.6, lng: 12.4, venue: "Bar", timestamp: 1 },
      },
      users,
    ),
    [],
  );
  check(
    "union: en tredje form afvises",
    valider({ ...gyldig, currentLocation: "hjemme" }, users).length,
    1,
  );

  // Indlejret objekt: promille.enabled er påkrævet inde i objektet.
  check(
    "indlejret påkrævet felt fanges med fuld sti",
    valider({ ...gyldig, promille: { weight: 80 } }, users).map((f) => f.sti),
    ["promille.enabled"],
  );

  // Array-element med forkert type.
  check(
    "array-element med forkert type fanges",
    valider({ ...gyldig, joinedChannelIds: [123] }, users).length,
    1,
  );

  // Undtagelser: migreringen sætter selv authId.
  check(
    "ignorerManglende undertrykker feltet",
    valider(udenEmail, users, { ignorerManglende: ["email"] }),
    [],
  );

  check(
    "kendteFelter finder schemaets felter",
    kendteFelter(users).has("authId") && !kendteFelter(users).has("totalDrinks"),
    true,
  );
}

console.log("\n[Logic] chat-regler");
{
  check("tekst trimmes", trimBesked("  hej  "), "hej");
  check("tom tekst afvises", beskedFejl(trimBesked("   ")), "EMPTY_MESSAGE");
  check("almindelig tekst er i orden", beskedFejl("Skål!"), null);
  check(
    "præcis grænsen er tilladt",
    beskedFejl("x".repeat(BESKED_MAX_LAENGDE)),
    null,
  );
  check(
    "ét tegn over grænsen afvises",
    beskedFejl("x".repeat(BESKED_MAX_LAENGDE + 1)),
    "MESSAGE_TOO_LONG",
  );

  // Emoji fylder mere end ét tegn i JavaScript. Det er bevidst at grænsen
  // måles i UTF-16-enheder som alt andet i JS — men det skal være et VALG,
  // ikke en overraskelse, så det står fast her.
  check("emoji tælles som to enheder", trimBesked("🍺").length, 2);

  // Ulæst-detektion, ordret fra messageService.hasUnreadMessages.
  check("tom Kanal har intet ulæst", harUlaeste(undefined, undefined), false);
  check("tom Kanal, selvom man har set den", harUlaeste(1000, undefined), false);
  check("aldrig åbnet Kanal med beskeder er ulæst", harUlaeste(undefined, 1000), true);
  check("besked nyere end sidste visning", harUlaeste(1000, 1001), true);
  check("besked ældre end sidste visning", harUlaeste(1000, 999), false);
  // Grænsetilfældet: set i præcis samme millisekund tæller som læst. Det er
  // vigtigt, fordi sendMessage sætter begge tidsstempler til det samme `now`
  // — ellers ville ens egen besked altid stå som ulæst for én selv.
  check("samme millisekund tæller som læst", harUlaeste(1000, 1000), false);

  const nu = cest("2026-08-16T12:00:00");
  check(
    "oprydningsgrænsen ligger 24 timer tilbage",
    graenseForGamleBeskeder(nu),
    cest("2026-08-15T12:00:00"),
  );
}

console.log("\n[Logic] beacon-regler");
{
  // Haversine. 1 breddegrad = π/180 × 6371 km ≈ 111.195 m.
  check(
    "1 breddegrad ≈ 111195 m",
    Math.round(afstandIMeter(55, 12, 56, 12)),
    111195,
  );
  check("samme punkt giver 0 m", afstandIMeter(55.6, 12.4, 55.6, 12.4), 0);
  // 0,0001 grad ≈ 11 m — altså inden for standardradius på 50 m.
  check(
    "0,0001 breddegrad ≈ 11 m",
    Math.round(afstandIMeter(55.6, 12.4, 55.6001, 12.4)),
    11,
  );
  // Længdegrader er kortere jo længere mod nord man kommer. Ved 55,6° nord
  // er de ca. 56 % af en breddegrad — beviser at cos-leddet regnes med.
  check(
    "1 længdegrad er kortere end 1 breddegrad ved 55,6° nord",
    Math.round(afstandIMeter(55.6, 12, 55.6, 13)) <
      Math.round(afstandIMeter(55.6, 12, 56.6, 12)),
    true,
  );

  // Positionsopslag: `location` foretrækkes, og hvert koordinatsæt følges af
  // SIT eget tidsstempel — afvigelsen fra det gamle repo, som kunne parre
  // gamle koordinater med et friskt tidsstempel.
  check(
    "location foretrækkes frem for currentLocation",
    laesPosition({
      location: { lat: 1, lng: 2, lastUpdated: 500 },
      currentLocation: { lat: 9, lng: 9, venue: "Andetsteds", timestamp: 900 },
    }),
    { lat: 1, lng: 2, opdateretAt: 500 },
  );
  check(
    "currentLocation bruges når location mangler",
    laesPosition({
      currentLocation: { lat: 9, lng: 8, venue: "Baren", timestamp: 900 },
    }),
    { lat: 9, lng: 8, opdateretAt: 900 },
  );
  check(
    "currentLocation: null tæller som ingen position",
    laesPosition({ currentLocation: null }),
    undefined,
  );
  check("ingen felter giver ingen position", laesPosition({}), undefined);

  const nu = cest("2026-08-16T20:00:00");
  const MINUT = 60 * 1000;
  check("frisk position", erPositionForaeldet(nu - 5 * MINUT, nu), false);
  check("præcis 15 minutter er stadig frisk", erPositionForaeldet(nu - 15 * MINUT, nu), false);
  check("16 minutter er forældet", erPositionForaeldet(nu - 16 * MINUT, nu), true);

  const TIME = 60 * MINUT;
  check(
    "beacon på 1 time lever",
    erBeaconUdloebet({ createdAt: nu - TIME }, nu),
    false,
  );
  check(
    "beacon på 3 timer er udløbet",
    erBeaconUdloebet({ createdAt: nu - 3 * TIME }, nu),
    true,
  );
  check(
    "expiresAt vinder over 2-timers reglen",
    erBeaconUdloebet({ createdAt: nu - 3 * TIME, expiresAt: nu + TIME }, nu),
    false,
  );

  check("ingen runder brugt", erRunderOpbrugt(undefined), false);
  check("5 runder er ikke opbrugt", erRunderOpbrugt(BEACON_MAX_RUNDER - 1), false);
  check("6 runder er opbrugt", erRunderOpbrugt(BEACON_MAX_RUNDER), true);

  check("titel falder tilbage til stedet", beaconTitel(undefined, "Baren"), "Baren");
  check(
    "titel falder tilbage til standarden",
    beaconTitel(undefined, undefined),
    BEACON_STANDARD_TITEL,
  );
  check(
    "kun mellemrum tæller ikke som titel",
    beaconTitel("   ", "  "),
    BEACON_STANDARD_TITEL,
  );
  check("angivet titel vinder", beaconTitel("Stress!", "Baren"), "Stress!");

  // Varslingens TEKST. Den var indtil videre kun et felt i et svar, ingen
  // læste — evalueringen fandt modtagerne og sendte aldrig noget. Nu er den
  // nyttelasten i en rigtig push, så den fortjener at være låst fast:
  // brugerne kender ordlyden fra den gamle app.
  const varsling = beaconVarsling("Frederik");
  check("titlen er den kendte", varsling.titel, "🚨 STRESS BEACON AKTIVERET! 🚨");
  check("opretterens navn står i teksten", varsling.tekst.startsWith("Frederik "), true);
  check(
    "teksten lover næste tjek om 5 minutter",
    varsling.tekst.includes("næste tjek er om 5 minutter"),
    true,
  );
  // Cron-kadencen i convex/crons.ts SKAL matche det, teksten lover. Står de
  // to hver sit sted, er det teksten, brugeren tror på.
  check(
    "et navnløst kald falder tilbage på standarden",
    beaconVarsling(BEACON_UKENDT_OPRETTER).tekst.startsWith("En admin "),
    true,
  );

  // Varslingsbeslutningen. Beaconen står på Brøndby Stadion.
  const beacon = { beaconLat: 55.6533, beaconLng: 12.4194, radius: 50, now: nu };
  const taetPaa = { lat: 55.6533, lng: 12.4195, opdateretAt: nu - MINUT };
  const langtVaek = { lat: 55.6761, lng: 12.5683, opdateretAt: nu - MINUT };

  check(
    "bruger inden for radius varsles",
    beslutVarsling({
      ...beacon,
      erOpretter: false,
      alleredeVarslet: false,
      position: taetPaa,
    }).varsl,
    true,
  );
  check(
    "bruger uden for radius varsles ikke",
    beslutVarsling({
      ...beacon,
      erOpretter: false,
      alleredeVarslet: false,
      position: langtVaek,
    }),
    { varsl: false, aarsag: "uden_for_radius", afstand: afstandIMeter(55.6533, 12.4194, 55.6761, 12.5683) },
  );
  // Spærrernes RÆKKEFØLGE: opretteren afvises, selv når alt andet passer.
  check(
    "opretteren varsles aldrig om sin egen beacon",
    beslutVarsling({
      ...beacon,
      erOpretter: true,
      alleredeVarslet: false,
      position: taetPaa,
    }),
    { varsl: false, aarsag: "er_opretter" },
  );
  check(
    "allerede varslet gentages ikke",
    beslutVarsling({
      ...beacon,
      erOpretter: false,
      alleredeVarslet: true,
      position: taetPaa,
    }),
    { varsl: false, aarsag: "allerede_varslet" },
  );
  check(
    "uden position varsles der ikke",
    beslutVarsling({
      ...beacon,
      erOpretter: false,
      alleredeVarslet: false,
      position: undefined,
    }),
    { varsl: false, aarsag: "ingen_position" },
  );
  check(
    "forældet position varsles der ikke på",
    beslutVarsling({
      ...beacon,
      erOpretter: false,
      alleredeVarslet: false,
      position: { ...taetPaa, opdateretAt: nu - 30 * MINUT },
    }),
    { varsl: false, aarsag: "position_foraeldet" },
  );
}

console.log("\n[Logic] run-grænse og aggregering");
{
  const dayStart = cest("2026-08-16T10:00:00");
  const kl12 = cest("2026-08-16T12:00:00");
  const kl14 = cest("2026-08-16T14:00:00");

  check(
    "uden nulstilling starter runnet ved drikkedagen",
    beregnRunStart(dayStart, [{ timestamp: kl12 }]),
    dayStart,
  );
  check(
    "en nulstilling flytter runnets start",
    beregnRunStart(dayStart, [
      { timestamp: kl12, isReset: true },
      { timestamp: kl14 },
    ]),
    kl12,
  );
  check(
    "den SENESTE nulstilling vinder",
    beregnRunStart(dayStart, [
      { timestamp: kl12, isReset: true },
      { timestamp: kl14, isReset: true },
    ]),
    kl14,
  );
  check(
    "en nulstilling før drikkedagen flytter ikke grænsen",
    beregnRunStart(dayStart, [{ timestamp: dayStart - 1000, isReset: true }]),
    dayStart,
  );

  const oel = (multiplier: number, timestamp: number) => ({
    categoryId: "beer",
    variationName: "Tuborg",
    sizeMultiplier: multiplier,
    timestamp,
  });

  const aggregat = byggAggregat([
    oel(1, kl12), // lille
    oel(2, kl12), // stor
    { categoryId: "other", variationName: "Cigaret", timestamp: kl12 },
    { categoryId: "other", variationName: "Run nulstillet", timestamp: kl14, isReset: true },
  ]);

  check("stor øl vejer dobbelt", aggregat.perKategori.beer, 3);
  check("cigaretten tælles i sin kategori", aggregat.perKategori.other, 1);
  check("men IKKE som genstand", aggregat.genstande, 3);
  check("nulstillings-rækken tælles slet ikke", aggregat.perVariant["other::Run nulstillet"], undefined);
  check("variant-nøglen er kategori::variant", variantNoegle("other", "Cigaret"), "other::Cigaret");

  // Fortrydelser bærer negativ vægt og trækker sig selv fra.
  const medFortrydelse = byggAggregat([oel(1, kl12), oel(1, kl12), oel(-1, kl14)]);
  check("fortrydelse trækker fra totalen", medFortrydelse.genstande, 1);
  check(
    "fortrydelse trækker også fra varianten",
    nettoForVariant(medFortrydelse, "beer", "Tuborg"),
    1,
  );
  check(
    "ukendt variant giver 0, ikke undefined",
    nettoForVariant(medFortrydelse, "wine", "Rødvin"),
    0,
  );
}

console.log("\n[Logic] promille (Widmark)");
{
  const start = cest("2026-08-16T20:00:00");
  const TIME = 60 * 60 * 1000;

  const drink = (categoryId: string, multiplier: number, timestamp: number) => ({
    categoryId,
    sizeMultiplier: multiplier,
    timestamp,
  });

  check("lille øl = 12 g alkohol", alkoholGram([drink("beer", 1, start)]), 12);
  check("stor øl = 24 g", alkoholGram([drink("beer", 2, start)]), 24);
  check("cocktail er stærkere end øl", alkoholGram([drink("cocktail", 1, start)]), 16);
  check("cigaret indeholder ingen alkohol", alkoholGram([drink("other", 1, start)]), 0);
  check(
    "fortrydelse trækker alkoholen fra igen",
    alkoholGram([drink("beer", 1, start), drink("beer", -1, start)]),
    0,
  );
  check(
    "en overvægt af fortrydelser går ikke i minus",
    alkoholGram([drink("beer", -1, start)]),
    0,
  );

  check(
    "første genstand findes",
    foersteGenstandTid([drink("beer", 1, start + TIME), drink("beer", 1, start)]),
    start,
  );
  check(
    "en fortrydelse kan ikke flytte starttidspunktet bagud",
    foersteGenstandTid([drink("beer", -1, start - TIME), drink("beer", 1, start)]),
    start,
  );
  check(
    "en cigaret starter ikke promillen",
    foersteGenstandTid([drink("other", 1, start - TIME), drink("beer", 1, start)]),
    start,
  );
  check("ingen genstande giver undefined", foersteGenstandTid([]), undefined);

  // 5 små øl = 60 g. Mand på 80 kg: 60 / (80 × 0,68) = 1,1029…
  const femOel = [1, 2, 3, 4, 5].map(() => drink("beer", 1, start));
  check(
    "5 øl, mand 80 kg, ingen forbrænding endnu",
    beregnPromille(femOel, 80, "male", start),
    1.103,
  );
  // Kvinder har en lavere Widmark-faktor og får derfor en højere promille
  // af samme mængde.
  check(
    "5 øl, kvinde 60 kg",
    beregnPromille(femOel, 60, "female", start),
    1.818,
  );
  check(
    "to timer senere er 0,3 ‰ forbrændt",
    beregnPromille(femOel, 80, "male", start + 2 * TIME),
    0.803,
  );
  check(
    "efter mange timer rammer den 0, ikke minus",
    beregnPromille(femOel, 80, "male", start + 40 * TIME),
    0,
  );
  check("uden vægt kan der ikke regnes", beregnPromille(femOel, 0, "male", start), 0);
  check("uden genstande er promillen 0", beregnPromille([], 80, "male", start), 0);

  check("under 0,3 er ædru", beruselsesniveau(0.29).label, "Ædru");
  check("0,3 er let påvirket", beruselsesniveau(0.3).label, "Let påvirket");
  check("0,8 er beruset", beruselsesniveau(0.8).label, "Beruset");
  check("1,5 er meget beruset", beruselsesniveau(1.5).status, "danger");

  check("timer til ædru rundes op", timerTilAedru(1.1), 8);
  check("ædru nu giver 0 timer", timerTilAedru(0), 0);

  check("slået fra → kan ikke regne", kanBeregnePromille({ enabled: false, gender: "male", weight: 80 }), false);
  check("mangler vægt → kan ikke regne", kanBeregnePromille({ enabled: true, gender: "male" }), false);
  check("mangler køn → kan ikke regne", kanBeregnePromille({ enabled: true, weight: 80 }), false);
  check("vægt 0 → kan ikke regne", kanBeregnePromille({ enabled: true, gender: "male", weight: 0 }), false);
  check("udfyldt → kan regne", kanBeregnePromille({ enabled: true, gender: "female", weight: 62 }), true);
  check("ingen indstilling → kan ikke regne", kanBeregnePromille(undefined), false);
}

console.log("\n[Logic] achievements");
{
  const runStart = cest("2026-08-16T10:00:00");
  const tomtAggregat = { genstande: 0, perKategori: {}, perVariant: {} };

  const maalinger = (over: Partial<Maalinger>): Maalinger => ({
    totalRunResets: 0,
    runStart,
    run: tomtAggregat,
    livstid: tomtAggregat,
    ...over,
  });

  // Definitionerne selv.
  check("alle otte achievements er med", ACHIEVEMENTS.length, 8);
  check("Top Donor er manuel", findAchievement("top_donor")?.type, "manual");
  check(
    "Mr. Worldwides tærskel er antallet af kategorier",
    taerskelFor(findAchievement("mr_worldwide")!),
    5,
  );
  check("Obeermas tærskel er 10", taerskelFor(findAchievement("obeerma")!), 10);

  const obeerma = findAchievement("obeerma")!;
  const fullBender = findAchievement("full_bender")!;
  const likeFineWine = findAchievement("like_fine_wine")!;
  const puffMinister = findAchievement("puff_minister")!;
  const feinschmecker = findAchievement("feinschmecker")!;
  const mrWorldwide = findAchievement("mr_worldwide")!;
  const resetConfirmed = findAchievement("reset_confirmed")!;

  // Obeerma måler ØL i runnet — ikke variantnavne, som klienten fejlagtigt
  // gjorde. En stor øl vejer 2.
  check(
    "Obeerma måler kategorien beer i runnet",
    maalFor(obeerma, maalinger({ run: { genstande: 6, perKategori: { beer: 6 }, perVariant: {} } })),
    6,
  );
  // Full Bender har ingen kategori og måler alle genstande.
  check(
    "Full Bender måler alle genstande i runnet",
    maalFor(fullBender, maalinger({ run: { genstande: 21, perKategori: { beer: 12, shot: 9 }, perVariant: {} } })),
    21,
  );
  // Like Fine Wine er livstid, ikke run.
  check(
    "Like Fine Wine måler vin over livstiden",
    maalFor(
      likeFineWine,
      maalinger({
        run: { genstande: 1, perKategori: { wine: 1 }, perVariant: {} },
        livstid: { genstande: 7, perKategori: { wine: 7 }, perVariant: {} },
      }),
    ),
    7,
  );
  check(
    "Puffminister måler cigaretter i runnet",
    maalFor(
      puffMinister,
      maalinger({ run: { genstande: 0, perKategori: { other: 5 }, perVariant: { "other::Cigaret": 5 } } }),
    ),
    5,
  );
  check(
    "Feinschmecker måler én bestemt drink over livstiden",
    maalFor(
      feinschmecker,
      maalinger({
        livstid: {
          genstande: 3,
          perKategori: { cocktail: 3 },
          perVariant: { "cocktail::Vermouth Tonic": 1, "cocktail::Negroni": 2 },
        },
      }),
    ),
    1,
  );
  check(
    "Mr. Worldwide tæller kategorier med mindst én genstand",
    maalFor(
      mrWorldwide,
      maalinger({
        run: {
          genstande: 4,
          perKategori: { beer: 1, cider: 1, wine: 1, cocktail: 1, other: 9 },
          perVariant: {},
        },
      }),
    ),
    4,
  );
  check(
    "Mr. Worldwide er ikke opnået med 4 af 5",
    erOpnaaet(mrWorldwide, 4),
    false,
  );
  check("manuelle opnås aldrig af sig selv", erOpnaaet(findAchievement("top_donor")!, 999), false);

  // --- Oplåsninger --------------------------------------------------------
  const tiOel = maalinger({
    run: { genstande: 10, perKategori: { beer: 10 }, perVariant: {} },
  });

  check(
    "første gang låses Obeerma op",
    beregnOplaasninger(tiOel, {}).map((o) => o.achievementId),
    ["obeerma"],
  );
  check(
    "og runnets start gemmes med",
    beregnOplaasninger(tiOel, {})[0]?.lastRunStart,
    runStart,
  );

  // Samme run igen: ingen ny oplåsning. Det var netop den løkke det gamle
  // repos hasReachedNewMilestone fandtes for at bryde.
  check(
    "samme run låser ikke op igen",
    beregnOplaasninger(tiOel, { obeerma: { count: 1, lastRunStart: runStart } }),
    [],
  );

  // Et nyt run — fx dagen efter, uden at nogen har trykket nulstil.
  const naesteDag = maalinger({
    runStart: runStart + DAY,
    run: { genstande: 10, perKategori: { beer: 10 }, perVariant: {} },
  });
  check(
    "et NYT run låser op igen",
    beregnOplaasninger(naesteDag, {
      obeerma: { count: 1, lastRunStart: runStart },
    }).map((o) => o.nyCount),
    [2],
  );
  // Rækker fra før fase 8 (og fra migreringen) mangler lastRunStart.
  check(
    "en række uden lastRunStart behandles som et nyt run",
    beregnOplaasninger(tiOel, { obeerma: { count: 3 } }).map((o) => o.nyCount),
    [4],
  );

  // Kumulative: nulstillinger med tærskel 3.
  const nulstillinger = (antal: number) => maalinger({ totalRunResets: antal });
  check(
    "3 nulstillinger giver første oplåsning",
    beregnOplaasninger(nulstillinger(3), {}).map((o) => o.nyCount),
    [1],
  );
  check(
    "5 nulstillinger er stadig kun én milepæl",
    beregnOplaasninger(nulstillinger(5), { reset_confirmed: { count: 1 } }),
    [],
  );
  check(
    "6 nulstillinger giver den anden",
    beregnOplaasninger(nulstillinger(6), { reset_confirmed: { count: 1 } }).map(
      (o) => o.nyCount,
    ),
    [2],
  );
  // Springer man flere milepæle på én gang, lander tælleren rigtigt med det
  // samme frem for at stå i kø.
  check(
    "15 nulstillinger fra 1 springer helt op til 5",
    beregnOplaasninger(nulstillinger(15), { reset_confirmed: { count: 1 } }).map(
      (o) => o.nyCount,
    ),
    [5],
  );
  check("kumulative gemmer ikke lastRunStart", beregnOplaasninger(nulstillinger(3), {})[0]?.lastRunStart, undefined);
  check("manuelle låses aldrig op af motoren", beregnOplaasninger(maalinger({}), {}), []);

  check(
    "resetConfirmed kan gentages",
    resetConfirmed.repeatable,
    true,
  );

  // --- Næste milepæl ------------------------------------------------------
  const taetPaa = maalinger({
    run: { genstande: 9, perKategori: { beer: 9 }, perVariant: {} },
  });
  check(
    "nærmeste milepæl er den med færrest tilbage",
    naesteMilepael(taetPaa, {})?.achievementId,
    "obeerma",
  );
  check("og fremdriften regnes med", naesteMilepael(taetPaa, {})?.percentage, 90);
  check(
    "en opnået milepæl er ikke den næste",
    naesteMilepael(
      maalinger({ run: { genstande: 10, perKategori: { beer: 10 }, perVariant: {} } }),
      {},
    )?.achievementId !== "obeerma",
    true,
  );
}

console.log("\n[Logic] drikkedage bagud (historikkens akse)");
{
  check(
    "forrige drikkedag er dagen før kl. 10",
    forrigeDrikkedag(cest("2026-08-16T10:00:00")),
    cest("2026-08-15T10:00:00"),
  );

  // Skiftedøgnene: et fast døgn tilbage ville skride en time.
  check(
    "efterårets 25-timers døgn rammer stadig kl. 10",
    forrigeDrikkedag(cet("2026-10-25T10:00:00")),
    cest("2026-10-24T10:00:00"),
  );
  check(
    "forårets 23-timers døgn rammer stadig kl. 10",
    forrigeDrikkedag(cest("2026-03-29T10:00:00")),
    cet("2026-03-28T10:00:00"),
  );
  // Og at en akse hen over skiftet ikke får to dage i samme kasse.
  check(
    "aksen hen over efterårsskiftet har tre forskellige dage",
    new Set(drikkedageBagud(cet("2026-10-26T12:00:00"), 3)).size,
    3,
  );

  const tre = drikkedageBagud(cest("2026-08-16T14:00:00"), 3);
  check("tre dage, ældste først", tre, [
    cest("2026-08-14T10:00:00"),
    cest("2026-08-15T10:00:00"),
    cest("2026-08-16T10:00:00"),
  ]);
  check(
    "sidste element er dagen man står i",
    tre[tre.length - 1],
    getDrinkDayStart(cest("2026-08-16T14:00:00")),
  );
  // Kl. 03:00 hører til aftenen før — også i historikkens akse.
  check(
    "kl. 03:00 lander i gårsdagens kasse",
    drikkedageBagud(cest("2026-08-16T03:00:00"), 1),
    [cest("2026-08-15T10:00:00")],
  );
}

console.log("\n[Logic] avatar-farver og kategorier");
{
  // Farvelisten er overtaget fra det gamle repos AVATAR_COLORS og bruges nu
  // to steder: som spærre i users.opdaterProfil og som fallback i
  // scoreboardet. Står de to lister ikke ens, får brugere en farve appen
  // ikke kan tegne.
  check("syv avatar-farver", AVATAR_COLORS.length, 7);
  check("navnene er udtrukket i samme raekkefoelge", AVATAR_COLOR_NAMES[0], "sunset");
  check("hver farve har en gradient", AVATAR_COLORS.every((f) => f.gradient.length > 0), true);
  check("kendt farve godtages", isAvatarColor("cosmic"), true);
  check("ukendt farve afvises", isAvatarColor("neon"), false);
  check("tom streng afvises", isAvatarColor(""), false);

  // Kataloget over drikkevarianter må kun referere kategorier appen kender.
  // Listen i scripts/migrer.ts skal matche denne.
  check(
    "seks kategorier",
    DRINK_CATEGORIES.map((k) => k.id),
    ["beer", "cider", "wine", "cocktail", "shot", "other"],
  );
}

console.log("\n[Logic] optimistisk stilling");
{
  // Gættet, skærmen viser FØR serveren svarer. Det farlige her er ikke, at
  // tallet er en anelse forkert — serveren retter det inden for et øjeblik —
  // men at RÆKKEFØLGEN afviger fra convex/scoreboard.ts. Så ville rækker
  // hoppe rundt, hver gang svaret landede.
  const nu = cest("2026-08-13T22:00:00");
  const mig = {
    userId: "u1" as ScoreboardRow["userId"],
    name: "Mig",
    avatar: "🍺",
    color: "sunset",
  };

  check("en øl tæller 1", vaegtForGenstand("beer"), 1);
  check("en shot tæller også 1", vaegtForGenstand("shot"), 1);
  // "other" er cigaretter og lignende. De logges, men flytter ikke stillingen.
  check("andet tæller ikke med", vaegtForGenstand("other"), 0);
  check("ukendt kategori tæller ikke med", vaegtForGenstand("ingenting"), 0);

  const tom = medGenstand([], mig, 1, nu);
  check("kommer på listen ved første genstand", tom.length, 1);
  check("med det rigtige antal", tom[0]?.drinksToday, 1);
  check("og markeret som med i dag", tom[0]?.isOnline, true);

  const start: ScoreboardRow[] = [
    { userId: "u2" as ScoreboardRow["userId"], name: "Anden", avatar: "🍷", color: "ocean", drinksToday: 3, streak: 0, lastDrinkAt: nu - 5000, isOnline: true },
    { ...mig, drinksToday: 2, streak: 1, lastDrinkAt: nu - 9000, isOnline: true },
  ];

  const efter = medGenstand(start, mig, 1.5, nu);
  check("egen række tæller op", efter.find((r) => r.userId === mig.userId)?.drinksToday, 3.5);
  check("og overhaler", efter[0]?.userId, mig.userId);
  check("andres rækker røres ikke", efter.find((r) => r.userId === "u2")?.drinksToday, 3);

  // Ved lige antal vinder den, der drak TIDLIGST — samme tie-breaker som
  // serveren. Her ender begge på 3, og u2's seneste er ældst.
  const lige = medGenstand(start, mig, 1, nu);
  check("lige antal: tidligste først", lige[0]?.userId, "u2");

  const fortrudt = udenGenstand(efter, mig.userId, 1.5);
  check("fortryd trækker fra igen", fortrudt.find((r) => r.userId === mig.userId)?.drinksToday, 2);
  check("og sorterer tilbage", fortrudt[0]?.userId, "u2");

  // Halve genstande må ikke give 3.0000000000000004 på skærmen.
  check("ingen flydende-komma-støj", medGenstand(start, mig, 1.5, nu)[0]?.drinksToday, 3.5);
  // Kan ikke gå i minus, uanset hvad der bliver trukket fra.
  check("aldrig negativ", udenGenstand(start, mig.userId, 99).find((r) => r.userId === mig.userId)?.drinksToday, 0);
}

console.log(
  `\n[Logic] ${passed} passerede, ${failed} fejlede\n`,
);
if (failed > 0) process.exit(1);
