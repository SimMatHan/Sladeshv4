import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireCurrentUser } from "./identity";

/**
 * Web Push-abonnementer — se schema.ts for hvorfor formen er, som den er.
 *
 * Selve AFSENDELSEN ligger i convex/push.ts, som er en "use node"-action:
 * kryptering af beskeden og JWT-signering af VAPID-headeren kræver Node'ens
 * `crypto`, som den almindelige V8-runtime ikke har. Actions kan ikke røre
 * `ctx.db` direkte, så de to interne funktioner her (`listeForBruger`,
 * `sletInternt`) er broen mellem dem og databasen.
 */

/**
 * Den offentlige VAPID-nøgle, som browseren skal bruge til at abonnere.
 *
 * Læses fra en Convex-deploymentvariabel (`npx convex env set
 * VAPID_PUBLIC_KEY …`), ikke fra en `VITE_`-variabel — så nøglen kan skiftes
 * uden en ny frontend-bygning, og så klienten altid har den nøgle,
 * serveren rent faktisk signerer med. Tom streng betyder "ikke sat op endnu"
 * — UI'et viser da en forklaring i stedet for en knap, der ville fejle.
 */
export const getVapidPublicKey = query({
  args: {},
  handler: async (): Promise<string> => {
    return process.env.VAPID_PUBLIC_KEY ?? "";
  },
});

/**
 * Gemmer (eller opdaterer) abonnementet for denne enhed.
 *
 * Upsert på `endpoint`: samme enhed, der abonnerer igen — fx efter at have
 * slået notifikationer fra og til — skal opdatere sin egen række, ikke
 * stable en ny oveni.
 */
export const gemAbonnement = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();

    const eksisterende = await ctx.db
      .query("pushAbonnementer")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();

    if (eksisterende === null) {
      await ctx.db.insert("pushAbonnementer", {
        userId: user._id,
        endpoint: args.endpoint,
        p256dh: args.p256dh,
        auth: args.auth,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Samme enhed kan i teorien skifte hænder (en delt bærbar); den nyeste
      // `gemAbonnement`-kalder er den, der reelt ejer den nu.
      await ctx.db.patch(eksisterende._id, {
        userId: user._id,
        p256dh: args.p256dh,
        auth: args.auth,
        updatedAt: now,
      });
    }

    console.log("[Push] abonnement gemt", { userId: user._id });
  },
});

/**
 * Fjerner abonnementet for denne enhed — brugeren har selv slået
 * notifikationer fra.
 *
 * Idempotent: et allerede fjernet abonnement (fx renset af en fejlet
 * afsendelse, se push.ts) er ikke en fejl at slette igen.
 */
export const sletAbonnement = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireCurrentUser(ctx);

    const raekke = await ctx.db
      .query("pushAbonnementer")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();

    if (raekke === null) return;
    // Kun ejeren kan slette sit eget abonnement.
    if (raekke.userId !== user._id) return;

    await ctx.db.delete(raekke._id);
    console.log("[Push] abonnement slettet", { userId: user._id });
  },
});

/** Interne broer for convex/push.ts — se filens docstring. */

export const listeForBruger = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<Doc<"pushAbonnementer">[]> => {
    return await ctx.db
      .query("pushAbonnementer")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const sletInternt = internalMutation({
  args: { abonnementId: v.id("pushAbonnementer") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.delete(args.abonnementId);
  },
});
