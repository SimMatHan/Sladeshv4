import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getSize } from "./constants";
import { requireCanViewUser, requireCurrentUser } from "./identity";
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
 * Man kan kun logge for sig selv; identiteten kommer fra tokenet.
 *
 * Stræk-reglerne er dokumenteret i convex/streaks.ts.
 */

export const logDrink = mutation({
  args: {
    categoryId: v.string(),
    variationName: v.string(),
    channelId: v.optional(v.id("kanaler")),
    sizeId: v.optional(v.string()),
    location: v.optional(v.object({ lat: v.number(), lng: v.number() })),
  },
  handler: async (ctx, args): Promise<Id<"drinkLogs">> => {
    const user = await requireCurrentUser(ctx);

    if (
      args.channelId !== undefined &&
      !user.joinedChannelIds.includes(args.channelId)
    ) {
      console.log("[DrinkLog] afvist — ikke medlem af kanalen", {
        userId: user._id,
        channelId: args.channelId,
      });
      throw new ConvexError({
        code: "NOT_A_MEMBER",
        message: "Du er ikke medlem af den angivne Kanal.",
      });
    }

    const now = Date.now();
    const size = getSize(args.sizeId, args.categoryId);

    // Snapshot af brugeren, så historikken ikke ændrer sig hvis brugeren
    // senere skifter navn eller avatar.
    const logId = await ctx.db.insert("drinkLogs", {
      userId: user._id,
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
      sizeMultiplier: size?.multiplier,
    });

    const points = pointsForDrink(args.categoryId, size?.multiplier);

    await ctx.db.patch(user._id, {
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
      userId: user._id,
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
 * Nulstiller den indloggede brugers igangværende run.
 *
 * Sletter ikke historik — der indsættes en `isReset`-række, præcis som i det
 * gamle repo, så nulstillingen selv er en hændelse man kan tælle
 * (achievementet "Are you sure about that?" tæller netop disse).
 */
export const resetRun = mutation({
  args: {
    channelId: v.optional(v.id("kanaler")),
  },
  handler: async (ctx, args): Promise<Id<"drinkLogs">> => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();

    const logId = await ctx.db.insert("drinkLogs", {
      userId: user._id,
      channelId: args.channelId,
      categoryId: "other",
      variationName: "Run nulstillet",
      timestamp: now,
      isReset: true,
      userDisplayName: user.displayName,
    });

    await ctx.db.patch(user._id, {
      totalRunResets: (user.totalRunResets ?? 0) + 1,
      updatedAt: now,
    });

    console.log("[DrinkLog] run nulstillet", {
      userId: user._id,
      nulstillinger: (user.totalRunResets ?? 0) + 1,
    });

    return logId;
  },
});

/**
 * Drikkelogninger.
 *
 * Uden `userId` returneres ens egne. Med `userId` kræves det, at man deler
 * mindst én Kanal med brugeren.
 */
export const getDrinkLogsForUser = query({
  args: {
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireCurrentUser(ctx);
    const targetId = args.userId ?? viewer._id;

    if (targetId !== viewer._id) {
      await requireCanViewUser(ctx, targetId);
    }

    return await ctx.db
      .query("drinkLogs")
      .withIndex("by_user_and_timestamp", (q) => q.eq("userId", targetId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});
