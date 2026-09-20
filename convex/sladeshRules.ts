import { localWallClock } from "./constants";

/**
 * Sladesh-reglerne som rene funktioner.
 *
 * Holdt adskilt fra convex/sladesh.ts, så de kan testes uden et deployment —
 * samme mønster som convex/streaks.ts.
 *
 * Rekonstrueret fra det gamle repos Cloud Functions
 * (functions/src/utils/sladesh.ts og callable/sladesh.ts), som var den
 * autoritative implementering. Klienten i src/services/sladeshService.ts
 * kaldte bare videre.
 */

/**
 * Fristen paa en Sladesh.
 *
 * TREDIVE MINUTTER, ikke ti. Det gamle repo havde ti, og appen arvede
 * tallet uden at proeve det: ti minutter er nok, hvis man staar ved baren
 * med telefonen i haanden, og for lidt til alt andet. Er man paa
 * dansegulvet, i koeen eller udenfor, er udfordringen tabt, foer den er
 * set — og en frist, folk ikke kan naa, goer Sladesh til noget man
 * undgaar frem for noget man tager imod.
 *
 * Tredive minutter er stadig en frist. Man skal stadig rejse sig nu.
 *
 * TALLET STAAR ÉT STED. Baade varslingerne nedenfor og teksterne i
 * SladeshOvertagelse.tsx regner minuttallet HERAF frem for at skrive det,
 * saa appen ikke kan komme til at love ét og give noget andet.
 */
export const SLADESH_TIME_LIMIT_MS = 30 * 60 * 1000;

/**
 * Fejlkoder. Bevaret ordret fra det gamle repos SLADESH_ERRORS, så et
 * fremtidigt UI kan genkende dem uændret.
 */
export const SLADESH_ERRORS = {
  RECIPIENT_NOT_FOUND: "recipient_not_found",
  SLADESH_ACTIVE_ERROR: "SLADESH_ACTIVE_ERROR",
  SLADESH_ALREADY_RESOLVED: "sladesh_already_resolved",
  COOLDOWN_ACTIVE: "cooldown_active",
} as const;

export type SladeshStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "expired";

export type SladeshPhase =
  | "intro"
  | "awaiting_filled"
  | "filled_captured"
  | "awaiting_empty"
  | "empty_captured"
  | "completed"
  | "failed";

/**
 * Faserækkefølgen. Fremdrift er kun fremad: et kald til en fase på samme
 * eller lavere plads ignoreres.
 *
 * Bemærk at `failed` ligger EFTER `completed`, præcis som i det gamle repos
 * PHASE_ORDER. Det er ikke en logisk rangordning — det er to slutfaser, der
 * begge skal ligge efter alle scanner-faserne. Selve overgangen til
 * completed/failed sættes direkte af afslutningsfunktionerne og går ikke
 * gennem fremdrifts-tjekket, så placeringen har ingen praktisk betydning
 * ud over at ingen scanner-fase kan følge efter dem.
 */
export const PHASE_ORDER: readonly SladeshPhase[] = [
  "intro",
  "awaiting_filled",
  "filled_captured",
  "awaiting_empty",
  "empty_captured",
  "completed",
  "failed",
] as const;

/** De faser modtageren kan rykke frem til med et bevisbillede. */
export const SCANNER_PHASES: readonly SladeshPhase[] = [
  "awaiting_filled",
  "filled_captured",
  "awaiting_empty",
  "empty_captured",
] as const;

