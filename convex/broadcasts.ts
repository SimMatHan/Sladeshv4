import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireCurrentUser } from "./identity";

/**
 * Broadcasts — admin-beskeder til alle.
 *
 * ## Hvorfor det ikke er en kø
 *
 * I det gamle repo var en broadcast en ORDRE. Admin skrev et dokument med
 * `status: "pending"`, `onBroadcastCreated` vågnede, satte status til
 * "processing", fanede beskeden ud som push til hver enkelt modtager og
 * stemplede resultatet tilbage på dokumentet. Rækken var et jobkort, og når
 * jobbet var kørt, var beskeden væk fra appen.
 *
 * Push-kanalen findes ikke i v4 endnu — fase 7 byggede udvælgelsen af
 * modtagere, ikke leveringen. En broadcast er derfor en TILSTAND her: den er
 * aktiv, indtil den udløber eller slås fra, og appen viser den som en bjælke,
 * brugeren kan lukke. Det virker uden push, og rækkerne ligger klar til at
 * blive fanet ud den dag kanalen findes.
 *
 * Derfor er der intet `status`-felt og ingen idempotens-vagt. Der er ingen kø
 * at være i, og ingen funktion der kan komme til at køre den samme række to
 * gange.
 */

export const TITEL_MAX = 80;
export const BROEDTEKST_MAX = 400;

/**
 * Opretter en broadcast. Kun admins.
 *
 * Uden `channelId` gælder den alle; med den kun Kanalens medlemmer.
 */
export const opretBroadcast = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    channelId: v.optional(v.id("kanaler")),
    /** Antal timer broadcasten skal stå. Uden den står den, til den slås fra. */
    timer: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"broadcasts">> => {
    const admin = await requireAdmin(ctx);

    const title = kraeverTekst(args.title, "Overskriften", TITEL_MAX);
    const body = kraeverTekst(args.body, "Beskeden", BROEDTEKST_MAX);

    if (args.channelId !== undefined) {
      const kanal = await ctx.db.get(args.channelId);
      if (kanal === null) {
        throw new ConvexError({
          code: "KANAL_NOT_FOUND",
          message: "Kanalen findes ikke.",
        });
      }
      // En arkiveret Kanal har ingen medlemmer tilbage, så broadcasten ville
      // ikke nå nogen.
      if (kanal.archived === true) {
        throw new ConvexError({
          code: "KANAL_ARCHIVED",
          message: `Kanalen "${kanal.name}" er lukket.`,
        });
      }
    }

    const now = Date.now();

    if (args.timer !== undefined && (!Number.isFinite(args.timer) || args.timer <= 0)) {
      throw new ConvexError({
        code: "INVALID_DURATION",
        message: "Varigheden skal være et positivt antal timer.",
      });
    }

    const broadcastId = await ctx.db.insert("broadcasts", {
      title,
      body,
      channelId: args.channelId,
      active: true,
      expiresAt:
        args.timer === undefined ? undefined : now + args.timer * 60 * 60 * 1000,
      createdBy: admin._id,
      createdAt: now,
    });

    console.log("[Admin] broadcast oprettet", {
      broadcastId,
      global: args.channelId === undefined,
    });

    return broadcastId;
  },
});

/**
 * De broadcasts, den indloggede bruger skal se lige nu.
 *
 * Både de globale og dem, der er målrettet en Kanal, hun er medlem af.
 * Udløbne frafiltreres ved LÆSNING frem for at blive ryddet af et cron-job:
 * en udløbet broadcast skal forsvinde på sekundet, ikke ved næste kørsel, og
 * en query kan ikke skrive.
 */
export const getMineBroadcasts = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Doc<"broadcasts">[]> => {
    const user = await requireCurrentUser(ctx);
    const now = args.now ?? Date.now();

    const aktive = await ctx.db
      .query("broadcasts")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    const mine = aktive.filter((broadcast) => {
      if (broadcast.expiresAt !== undefined && broadcast.expiresAt <= now) {
        return false;
      }
      if (broadcast.channelId === undefined) return true;
      return user.joinedChannelIds.includes(broadcast.channelId);
    });

    // Nyeste først, så den seneste besked står øverst.
    mine.sort((a, b) => b.createdAt - a.createdAt);
    return mine;
  },
});

/**
 * Alle broadcasts, aktive som slukkede. Kun admins — det er historikken over,
 * hvad der er sendt ud.
 */
export const getAlleBroadcasts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Doc<"broadcasts">[]> => {
    await requireAdmin(ctx);
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);

    return await ctx.db
      .query("broadcasts")
      .withIndex("by_created_at")
      .order("desc")
      .take(limit);
  },
});

/** Slår en broadcast fra. Kun admins. */
export const deaktiverBroadcast = mutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx);

    const broadcast = await ctx.db.get(args.broadcastId);
    if (broadcast === null) {
      throw new ConvexError({
        code: "BROADCAST_NOT_FOUND",
        message: "Broadcasten findes ikke.",
      });
    }

    // Idempotent: en allerede slukket broadcast er ikke en fejl.
    if (!broadcast.active) return;

    await ctx.db.patch(args.broadcastId, {
      active: false,
      deactivatedAt: Date.now(),
    });

    console.log("[Admin] broadcast slukket", { broadcastId: args.broadcastId });
  },
});

function kraeverTekst(vaerdi: string, etiket: string, max: number): string {
  const trimmet = vaerdi.trim();
  if (trimmet.length === 0) {
    throw new ConvexError({
      code: "EMPTY_FIELD",
      message: `${etiket} må ikke være tom.`,
    });
  }
  if (trimmet.length > max) {
    throw new ConvexError({
      code: "FIELD_TOO_LONG",
      message: `${etiket} må højst fylde ${max} tegn (var ${trimmet.length}).`,
    });
  }
  return trimmet;
}
