import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { aktiverPush, deaktiverPush, laesAbonnement, pushStoettet } from "../lib/push";
import { fejltekst } from "../lib/visning";

/**
 * Notifikationer — én tilstandsmaskine, to skærme.
 *
 * Indstillingerne har haft kontakten hele tiden. Opfordringen i toppen af
 * appen (Pushopfordring.tsx) skal kunne det SAMME med ét tryk — og et
 * abonnement, der oprettes to steder med hver sin kopi af logikken,
 * driver fra hinanden præcis når det gør ondt. Så: én hook, som begge
 * bruger, og som ejer både opslaget, skiftet og fejlteksten.
 *
 * ## Hvorfor der er syv tilstande og ikke to
 *
 * "Til/fra" er kun sandt for dem, der KAN. Resten af appens brugere fejler
 * på fire forskellige måder, og de fire kræver fire forskellige svar —
 * hvoraf de tre slet ikke er en knap:
 *
 *   ukendt          vi har ikke set efter endnu; vis ingenting
 *   iosudenhjem     iPhone i en Safari-fane; løsningen er hjemmeskærmen
 *   ikkestoettet    browseren har ikke API'et; der er ingen løsning
 *   afvist          browseren HUSKER et nej; kun browserens egne
 *                   indstillinger kan omgøre det, ikke vores knap
 *   serverklarikke  VAPID-nøglerne mangler; brugerens skyld er det ikke
 *   fra             kan, vil måske; her giver en knap mening
 *   til             kører
 *
 * En knap, der ikke kan virke, er værre end ingen knap: den flytter skylden
 * over på brugeren for noget, hun ikke kan gøre ved.
 */
export type Pushstatus =
  | "ukendt"
  | "iosudenhjem"
  | "ikkestoettet"
  | "afvist"
  | "serverklarikke"
  | "fra"
  | "til";

/**
 * iPhone i en almindelig Safari-fane.
 *
 * Web Push virker på iOS, men KUN når appen er føjet til hjemmeskærmen.
 * `pushStoettet()` kan ikke se forskel — den melder bare, at API'et ikke er
 * der — og "din browser understøtter ikke notifikationer" er et forkert og
 * håbløst svar til en, der er ét menupunkt fra at kunne.
 *
 * Ingen UA-sniffning af version eller model: vi spørger kun, om det er
 * iOS-familien, og om vi kører installeret. iPadOS melder sig som "Mac", så
 * den fanges på berøringsskærmen — en rigtig Mac har `maxTouchPoints` 0.
 */
function erIOSUdenHjemmeskaerm(): boolean {
  if (typeof window === "undefined") return false;

  const installeret =
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safaris egen, ældre variant. Kun den findes på iOS.
    (navigator as { standalone?: boolean }).standalone === true;
  if (installeret) return false;

  const ua = navigator.userAgent;
  const iPhone = /iPad|iPhone|iPod/.test(ua);
  const iPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return iPhone || iPad;
}

export function usePush() {
  const vapidNoegle = useQuery(api.pushAbonnementer.getVapidPublicKey, {});
  const gemAbonnement = useMutation(api.pushAbonnementer.gemAbonnement);
  const sletAbonnement = useMutation(api.pushAbonnementer.sletAbonnement);

  // Kun det, browseren fortæller os. Serverens del (VAPID-nøglen) lægges
  // ovenpå nedenfor, så en nøgle, der lander sent, ikke kræver et nyt opslag
  // mod `PushManager`.
  const [browserstatus, setBrowserstatus] = useState<
    "ukendt" | "iosudenhjem" | "ikkestoettet" | "afvist" | "fra" | "til"
  >("ukendt");
  const [arbejder, setArbejder] = useState(false);
  const [fejl, setFejl] = useState<string | undefined>();

  useEffect(() => {
    if (!pushStoettet()) {
      setBrowserstatus(erIOSUdenHjemmeskaerm() ? "iosudenhjem" : "ikkestoettet");
      return;
    }

    // Et gemt nej slås op FØR abonnementet: `getSubscription()` giver `null`
    // både for "har aldrig spurgt" og "sagde nej", og de to skal ikke have
    // samme knap.
    if (Notification.permission === "denied") {
      setBrowserstatus("afvist");
      return;
    }

    let gaeldende = true;
    laesAbonnement()
      .then((abonnement) => {
        if (gaeldende) setBrowserstatus(abonnement !== null ? "til" : "fra");
      })
      .catch(() => {
        if (gaeldende) setBrowserstatus("fra");
      });

    // Arket kan lukkes, mens opslaget kører. Uden dette sætter det tilstand
    // på en komponent, der ikke er der længere.
    return () => {
      gaeldende = false;
    };
  }, []);

  const status: Pushstatus =
    browserstatus === "fra" && (vapidNoegle === undefined || vapidNoegle === "")
      ? "serverklarikke"
      : browserstatus;

  /**
   * Slår til eller fra — modsat af hvad status siger nu.
   *
   * `Notification.requestPermission()` SKAL nås inden for det klik, brugeren
   * lavede. Derfor ligger nøglen i en `useQuery`, der for længst er hentet,
   * og ikke i en `await` her: en tur over Convex mellem klikket og
   * tilladelsesdialogen får nogle browsere til at afvise dialogen helt.
   */
  const skift = useCallback(async () => {
    setArbejder(true);
    setFejl(undefined);

    try {
      if (browserstatus === "til") {
        const endpoint = await deaktiverPush();
        if (endpoint !== undefined) await sletAbonnement({ endpoint });
        setBrowserstatus("fra");
        return;
      }

      if (vapidNoegle === undefined || vapidNoegle === "") {
        throw new Error("Notifikationer er ikke sat op på serveren endnu.");
      }

      const noegler = await aktiverPush(vapidNoegle);
      await gemAbonnement(noegler);
      setBrowserstatus("til");
    } catch (error) {
      // Siger brugeren nej i dialogen, husker browseren det. Knappen ville
      // fra nu af ikke kunne noget, så tilstanden skal følge med.
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        setBrowserstatus("afvist");
      }
      // `fejltekst()` er skrevet til `ConvexError` og ville gemme browserens
      // egen besked ("du sagde nej", "ikke understøttet") bag en generisk
      // reserve — her er den rigtige besked netop den, brugeren skal se.
      setFejl(error instanceof Error ? error.message : fejltekst(error));
    } finally {
      setArbejder(false);
    }
  }, [browserstatus, vapidNoegle, gemAbonnement, sletAbonnement]);

  return { status, arbejder, fejl, skift };
}