export function phaseIndex(phase: SladeshPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

/** Er `til` strengt længere fremme end `fra`? */
export function erFremadrettet(fra: SladeshPhase, til: SladeshPhase): boolean {
  return phaseIndex(til) > phaseIndex(fra);
}

/** En udfordring der stadig kan gennemføres. */
export function erAktivStatus(status: SladeshStatus): boolean {
  return status === "pending" || status === "in_progress";
}

/** En udfordring der er slut — uanset udfald. */
export function erAfsluttetStatus(status: SladeshStatus): boolean {
  return status === "completed" || status === "failed" || status === "expired";
}

/**
 * Starten på den 12-timers cooldown-blok som `now` falder i.
 *
 * Blokkene er 00:00–12:00 og 12:00–24:00 i dansk tid.
 *
 * VIGTIGT: dette er en ANDEN grænse end drikkedagens kl. 10:00
 * (`getDrinkDayStart`). De to må ikke forveksles — appen har bevidst to
 * forskellige døgninddelinger.
 */
export function getBlockStart(now: number): number {
  const { hour, localMidnight } = localWallClock(now);
  const blokStartTime = hour < 12 ? 0 : 12;
  return localMidnight + blokStartTime * 60 * 60 * 1000;
}

/** Slutningen på den nuværende blok — samtidig starten på den næste. */
export function getBlockEnd(now: number): number {
  return getBlockStart(now) + 12 * 60 * 60 * 1000;
}

/**
 * Har brugeren allerede sendt en Sladesh i den nuværende blok?
 *
 * `undefined` betyder "har aldrig sendt", og så er der ingen cooldown.
 */
export function erCooldownAktiv(
  lastSladeshSentAt: number | undefined,
  now: number,
): boolean {
  if (lastSladeshSentAt === undefined) return false;
  return lastSladeshSentAt >= getBlockStart(now);
}

export type CooldownTilstand = {
  /** Må brugeren sende lige nu? */
  canSend: boolean;
  blocked: boolean;
  lastSentAt: number | undefined;
  blockStartedAt: number;
  blockEndsAt: number;
  /** Millisekunder til blokken slutter. 0 hvis man må sende nu. */
  msTilNaesteBlok: number;
};

export function beregnCooldown(
  lastSladeshSentAt: number | undefined,
  now: number,
): CooldownTilstand {
  const blockStartedAt = getBlockStart(now);
  const blockEndsAt = getBlockEnd(now);
  const blocked = erCooldownAktiv(lastSladeshSentAt, now);

  return {
    canSend: !blocked,
    blocked,
    lastSentAt: lastSladeshSentAt,
    blockStartedAt,
    blockEndsAt,
    msTilNaesteBlok: blocked ? blockEndsAt - now : 0,
  };
}

/** Er fristen overskredet? */
export function erUdloebet(deadlineAt: number, now: number): boolean {
  return now > deadlineAt;
}

/** Navnet der bruges, hvis en part ikke har sat et. */
export const SLADESH_UKENDT_AFSENDER = "Nogen";

/**
 * Varslingen til modtageren.
 *
 * Ligger HER og ikke inline i mutationen, af samme grund som
 * `beaconVarsling` i convex/beaconRules.ts: teksten er det eneste, modtageren
 * ser, hvis telefonen ligger i lommen, og så skal den kunne prøves uden et
 * deployment.
 *
 * Minuttallet regnes af `SLADESH_TIME_LIMIT_MS` frem for at stå skrevet.
 * Ændres fristen, ændres teksten med — ellers ville appen love ét minuttal
 * og give et andet. Det er sket: fristen gik fra 10 til 30, og denne tekst
 * fulgte med af sig selv.
 */
export function sladeshVarsling(afsenderNavn: string): {
  titel: string;
  tekst: string;
} {
  const minutter = Math.round(SLADESH_TIME_LIMIT_MS / 60000);
  const navn = afsenderNavn.trim() || SLADESH_UKENDT_AFSENDER;
  return {
    titel: "🍺 Du er blevet sladeshet",
    tekst: `${navn} har sladeshet dig. Du har ${minutter} minutter.`,
  };
}

/**
 * Varslingen til AFSENDEREN, når udfordringen er afgjort.
 *
 * De tre udfald er de tre slutstatusser, `erAfsluttetStatus` kender. At de
 * har hver sin tekst er ikke pynt: "gav op" og "nåede det ikke" er to
 * forskellige ting at have gjort, og afsenderen sendte den for at vide
 * hvilken.
 *
 * `expired` nævner fristen, fordi det er den, der afgjorde sagen — og
 * minuttallet regnes af `SLADESH_TIME_LIMIT_MS`, som i `sladeshVarsling`.
 */
export type SladeshUdfald = "completed" | "failed" | "expired";

export function sladeshUdfaldVarsling(
  modtagerNavn: string,
  udfald: SladeshUdfald,
): { titel: string; tekst: string } {
  const navn = modtagerNavn.trim() || SLADESH_UKENDT_AFSENDER;

  if (udfald === "completed") {
    return {
      titel: "🍺 Sladesh gennemført",
      tekst: `${navn} klarede den.`,
    };
  }

  if (udfald === "failed") {
    return {
      titel: "Sladesh opgivet",
      tekst: `${navn} gav op.`,
    };
  }

  const minutter = Math.round(SLADESH_TIME_LIMIT_MS / 60000);
  return {
    titel: "Sladesh udløbet",
    tekst: `${navn} nåede det ikke inden for ${minutter} minutter.`,
  };
}

// ---------------------------------------------------------------------------
// Sladesh-tilstand på stillingen
// ---------------------------------------------------------------------------

/**
 * Hvad stillingen skal kunne sige om én person.
 *
 * Der var tre ting, man ikke kunne se nogen steder: at en Sladesh er I GANG
 * lige nu (og hvor længe der er igen), hvem der har TAGET en i aften, og
 * hvem der har BRUGT sin. De to bjælker i toppen af appen dækkede kun den
 * første, og kun hvis man selv var indblandet — stod man udenfor, skete
 * hele legen usynligt.
 */
export type StillingSladesh = {
  /**
   * En udfordring, der stadig kan gennemføres.
   *
   * Vigtigst af de tre, fordi den har et ur: den fortæller noget, der
   * ændrer sig, mens man kigger.
   */
  aktiv?: {
    /** `modtager` skal drikke; `afsender` venter på svar. */
    rolle: "modtager" | "afsender";
    deadlineAt: number;
    /** Den anden part, så rækken kan sige hvem det er imellem. */
    modpart: string;
  };
  /** Gennemførte Sladesh, personen har TAGET i denne drikkedag. */
  tog: number;
  /** Har brugt sin ene Sladesh i den nuværende 12-timers blok. */
  brugt: boolean;
};

/** Kun de felter opgørelsen bruger — så prøverne ikke skal bygge hele rækken. */
export type UdfordringLite = {
  senderId: string;
  recipientId: string;
  senderName: string;
  recipientName: string;
  status: SladeshStatus;
  deadlineAt: number;
};

/**
 * Gør Sladesh-tilstanden op for én person ud fra Kanalens udfordringer.
 *
 * ## Hvorfor `brugt` kommer fra brugeren og ikke fra listen
 *
 * Cooldownen er per 12-timers blok (00–12 / 12–24), og stillingen ser kun
 * drikkedagen (10:00 → 10:00). De to grænser er bevidst forskellige, saa en
 * Sladesh sendt kl. 08:00 er stadig "brugt" kl. 11, selvom den ligger uden
 * for det, listen har hentet. `users.lastSladeshSentAt` kender hele
 * historikken og er allerede hentet, saa den er baade billigere og rigtigere.
 *
 * ## Hvorfor kun `completed` tæller som "tog"
 *
 * `failed` og `expired` er ikke noget, man tog — det er noget, man ikke nåede.
 * At tælle dem med ville gøre tallet til "hvor mange blev sendt efter dig",
 * hvilket er en anden og mindre interessant oplysning.
 */
export function sladeshForStilling(input: {
  udfordringer: readonly UdfordringLite[];
  brugerId: string;
  lastSladeshSentAt: number | undefined;
  now: number;
}): StillingSladesh {
  const { udfordringer, brugerId, lastSladeshSentAt, now } = input;

  let aktiv: StillingSladesh["aktiv"];
  let tog = 0;

  for (const udfordring of udfordringer) {
    const erModtager = udfordring.recipientId === brugerId;
    const erAfsender = udfordring.senderId === brugerId;
    if (!erModtager && !erAfsender) continue;

    if (erAktivStatus(udfordring.status)) {
      // Modtagerrollen vinder: er man på én gang udfordret og har en
      // udfordring ude, er det DEN, man skal handle på nu.
      if (aktiv === undefined || (erModtager && aktiv.rolle === "afsender")) {
        aktiv = {
          rolle: erModtager ? "modtager" : "afsender",
          deadlineAt: udfordring.deadlineAt,
          modpart: erModtager ? udfordring.senderName : udfordring.recipientName,
        };
      }
      continue;
    }

    if (erModtager && udfordring.status === "completed") tog++;
  }

  return {
    ...(aktiv !== undefined ? { aktiv } : {}),
    tog,
    brugt: erCooldownAktiv(lastSladeshSentAt, now),
  };
}

/**
 * Kører udfordringen LIGE NU?
 *
 * Grænsen for, hvem der ser bevisbillederne. `getLiveSladesh` viser dem til
 * hele Kanalen, mens den er sand, og `getSladeshHistorik` viser dem kun til
 * de to parter, når den ikke er. Derfor er den en egen, prøvet funktion og
 * ikke to linjer inde i en query: driver den, skifter det, hvem der kan se
 * et fotografi taget i en bar.
 *
 * Begge betingelser skal holde. En udfordring, hvis frist er passeret, men
 * som cron'en endnu ikke har nået at lukke, står stadig som `pending` — og
 * den er ikke live, uanset hvad statusfeltet siger.
 */
export function erLiveNu(
  status: SladeshStatus,
  deadlineAt: number,
  now: number,
): boolean {
  return !erAfsluttetStatus(status) && deadlineAt > now;
}

/**
 * Maa denne betragter se bevisbillederne?
 *
 * ## Beslutningen bag
 *
 * Graensen har flyttet sig to gange, og begge gange med vilje:
 *
 *   1. Kun de to parter. Nogensinde.
 *   2. + hele Kanalen, MENS udfordringen koerer (`getLiveSladesh`).
 *   3. + hele Kanalen, resten af DRIKKEDAGEN.
 *
 * Trin 3 loeser et konkret problem: livekortet forsvandt i samme sekund,
 * udfordringen blev gennemfoert, saa det faerdige billede — selve pointen —
 * naaede ingen at se. Man kan misse et oejeblik, der varer to minutter.
 *
 * ## Hvorfor drikkedagen og ikke for altid
 *
 * PUBLIKUM er uaendret fra trin 2: det er de samme kanalfaeller, der
 * allerede saa billederne live. Det, der aendrer sig, er TIDEN — fra ti
 * minutter til én aften.
 *
 * Et permanent, kanalbredt fotoarkiv over alle, der nogensinde har drukket,
 * er en anden slags produkt. Billederne er taget med telefonens kamera i en
 * bar, og der er ansigter og lokaler i baggrunden. Drikkedagen (10:00 →
 * 10:00) er appens egen graense og passer paa, hvordan folk taenker om en
 * bytur: den slutter, naar man vaagner.
 *
 * Aeldre end i aften: tilbage til de to parter. Den graense kan aabnes
 * senere, hvis nogen beder om det — den modsatte vej kan ikke.
 */
export function maaSeBeviser(input: {
  /** Afsender eller modtager. De to har altid adgang, uanset alder. */
  erPart: boolean;
  /** `completedAt ?? createdAt` — hvornaar udfordringen hoerer til. */
  afgjortAt: number;
  /** Drikkedagens start, `getDrinkDayStart(now)`. */
  dayStart: number;
}): boolean {
  if (input.erPart) return true;
  return input.afgjortAt >= input.dayStart;
}

/**
 * ─── KANALENS UDSIGT TIL EN SLADESH ──────────────────────────────────────
 *
 * En Sladesh var hidtil en samtale mellem to. Afsenderen fik at vide,
 * hvordan det gik, modtageren fik udfordringen — og resten af Kanalen
 * opdagede det kun, hvis de tilfaeldigvis havde stillingen aaben, mens det
 * stod paa. Det er en fejl i en app, hvis hele pointe er, at man foelger
 * med i hinandens aften: Sladesh er det mest dramatiske, der sker, og det
 * skete i stilhed for alle andre end de to.
 *
 * ## ÉT FORLOEB, ÉN NOTIFIKATION
 *
 * De tre oejeblikke — sendt, i gang, afgjort — er IKKE tre beskeder. De er
 * den samme besked, der bliver opdateret, og de deler derfor `tag`
 * (`sladeshKanaltag`). Telefonen erstatter den forrige i stedet for at
 * stable, saa Kanalen ser ÉN linje, der aendrer sig:
 *
 *   "Anders har sladeshet Mathias"
 *     → "Mathias er i gang"
 *       → "Mathias klarede den"
 *
 * Uden den faelles tag ville en aften med fem Sladesh give femten
 * notifikationer til alle. Med den giver den fem, og hver af dem staar paa
 * sit seneste. Det er forskellen paa at foelge med og at blive plaget.
 *
 * ## ALLE FIRE UDFALD, ikke kun det gode
 *
 * "Gennemfoert" alene ville efterlade Kanalen med et "er i gang", der
 * aldrig blev afsluttet — og en halv historie er vaerre end ingen. Naar
 * notifikationen alligevel erstatter sig selv, koster de tre oevrige
 * udfald ingenting i stoej.
 */

/** Alle tre oejeblikke i ét forloeb deler tag, saa de erstatter hinanden. */
export function sladeshKanaltag(challengeId: string): string {
  return `sladesh-kanal-${challengeId}`;
}

export type Kanalbegivenhed = "sendt" | "igang" | SladeshUdfald;

/**
 * Teksten til resten af Kanalen.
 *
 * `kanalNavn` som titel, praecis som `varslingUdeIAften` i
 * convex/kanaler.ts: det er Kanalen, der siger noget, ikke appen.
 */
export function sladeshKanalVarsling(input: {
  kanalNavn: string;
  afsenderNavn: string;
  modtagerNavn: string;
  begivenhed: Kanalbegivenhed;
}): { titel: string; tekst: string } {
  const afsender = input.afsenderNavn.trim() || SLADESH_UKENDT_AFSENDER;
  const modtager = input.modtagerNavn.trim() || SLADESH_UKENDT_AFSENDER;
  const titel = input.kanalNavn.trim() || "Kanalen";

  return { titel, tekst: kanaltekst(afsender, modtager, input.begivenhed) };
}

function kanaltekst(
  afsender: string,
  modtager: string,
  begivenhed: Kanalbegivenhed,
): string {
  switch (begivenhed) {
    case "sendt":
      return `🍺 ${afsender} har sladeshet ${modtager}`;
    /*
     * FOERSTE BILLEDE. Fasen hedder `filled_captured` — modtageren har
     * fotograferet den fyldte genstand — og det er det foerste
     * holdepunkt for, at hun rent faktisk er i gang frem for bare at
     * have faaet beskeden.
     */
    case "igang":
      return `📸 ${modtager} er i gang`;
    case "completed":
      return `✅ ${modtager} klarede den`;
    case "failed":
      return `🏳️ ${modtager} gav op`;
    case "expired": {
      const minutter = Math.round(SLADESH_TIME_LIMIT_MS / 60000);
      return `⏳ ${modtager} naaede det ikke paa ${minutter} minutter`;
    }
  }
}

