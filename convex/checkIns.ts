import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Check In.
 *
 * Historik-rækken og de afledte felter på brugeren skrives i SAMME mutation.
 * Convex-mutations er transaktionelle, så enten lander begge dele eller ingen
 * af dem — i den gamle Firebase-app var det to separate writes, der kunne
 * divergere hvis den anden fejlede.
 */

export const checkIn = mutation({
  args: {
    userId: v.id("users"),
    venue: v.string(),
    channelId: v.optional(v.id("kanaler")),
    location: v.optional(v.object({ lat: v.number(), lng: v.number() })),
  },
  handler: async (ctx, args): Promise<Id<"checkIns">> => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Brugeren findes ikke.",
      });
    }

    if (args.channelId !== undefined) {
      if (!user.joinedChannelIds.includes(args.channelId)) {
        console.log("[CheckIn] afvist — ikke medlem af kanalen", {
          userId: args.userId,
          channelId: args.channelId,
        });
        throw new ConvexError({
          code: "NOT_A_MEMBER",
          message: "Brugeren er ikke medlem af den angivne Kanal.",
        });
      }
    }

    const now = Date.now();

    const checkInId = await ctx.db.insert("checkIns", {
      userId: args.userId,
      channelId: args.channelId,
      venue: args.venue,
      location: args.location ?? null,
      timestamp: now,
    });

    // Samme transaktion: brugerens Check In-tilstand.
    await ctx.db.patch(args.userId, {
      checkInStatus: true,
      lastCheckIn: now,
      lastCheckInVenue: args.venue,
      checkInCount: (user.checkInCount ?? 0) + 1,
      // Ved check-in med position opdateres både `currentLocation` og den
      // live `location`, som kortet læser — som i det gamle checkInService.
      ...(args.location !== undefined
        ? {
            currentLocation: {
              lat: args.location.lat,
              lng: args.location.lng,
              venue: args.venue,
              timestamp: now,
            },
            location: {
              lat: args.location.lat,
              lng: args.location.lng,
              lastUpdated: now,
            },
          }
        : {}),
      // Check-in i en Kanal gør den samtidig til den aktive.
      ...(args.channelId !== undefined ? { activeChannelId: args.channelId } : {}),
      updatedAt: now,
    });

    console.log("[CheckIn] registreret", {
      checkInId,
      userId: args.userId,
      venue: args.venue,
      antal: (user.checkInCount ?? 0) + 1,
    });

    return checkInId;
  },
});

/** Melder brugeren ud igen. Historikken røres ikke. */
export const checkOut = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<void> => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Brugeren findes ikke.",
      });
    }

    await ctx.db.patch(args.userId, {
      checkInStatus: false,
      currentLocation: null,
      lastStatusCheckedAt: Date.now(),
      updatedAt: Date.now(),
    });

    console.log("[CheckIn] checket ud", { userId: args.userId });
  },
});

export const getCheckInsForUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkIns")
      .withIndex("by_user_and_timestamp", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});
