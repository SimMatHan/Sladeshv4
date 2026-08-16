import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getDrinkDayStart } from "./constants";
import { beregnRunStart } from "./drinkRules";
import { requireCurrentUser } from "./identity";
import {
  beregnPromille,
  beruselsesniveau,
  kanBeregnePromille,
  timerTilAedru,
  type Beruselsesniveau,
} from "./promilleRules";

/**
 * Promille.
 *
 * Selve formlen ligger i convex/promilleRules.ts. Her hentes brugerens
 * logninger for det igangværende run.
 *
 * Vinduet er RUNNET, ikke drikkedagen: nulstiller man sit run, starter
 * promillen forfra. Det gamle repos `useBAC` gjorde det samme, men gennem
 * `isReset`-markeringer på de enkelte rækker — se `beregnRunStart` i
 * convex/drinkRules.ts for hvorfor grænsen nu udledes i stedet.
 *
 * I modsætning til scoreboardet tælles ALLE brugerens logninger med, uanset
 * hvilken Kanal de blev logget i. Ens egen promille handler om hvad man har
 * drukket, ikke om hvor stillingen bliver gjort op.
 */

export type PromilleSvar = {
  /** Har brugeren slået promille til i sin profil? */
  enabled: boolean;
  /** Er både køn og vægt udfyldt? Uden dem kan der ikke regnes. */
  konfigureret: boolean;
  /** `null` når der ikke kan regnes. */
  promille: number | null;
  niveau: Beruselsesniveau | null;
  timerTilAedru: number | null;
  /** Starten på det run beregningen dækker. */
  runStart: number;
  /** Antal logninger der indgik. */
  logninger: number;
};

export const getMinPromille = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<PromilleSvar> => {
    const user = await requireCurrentUser(ctx);
    const now = args.now ?? Date.now();

    const dayStart = getDrinkDayStart(now);
    const dagensLogs = await ctx.db
      .query("drinkLogs")
      .withIndex("by_user_and_timestamp", (q) =>
        q.eq("userId", user._id).gte("timestamp", dayStart),
      )
      .collect();

    const runStart = beregnRunStart(dayStart, dagensLogs);
    const runLogs = dagensLogs.filter((log) => log.timestamp >= runStart);

    const indstilling = user.promille;

    if (!kanBeregnePromille(indstilling)) {
      return {
        enabled: indstilling?.enabled === true,
        konfigureret: false,
        promille: null,
        niveau: null,
        timerTilAedru: null,
        runStart,
        logninger: runLogs.length,
      };
    }

    const promille = beregnPromille(
      runLogs,
      indstilling.weight,
      indstilling.gender,
      now,
    );

    return {
      enabled: true,
      konfigureret: true,
      promille,
      niveau: beruselsesniveau(promille),
      timerTilAedru: timerTilAedru(promille),
      runStart,
      logninger: runLogs.length,
    };
  },
});

/**
 * Gemmer brugerens promille-indstillinger.
 *
 * Vægt og køn er personoplysninger og skrives kun af brugeren selv. Ingen
 * andre kan sætte dem, og de udleveres aldrig — kun det BEREGNEDE tal
 * forlader serveren.
 *
 * Slår man promille fra, bevares vægt og køn, så man ikke skal udfylde dem
 * igen ved at slå det til. Vil man have dem væk, sættes de til `null`.
 */
export const setPromilleIndstilling = mutation({
  args: {
    enabled: v.boolean(),
    gender: v.optional(
      v.union(v.literal("male"), v.literal("female"), v.null()),
    ),
    weight: v.optional(v.union(v.number(), v.null())),
    height: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireCurrentUser(ctx);
    const nuvaerende = user.promille;

    // `undefined` = rør ikke feltet. `null` = ryd det.
    const gender =
      args.gender === undefined
        ? nuvaerende?.gender
        : (args.gender ?? undefined);
    const weight =
      args.weight === undefined
        ? nuvaerende?.weight
        : (args.weight ?? undefined);
    const height =
      args.height === undefined
        ? nuvaerende?.height
        : (args.height ?? undefined);

    if (weight !== undefined && (!Number.isFinite(weight) || weight <= 0 || weight > 500)) {
      throw new ConvexError({
        code: "INVALID_WEIGHT",
        message: "Vægten skal være mellem 1 og 500 kg.",
      });
    }

    if (height !== undefined && (!Number.isFinite(height) || height <= 0 || height > 300)) {
      throw new ConvexError({
        code: "INVALID_HEIGHT",
        message: "Højden skal være mellem 1 og 300 cm.",
      });
    }

    await ctx.db.patch(user._id, {
      promille: { enabled: args.enabled, gender, weight, height },
      updatedAt: Date.now(),
    });

    // Værdierne logges bevidst IKKE — vægt og køn er personoplysninger.
    console.log("[Promille] indstilling gemt", {
      userId: user._id,
      enabled: args.enabled,
      konfigureret: kanBeregnePromille({ enabled: args.enabled, gender, weight }),
    });
  },
});
