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

/** 10 minutter. Fra SLADESH_TIME_LIMIT_MS i det gamle repo. */
export const SLADESH_TIME_LIMIT_MS = 10 * 60 * 1000;

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
 * Ændres fristen, ændres teksten med — ellers ville appen love ti minutter
 * og give noget andet.
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
