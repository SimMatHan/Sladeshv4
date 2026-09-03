/**
 * Push-reglerne som rene funktioner.
 *
 * Samme mønster som convex/messageRules.ts og convex/beaconRules.ts: ingen
 * import fra `_generated` og ingen `"use node"`, så de kan køres af
 * scripts/logic-test.ts uden et deployment. Det er også grunden til, at de
 * bor her og ikke i convex/push.ts — den fil er `"use node"` og trækker
 * `web-push` med sig.
 */

/**
 * Standardsubjektet, når `VAPID_SUBJECT` ikke er sat.
 *
 * En `https://`-URL frem for en `mailto:`. Push-tjenesternes krav er en URL
 * af én af de to slags, og en URL til et domæne, vi ejer, er sandere end en
 * mailadresse, der ikke findes. Den forrige standard var
 * `mailto:kontakt@sladesh.app` — et domæne, projektet ikke råder over, altså
 * et kontaktpunkt, ingen kunne svare på.
 */
export const VAPID_SUBJEKT_STANDARD = "https://sladeshapp.dk";

/** Præcis ét @, noget på hver side, og et punktum i domænedelen. */
const BAR_MAILADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type VapidSubjekt = {
  /** Værdien, der kan gives til webpush.setVapidDetails. Altid gyldig. */
  subjekt: string;
  /**
   * Hvad afsenderen bør have at vide. `null` når værdien var i orden, som
   * den stod — så er der ingen grund til at fylde loggen.
   */
  advarsel: string | null;
};

/**
 * Gør `VAPID_SUBJECT` til noget, `web-push` accepterer.
 *
 * BAGGRUNDEN. `web-push` kræver `mailto:` eller `https://` og **kaster** på
 * alt andet — nede fra `vapid-helper.js`, med et stakspor, der ikke nævner
 * ordet deploymentvariabel. Det ramte produktion ved cutoveren: subjektet var
 * sat til en bar mailadresse, `setVapidDetails` kastede, og hver eneste push
 * døde — mens broadcasten selv blev oprettet, som om intet var hændt. Fejlen
 * var altså kun synlig for den, der tilfældigvis åbnede `convex logs`.
 *
 * Tre udfald, og ingen af dem kaster:
 *
 * - **Gyldig** (`mailto:` eller `https://`) — bruges, som den står.
 * - **En bar mailadresse** — hensigten er entydig, så den får sit `mailto:`
 *   og en linje i loggen om, at den blev rettet. Vi retter den for
 *   afsendelsen, ikke i deploymentet; variablen står stadig forkert, og
 *   linjen er der for at sige det.
 * - **Usat eller uforståelig** — standarden ovenfor, og en linje om det.
 *
 * At falde tilbage frem for at springe over er et bevidst valg, og det ene
 * sted denne fil afviger fra "fail closed" i resten af push-vejen: manglende
 * NØGLER betyder, at der ikke KAN sendes, mens subjektet blot er et
 * kontaktpunkt for push-tjenesten. At tabe hver notifikation i appen, fordi
 * en kontaktstreng er skrevet forkert, står ikke i forhold til noget.
 */
export function vapidSubjekt(raa: string | undefined): VapidSubjekt {
  const vaerdi = (raa ?? "").trim();

  if (vaerdi.startsWith("mailto:") || vaerdi.startsWith("https://")) {
    return { subjekt: vaerdi, advarsel: null };
  }

  if (BAR_MAILADRESSE.test(vaerdi)) {
    return {
      subjekt: `mailto:${vaerdi}`,
      advarsel:
        "VAPID_SUBJECT er en bar mailadresse og skal være en URL. Bruger " +
        "mailto: foran den for denne afsendelse — ret variablen med: " +
        `npx convex env set --prod VAPID_SUBJECT "mailto:${vaerdi}"`,
    };
  }

  if (vaerdi === "") {
    return {
      subjekt: VAPID_SUBJEKT_STANDARD,
      advarsel: `VAPID_SUBJECT er ikke sat — bruger ${VAPID_SUBJEKT_STANDARD}`,
    };
  }

  return {
    subjekt: VAPID_SUBJEKT_STANDARD,
    advarsel:
      "VAPID_SUBJECT er hverken mailto: eller https:// og kan ikke bruges. " +
      `Bruger ${VAPID_SUBJEKT_STANDARD} i stedet`,
  };
}
