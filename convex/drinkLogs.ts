import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getSize } from "./constants";
import { computeStreak, pointsForDrink } from "./streaks";

/**
 * Drikkelogning.
 *
 * `logDrink` skriver rækken OG brugerens afledte tal i én transaktion. I den
 * gamle app var stats spredt over `increment()`-kald på brugerdokumentet, og
 * de kunne komme ud af trit med selve logrækkerne. Her er logrækken
 * sandhedskilden, og felterne på brugeren er kun en genvej for de tal der er
 * dyre at genberegne (stræk og livstidspoint).
 *
 * Stræk-reglerne er dokumenteret i convex/streaks.ts.
 */

export const logDrink = mutation({
  args: {
    userId: v.id("users"),
    categoryId: v.string(),
    variationName: v.string(),
    channelId: v.optional(v.id("kanaler")),
    sizeId: v.optional(v.string()),
    location: v.optional(v.object({ lat: v.number(), lng: v.number() })),
  },
  handler: async (ctx, args): Promise<Id<"drinkLogs">> => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Brugeren findes ikke.",
      });
    }

    if (
      args.channelId !== undefined &&
      !user.joinedChannelIds.includes(args.channelId)
    ) {
      console.log("[DrinkLog] afvist — ikke medlem af kanalen", {
        userId: args.userId,
        channelId: args.channelId,
      });
      throw new ConvexError({
        code: "NOT_A_MEMBER",
        message: "Brugeren er ikke medlem af den angivne Kanal.",
      });
    }

    const now = Date.now();
    const size = getSize(args.sizeId, args.categoryId);

    // Snapshot af brugeren, så historikken ikke ændrer sig hvis brugeren
    // senere skifter navn eller avatar.
    const logId = await ctx.db.insert("drinkLogs", {
      userId: args.userId,
      channelId: args.channelId,
      categoryId: args.categoryId,
      variationName: args.variationName,
      sizeId: size?.id,
      sizeMultiplier: size?.multiplier,
      sizeLabel: size?.label,
      sizeVolume: size?.volumeLabel,
      location: args.location,
      timestamp: now,
      userDisplayName: user.displayName,
      userEmoji: user.emoji,
      userProfileEmoji: user.profileEmoji,
      userProfileGradient: user.profileGradient,
    });

    // Samme transaktion: brugerens afledte tal.
    const streak = computeStreak({
      now,
      lastDrinkAt: user.lastDrinkAt,
      currentDayStreak: user.currentDayStreak,
      longestStreak: user.longestStreak,
      categoryId: args.categoryId,
    });

    const points = pointsForDrink(args.categoryId, size?.multiplier);

    await ctx.db.patch(args.userId, {
      totalPoints: (user.totalPoints ?? 0) + points,
      currentDayStreak: streak.currentDayStreak,
      longestStreak: streak.longestStreak,
      // `lastDrinkAt` og `lastDrinkDayStart` flyttes kun af rigtige
      // drikkevarer — en cigaret skal ikke holde en stræk i live.
      ...(streak.changed
        ? { lastDrinkAt: now, lastDrinkDayStart: streak.drinkDayStart }
        : {}),
      ...(args.location !== undefined
        ? { location: { ...args.location, lastUpdated: now } }
        : {}),
      updatedAt: now,
    });

    console.log("[DrinkLog] registreret", {
      logId,
      userId: args.userId,
      kategori: args.categoryId,
      variant: args.variationName,
      størrelse: size?.label,
      point: points,
      stræk: streak.currentDayStreak,
    });

    return logId;
  },
});

/**
 * Nulstiller brugerens igangværende run.
 *
 * Sletter ikke historik — der indsættes en `isReset`-række, præcis som i det
 * gamle repo, så nulstillingen selv er en hændelse man kan tælle
 * (achievementet "Are you sure about that?" tæller netop disse).
 */
export const resetRun = mutation({
  args: {
    userId: v.id("users"),
    channelId: v.optional(v.id("kanaler")),
  },
  handler: async (ctx, args): Promise<Id<"drinkLogs">> => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Brugeren findes ikke.",
      });
    }

    const now = Date.now();
    const logId = await ctx.db.insert("drinkLogs", {
      userId: args.userId,
      channelId: args.channelId,
      categoryId: "other",
      variationName: "Run nulstillet",
      timestamp: now,
      isReset: true,
      userDisplayName: user.displayName,
    });

    await ctx.db.patch(args.userId, {
      totalRunResets: (user.totalRunResets ?? 0) + 1,
      updatedAt: now,
    });

    console.log("[DrinkLog] run nulstillet", {
      userId: args.userId,
      nulstillinger: (user.totalRunResets ?? 0) + 1,
    });

    return logId;
  },
});

export const getDrinkLogsForUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("drinkLogs")
      .withIndex("by_user_and_timestamp", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});
