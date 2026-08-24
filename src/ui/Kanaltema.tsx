import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Kanaltemaet.
 *
 * Sætter `data-tema` på `<html>`, når admin har slået et festivaltema til OG
 * brugeren står i den Kanal, temaet hører til. Selve farverne ligger som
 * token-overskrivninger i index.css — se `:root[data-tema="…"]`.
 *
 * ## Hvorfor et attribut og ikke inline styles
 *
 * Det gamle repos `ChannelThemeContext` skrev hver enkelt CSS-variabel
 * direkte på `document.documentElement.style` og animerede dem over 300 ms
 * med `requestAnimationFrame` og HSL-interpolation — omkring 150 linjer, der
 * skulle holdes i sync med farvenavnene i CSS'en.
 *
 * Her er det ét attribut. Farverne bor, hvor alle andre farver bor, og
 * skiftet kan laves med en almindelig CSS-transition, hvis vi vil have en.
 * Inline styles vandt desuden altid over det lyse tema, så lysmode var i
 * praksis slået fra, mens et tema var aktivt; et attribut på `:root` har
 * højere specificitet end `:root` alene og behøver ikke det trick.
 *
 * ## Hvorfor NAVNET og ikke id'et
 *
 * Det gamle repo nøglede på hårdkodede Firestore-dokument-id'er:
 *
 *     const BALLADE_CHANNEL_ID = "H9nTuTPTWoA7E2kXOxxB";
 *
 * De id'er findes ikke i Convex. En ordret portering ville oversætte rent,
 * typetjekke grønt — og aldrig matche noget som helst. Kanalnavnene er
 * derimod kanoniske og bevares ordret gennem hele migreringen (se README),
 * så navnet er det stabile at nøgle på.
 */

/**
 * Kanalen festivaltemaerne hører til.
 *
 * Serversiden kender kun temaets NAVN (`indstillinger.balladeTema`), ikke
 * hvilken Kanal det gælder — så koblingen står her. Omdøbes Kanalen i
 * databasen, holder temaet op med at male, og det er den rigtige måde at
 * fejle: ingen farver er bedre end farver på den forkerte Kanal.
 */
const TEMA_KANAL = "Ballade";

export function Kanaltema({ channelId }: { channelId: Id<"kanaler"> | undefined }) {
  const tema = useQuery(api.indstillinger.getBalladeTema, {});
  const kanal = useQuery(
    api.kanaler.getKanal,
    channelId === undefined ? "skip" : { channelId },
  );

  // Tom streng betyder "intet tema" — se BALLADE_TEMAER i
  // convex/indstillinger.ts. `undefined` betyder "henter endnu".
  const aktivt =
    kanal?.name === TEMA_KANAL && tema !== undefined && tema !== ""
      ? tema
      : undefined;

  useEffect(() => {
    const rod = document.documentElement;

    if (aktivt === undefined) {
      rod.removeAttribute("data-tema");
      return;
    }

    rod.setAttribute("data-tema", aktivt);
    console.log("[UI] kanaltema sat", { tema: aktivt, kanal: TEMA_KANAL });

    // Ryddes når man skifter Kanal eller admin slår temaet fra. Uden det ville
    // farverne blive hængende på en Kanal, de ikke hører til.
    return () => rod.removeAttribute("data-tema");
  }, [aktivt]);

  return null;
}
