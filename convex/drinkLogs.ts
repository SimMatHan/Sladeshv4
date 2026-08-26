import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { evaluerAchievements } from "./achievements";
import { getDrinkDayStart } from "./constants";
import { beregnRunStart, erUdeIDag } from "./drinkRules";
import { varslingUdeIAften } from "./kanaler";
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

/** Svaret fra en logning: rækken, og hvad den eventuelt låste op. */
export type LogDrinkResultat = {
  logId: Id<"drinkLogs">;
  /** Id'er på achievements der blev låst op af netop denne logning. */
  nyeAchievements: string[];
};

export const logDrink = mutation({
  args: {
    categoryId: v.string(),
    variationName: v.string(),
    channelId: v.optional(v.id("kanaler")),
    location: v.optional(v.object({ lat: v.number(), lng: v.number() })),
  },
  handler: async (ctx, args): Promise<LogDrinkResultat> => {
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

    // Snapshot af brugeren, så historikken ikke ændrer sig hvis brugeren
    // senere skifter navn eller avatar.
    const logId = await ctx.db.insert("drinkLogs", {
      userId: user._id,
      channelId: args.channelId,
      categoryId: args.categoryId,
      variationName: args.variationName,
      // INGEN størrelsesfelter. En logning er én genstand — se
      // kommentaren, hvor `DRINK_SIZES` stod, i convex/constants.ts.
      // Felterne bliver i schemaet for de rækker, der allerede har dem.
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
      // Udeladt: `computeStreak` bruger kun feltet til at genkende en
      // FORTRYDELSE på dens negative fortegn, og en ny logning er aldrig
      // en fortrydelse.
    });

    const points = pointsForDrink(args.categoryId, undefined);

    // Den første rigtige genstand i en drikkedag checker dig ind.
    //
    // Før skulle man trykke "Check ind" for overhovedet at stå på stillingen,
    // og markeringen udløb kl. 10:00. Loggede man en øl uden, talte den — men
    // man var usynlig for de andre. Man havde gjort det rigtige og fik
    // ingenting at vide. Se docs/brugerrejser.md, afsnit 5.
    //
    // Kun rigtige drikkevarer tæller: en cigaret siger ikke, at man er ude.
    const checkerInd = streak.changed && !erUdeIDag(user, getDrinkDayStart(now));

    await ctx.db.patch(user._id, {
      totalPoints: (user.totalPoints ?? 0) + points,
      /*
       * `checkInCount` tælles OP her nu.
       *
       * Den blev kun talt op af `checkIn` i convex/checkIns.ts, og den
       * mutation havde ét kaldested: formularen under Kortet. Den formular
       * er fjernet — aftenens første genstand gør allerede det samme — og
       * uden denne linje ville "CHECK INS" på Mig stå stille for evigt.
       *
       * `checkerInd` er sand præcis én gang per drikkedag, så tallet
       * betyder stadig det samme som før: aftener, man var ude.
       */
      ...(checkerInd
        ? {
            checkInStatus: true,
            lastCheckIn: now,
            checkInCount: (user.checkInCount ?? 0) + 1,
          }
        : {}),
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

    // Achievements evalueres i SAMME transaktion. Enten lander logningen og
    // dens oplåsninger sammen, eller ingen af delene. I det gamle repo kørte
    // motoren i en React-context 300 ms senere, så en lukket app betød ingen
    // oplåsning — og to åbne faner kunne låse den samme op to gange.
    const opdateretBruger = (await ctx.db.get(user._id))!;
    const nyeAchievements = await evaluerAchievements(ctx, opdateretBruger, now);

    console.log("[DrinkLog] registreret", {
      logId,
      userId: user._id,
      kategori: args.categoryId,
      variant: args.variationName,
      point: points,
      stræk: streak.currentDayStreak,
      checkedInd: checkerInd,
      achievements: nyeAchievements.length,
    });

    // AFTENENS FØRSTE — sig det til de andre.
    //
    // `checkerInd` er sand præcis én gang per drikkedag, og det er ikke et
    // tilfælde, at det passer: den er allerede reglen for, hvornår man
    // kommer på stillingen. Logger man sin femte øl, sker der ingenting
    // her. Se `varslingUdeIAften` for den anden vej ind i samme tilstand.
    if (checkerInd && args.channelId !== undefined) {
      await varslingUdeIAften(ctx, args.channelId, user._id, user.displayName);
    }

    return { logId, nyeAchievements };
  },
});

/**
 * Fortryder en tidligere logning.
 *
 * Historikken slettes ikke: der indsættes en modpost med `action: "remove"`
 * og en NEGATIV `sizeMultiplier`, så enhver aggregering trækker den fra af
 * sig selv. Det er samme form som i det gamle repo.
 *
 * TO NYE SPÆRRER i forhold til den gamle `removeDrink`, som tog kategori og
 * variantnavn løst og skrev en negativ række uden reference:
 *
 * 1. Man fortryder en BESTEMT logning (`logId`), ikke "en øl". Modposten
 *    peger tilbage på den med `removesLogId`.
 * 2. Den samme logning kan ikke fortrydes to gange, og kun logninger i det
 *    igangværende run kan fortrydes.
 *
 * Uden dem kunne man skrive negative rækker i det uendelige og trække både
 * scoreboard og livstidspoint under nul.
 */
export const removeDrink = mutation({
  args: {
    logId: v.id("drinkLogs"),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"drinkLogs">> => {
    const user = await requireCurrentUser(ctx);
    const now = args.now ?? Date.now();

    const original = await ctx.db.get(args.logId);
    if (original === null) {
      throw new ConvexError({
        code: "LOG_NOT_FOUND",
        message: "Logningen findes ikke.",
      });
    }

    if (original.userId !== user._id) {
      console.log("[DrinkLog] fortrydelse afvist — ikke egen logning", {
        userId: user._id,
        logId: args.logId,
      });
      throw new ConvexError({
        code: "NOT_OWN_LOG",
        message: "Du kan kun fortryde dine egne logninger.",
      });
    }

    if (original.isReset === true || original.action === "remove") {
      throw new ConvexError({
        code: "NOT_A_DRINK",
        message: "Rækken er en markering, ikke en genstand, og kan ikke fortrydes.",
      });
    }

    // Kun det igangværende run kan fortrydes. Grænsen er den samme som
    // scoreboardets og promillens, så de tre altid er enige om hvad "nu"
    // dækker.
    const dayStart = getDrinkDayStart(now);
    const dagensLogs = await ctx.db
      .query("drinkLogs")
      .withIndex("by_user_and_timestamp", (q) =>
        q.eq("userId", user._id).gte("timestamp", dayStart),
      )
      .collect();

    const runStart = beregnRunStart(dayStart, dagensLogs);

    if (original.timestamp < runStart) {
      throw new ConvexError({
        code: "LOG_TOO_OLD",
        message:
          "Logningen hører til et afsluttet run og kan ikke fortrydes. " +
          "Historikken bliver stående.",
      });
    }

    const alleredeFortrudt = dagensLogs.some(
      (log) => log.removesLogId === args.logId,
    );
    if (alleredeFortrudt) {
      throw new ConvexError({
        code: "ALREADY_REMOVED",
        message: "Logningen er allerede fortrudt.",
      });
    }

    const vaegt = original.sizeMultiplier ?? 1;

    const logId = await ctx.db.insert("drinkLogs", {
      userId: user._id,
      channelId: original.channelId,
      categoryId: original.categoryId,
      variationName: original.variationName,
      sizeId: original.sizeId,
      // Negativ vægt: aggregeringerne behøver ikke vide hvad "remove" betyder.
      sizeMultiplier: -vaegt,
      sizeLabel: original.sizeLabel,
      sizeVolume: original.sizeVolume,
      timestamp: now,
      action: "remove",
      removesLogId: args.logId,
      userDisplayName: user.displayName,
      userEmoji: user.emoji,
      userProfileEmoji: user.profileEmoji,
      userProfileGradient: user.profileGradient,
    });

    // Point trækkes fra igen. Strækken røres IKKE: at fortryde en genstand
    // gør ikke gårsdagens stræk ugyldig, og `computeStreak` afviser i forvejen
    // at forlænge en stræk på en negativ multiplier.
    const point = pointsForDrink(original.categoryId, vaegt);

    await ctx.db.patch(user._id, {
      totalPoints: (user.totalPoints ?? 0) - point,
      updatedAt: now,
    });

    console.log("[DrinkLog] fortrudt", {
      logId,
      fortryder: args.logId,
      userId: user._id,
      point: -point,
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
  handler: async (ctx, args): Promise<LogDrinkResultat> => {
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

    // Nulstillingen er selv en betingelse ("Are you sure about that?" tæller
    // dem), så motoren skal se den opdaterede tæller.
    const opdateretBruger = (await ctx.db.get(user._id))!;
    const nyeAchievements = await evaluerAchievements(ctx, opdateretBruger, now);

    console.log("[DrinkLog] run nulstillet", {
      userId: user._id,
      nulstillinger: (user.totalRunResets ?? 0) + 1,
      achievements: nyeAchievements.length,
    });

    return { logId, nyeAchievements };
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
