"use node";

import { v } from "convex/values";
import webpush from "web-push";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

/**
 * Afsendelse af Web Push.
 *
 * En "use node"-fil: kryptering af beskeden (RFC 8291) og JWT-signering af
 * VAPID-headeren (RFC 8292) kræver Node'ens `crypto`-modul, som den
 * almindelige Convex-runtime (et V8-isolat, ikke Node) ikke har. `web-push`
 * er derfor den ENESTE afvigelse fra appens ellers håndrullede tilgang til
 * kryptografi — at genopfinde ECDH/HKDF/aes128gcm for en funktion, ingen kan
 * klikke sig igennem herfra og se virke, er ikke stedet at spare en
 * afhængighed. Den lever kun her: den bliver aldrig bundlet til klienten.
 *
 * Actions kan ikke røre `ctx.db` direkte — `pushAbonnementer.listeForBruger`
 * og `.sletInternt` (convex/pushAbonnementer.ts) er broen til databasen.
 *
 * ## Ingen VAPID-nøgler endnu?
 *
 * `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` sættes som Convex-deploymentvariabler
 * (`npx convex env set`), ikke i denne fil. Uden dem er der ingenting at
 * signere med, og funktionen springer stille over — se docs/notifikationer.md.
 */

/** `behold: false` betyder "slet rækken" — se sendTilAbonnement. */
type Modtagelse = { abonnement: Doc<"pushAbonnementer">; behold: boolean };

async function sendTilAbonnement(
  abonnement: Doc<"pushAbonnementer">,
  payload: string,
): Promise<Modtagelse> {
  try {
    await webpush.sendNotification(
      {
        endpoint: abonnement.endpoint,
        keys: { p256dh: abonnement.p256dh, auth: abonnement.auth },
      },
      payload,
    );
    return { abonnement, behold: true };
  } catch (fejl) {
    const statusCode = (fejl as { statusCode?: number } | null)?.statusCode;
    // 404/410: push-tjenesten selv siger abonnementet er dødt — appen er
    // afinstalleret, eller browserens data er ryddet. Enhver anden fejl
    // (fx et midlertidigt udfald hos push-tjenesten) må IKKE koste brugeren
    // abonnementet, så den beholdes og forsøges igen næste gang.
    const doedt = statusCode === 404 || statusCode === 410;
    if (doedt) {
      console.log("[Push] dødt abonnement fjernet", { statusCode });
    } else {
      console.error("[Push] afsendelse fejlede", { statusCode });
    }
    return { abonnement, behold: !doedt };
  }
}

/**
 * Sender til alle en brugers enheder.
 *
 * Kaldes fra mutations via `ctx.scheduler.runAfter(0, …)` — ALDRIG direkte,
 * for en mutation kan ikke kalde en action og vente på den, og skal heller
 * ikke: beskeden er allerede sendt/broadcasten allerede oprettet, uanset om
 * push lykkes.
 */
export const sendTilBrugere = internalAction({
  args: {
    userIds: v.array(v.id("users")),
    title: v.string(),
    body: v.string(),
    /** Grupperer beskeder, så en ulæst telefon ikke drukner i ét pip pr. linje. */
    tag: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (publicKey === undefined || privateKey === undefined) {
      console.log("[Push] VAPID-nøgler er ikke sat op på deploymentet — springer over");
      return;
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:kontakt@sladesh.app",
      publicKey,
      privateKey,
    );

    const payload = JSON.stringify({ title: args.title, body: args.body, tag: args.tag });

    const modtagelser: Modtagelse[] = [];
    for (const userId of args.userIds) {
      const abonnementer: Doc<"pushAbonnementer">[] = await ctx.runQuery(
        internal.pushAbonnementer.listeForBruger,
        { userId },
      );
      const svar = await Promise.all(
        abonnementer.map((abonnement) => sendTilAbonnement(abonnement, payload)),
      );
      modtagelser.push(...svar);
    }

    const doede = modtagelser.filter((m) => !m.behold);
    await Promise.all(
      doede.map((m) =>
        ctx.runMutation(internal.pushAbonnementer.sletInternt, {
          abonnementId: m.abonnement._id,
        }),
      ),
    );

    console.log("[Push] sendt", {
      modtagere: args.userIds.length,
      forsoegt: modtagelser.length,
      fejlet: doede.length,
    });
  },
});
