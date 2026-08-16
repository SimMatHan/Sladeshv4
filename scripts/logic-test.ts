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
import schema from "../convex/schema.ts";
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
  beaconTitel,
  beslutVarsling,
  erBeaconUdloebet,
  erPositionForaeldet,
  erRunderOpbrugt,
  laesPosition,
} from "../convex/beaconRules.ts";
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

console.log(
  `\n[Logic] ${passed} passerede, ${failed} fejlede\n`,
);
if (failed > 0) process.exit(1);
