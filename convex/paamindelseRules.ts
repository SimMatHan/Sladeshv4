import { getDrinkDayStart, lokalDele } from "./constants";

/**
 * Fredags- og lørdagspåmindelsen — de rene regler.
 *
 * Appen har seks push-varslinger, og alle seks udløses af, at NOGEN gør
 * noget: en besked, en genstand, en Sladesh, en beacon. Det her er den
 * eneste, der udløses af, at der ikke sker noget — den findes netop for dem,
 * der ikke har åbnet appen endnu.
 *
 * Den fandtes i det gamle repo (`lastUsageReminderAt`, `lastUsageReminderSlot`
 * — 14 af 32 brugere havde felterne sat) og faldt ud under migreringen. Se
 * docs/datarevision.md, "Døde felter der kan droppes ved migrering", hvor den
 * står opført som en feature, der hørte til en senere fase.
 *
 * Reglerne ligger her og ikke i paamindelser.ts af samme grund som
 * `sladeshRules` og `beaconRules`: tiden er det, der kan gå galt, og en ren
 * funktion kan testes mod et konkret tidspunkt uden et deployment.
 */

/** Fredag og lørdag. `Date`-konventionen: 0 = søndag. */
const PAAMINDELSESDAGE = [5, 6] as const;

/**
 * Klokken 20 dansk tid.
 *
 * Sent nok til at være aftenens begyndelse frem for eftermiddag, og tidligt
 * nok til at nå folk, før de er gået. Det var også det tidspunkt, det gamle
 * repo brugte.
 */
const PAAMINDELSESTIME = 20;

/**
 * Er `now` et af de tidspunkter, hvor der skal mindes?
 *
 * ## Hvorfor det er et TIMEtjek og ikke et klokkeslæt i cron'en
 *
 * Convex-crons regnes i UTC. "Fredag kl. 20 dansk tid" er 18:00 UTC om
 * sommeren og 19:00 UTC om vinteren, så et fast UTC-klokkeslæt ville ramme
 * en time forkert det halve år — præcis den fælde, kommentaren øverst i
 * crons.ts advarer om, og grunden til at alle de andre job er `interval`.
 *
 * I stedet kører jobbet hver time på minut 0, og DENNE funktion afgør, om
 * den time er den rigtige. Så regnes dansk tid ét sted, af den samme
 * `lokaleDele`, som resten af appens døgngrænser bruger, og sommertid er
 * ikke længere noget, nogen skal huske.
 *
 * Ugedagen udledes af den LOKALE dato, ikke af `now` direkte: kl. 20 dansk
 * tid er stadig samme dag i UTC, men at bygge datoen op af de lokale dele er
 * det eneste, der også holder for de tidspunkter, hvor de to falder på hver
 * sin side af midnat.
 */
export function erPaamindelsestid(now: number): boolean {
  const { year, month, day, hour } = lokalDele(now);
  if (hour !== PAAMINDELSESTIME) return false;

  const ugedag = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (PAAMINDELSESDAGE as readonly number[]).includes(ugedag);
}

/**
 * Nøglen for den påmindelse, `now` hører til.
 *
 * Gemmes på brugeren, når hun er varslet, og sammenlignes ved næste kørsel.
 * Uden den ville et gentaget jobkald inden for samme time — en genkørsel,
 * en overlappende cron — sende påmindelsen igen.
 *
 * Drikkedagens start bruges som nøgle frem for et nyt tidsbegreb. Fredag kl.
 * 20 og lørdag kl. 20 ligger i hver sin drikkedag (10:00 → 10:00), så de to
 * skelnes af sig selv, og tallet betyder noget, man kan slå op, hvis en
 * bruger spørger, hvorfor hun ikke fik den.
 */
export function paamindelsesNoegle(now: number): number {
  return getDrinkDayStart(now);
}

/**
 * Teksten.
 *
 * Ingen navne og ingen tal. De fem andre varslinger handler om noget, en
 * bestemt person har gjort; denne handler om, at modtageren ikke har gjort
 * noget endnu, og en påmindelse, der lader som om den ved noget om aftenen,
 * ville lyde forkert for den, der sidder hjemme.
 */
export function paamindelsesVarsling(): { titel: string; tekst: string } {
  return {
    titel: "🍺 Er du ude i aften?",
    tekst: "Husk at logge dine genstande — så tæller de med på stillingen.",
  };
}
