/**
 * Chat-reglerne som rene funktioner.
 *
 * Samme mønster som convex/sladeshRules.ts og convex/streaks.ts: ingen import
 * fra `_generated`, så de kan køres af scripts/logic-test.ts uden et
 * deployment.
 *
 * Rekonstrueret fra det gamle repos src/services/messageService.ts og
 * functions/src/scheduled/deleteOldMessages.ts.
 */

/**
 * Beskeder slettes efter 24 timer.
 *
 * Fra runDeleteOldMessages i det gamle repo, hvor grænsen var begrundet i
 * privatliv ("GDPR/Privacy compliance"). Værdien er overtaget uændret.
 */
export const BESKED_LEVETID_MS = 24 * 60 * 60 * 1000;

/**
 * Længdegrænse per besked. NY regel — det gamle repo havde ingen.
 *
 * Uden en grænse kan en enkelt besked vokse mod Convex' dokumentgrænse, og
 * fordi hele kanalens historik hentes i én query ville få lange beskeder
 * kunne sprænge svaret for alle. 2000 tegn er rigeligt til en chatbesked.
 */
export const BESKED_MAX_LAENGDE = 2000;

/** Hvor mange beskeder oprydningen tager per kørsel. */
export const SLET_BATCH = 200;

/**
 * Fallbacks for afsender-snapshottet. Ordret fra messageService.sendMessage —
 * også `"Anonymous"`, som er engelsk i den gamle app. Værdien ligger i data,
 * så den oversættes ikke her; det ville gøre gamle og nye beskeder uens.
 */
export const AFSENDER_STANDARD_NAVN = "Anonymous";
export const AFSENDER_STANDARD_EMOJI = "👤";
export const AFSENDER_STANDARD_GRADIENT = "from-gray-400 to-gray-600";

export type BeskedFejl = "EMPTY_MESSAGE" | "MESSAGE_TOO_LONG";

/** Beskeder gemmes trimmet — som i det gamle repo. */
export function trimBesked(raa: string): string {
  return raa.trim();
}

/**
 * Hvad er der galt med teksten? `null` betyder "ingenting".
 *
 * Returnerer en kode frem for at kaste, så reglen kan afprøves uden
 * Convex-runtime. Kalderen oversætter koden til en ConvexError.
 */
export function beskedFejl(trimmet: string): BeskedFejl | null {
  if (trimmet.length === 0) return "EMPTY_MESSAGE";
  if (trimmet.length > BESKED_MAX_LAENGDE) return "MESSAGE_TOO_LONG";
  return null;
}

/**
 * Er der ulæste beskeder i en Kanal?
 *
 * Overtaget fra messageService.hasUnreadMessages, inklusive de to
 * grænsetilfælde: en tom Kanal har aldrig noget ulæst, og en Kanal man
 * ALDRIG har åbnet har det altid, hvis den indeholder mindst én besked.
 */
export function harUlaeste(
  senestSetAt: number | undefined,
  senesteBeskedAt: number | undefined,
): boolean {
  if (senesteBeskedAt === undefined) return false;
  if (senestSetAt === undefined) return true;
  return senesteBeskedAt > senestSetAt;
}

/** Beskeder ældre end dette tidspunkt skal slettes. */
export function graenseForGamleBeskeder(now: number): number {
  return now - BESKED_LEVETID_MS;
}
