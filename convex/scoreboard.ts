import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  PROMILLE_PER_DRINK,
  SCOREBOARD_LIMIT,
  getDrinkDayStart,
  isDrinkCategory,
} from "./constants";
import { requireKanalMedlem } from "./identity";

/**
 * Scoreboard.
 *
 * Bevidst IKKE en tabel, og bevidst ikke læst fra cachede tællere på `users`.
 * Stillingen beregnes live ud fra `drinkLogs` via `by_kanal_and_timestamp`:
 * ét indekseret range-scan over Kanalens logninger fra drikkedagens start.
 * Det gamle repo læste `users.currentRunDrinkCount`, som kunne komme ud af
 * trit med de faktiske logrækker.
 *
 * Deltagerkriterier, uændret fra src/hooks/useLeaderboard.ts:
 * - medlem af Kanalen, OG
 * - checket ind (`checkInStatus === true`).
 *
 * Medlemmer uden logninger i dag er med på listen med 0 — de forsvinder ikke,
 * præcis som i den gamle query der hentede alle indcheckede medlemmer.
 *
 * Sortering: flest genstande først; ved lige antal vinder den der drak
 * tidligst (samme tie-breaker som før).
 */

export type ScoreboardRow = {
  userId: Id<"users">;
  name: string;
  avatar: string;
  color: string;
  profileEmoji?: string;
  profileGradient?: string;
  /** Genstande i den aktuelle drikkedag, vægtet med størrelse. */
  drinksToday: number;
  streak: number;
  promille: number;
  /** Seneste logning i dag — bruges som tie-breaker. */
  lastDrinkAt?: number;
  isOnline: boolean;
};

export const getScoreboard = query({
  args: {
    channelId: v.id("kanaler"),
    /** Overstyrer "nu" — kun til test. Default er serverens tid. */
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ScoreboardRow[]> => {
    const now = args.now ?? Date.now();
    const dayStart = getDrinkDayStart(now);

    // Kun medlemmer må se en Kanals stilling. Kaster hvis Kanalen ikke findes
    // eller den indloggede bruger ikke er medlem.
    const { kanal } = await requireKanalMedlem(ctx, args.channelId);

    console.log("[Scoreboard] beregner stilling", {
      kanal: kanal.name,
      fra: new Date(dayStart).toISOString(),
    });

    // Ét indekseret scan over Kanalens logninger i den aktuelle drikkedag.
    const logs = await ctx.db
      .query("drinkLogs")
      .withIndex("by_kanal_and_timestamp", (q) =>
        q.eq("channelId", args.channelId).gte("timestamp", dayStart),
      )
      .collect();

    // Aggregér per bruger.
    const totals = new Map<
      Id<"users">,
      { drinks: number; lastDrinkAt: number }
    >();

    for (const log of logs) {
      // Nulstillings-rækker og ikke-drikkevarer tæller ikke med i stillingen.
      if (log.isReset === true) continue;
      if (!isDrinkCategory(log.categoryId)) continue;

      const previous = totals.get(log.userId);
      const drinks = (previous?.drinks ?? 0) + (log.sizeMultiplier ?? 1);
      const lastDrinkAt = Math.max(previous?.lastDrinkAt ?? 0, log.timestamp);
      totals.set(log.userId, { drinks, lastDrinkAt });
    }

    const members = await Promise.all(
      kanal.members.map((userId) => ctx.db.get(userId)),
    );

    const rows: ScoreboardRow[] = [];
    for (const user of members) {
      if (user === null) continue;
      if (user.checkInStatus !== true) continue;

      const total = totals.get(user._id);
      const drinksToday = round2(total?.drinks ?? 0);

      rows.push({
        userId: user._id,
        name: user.displayName || "Anonym",
        avatar: user.emoji ?? "🍺",
        color: user.avatarColor ?? fallbackColor(user._id),
        profileEmoji: user.profileEmoji,
        profileGradient: user.profileGradient,
        drinksToday,
        streak: user.currentDayStreak ?? 0,
        promille: round1(drinksToday * PROMILLE_PER_DRINK),
        lastDrinkAt: total?.lastDrinkAt,
        // Kun indcheckede brugere når hertil — samme antagelse som før.
        isOnline: true,
      });
    }

    rows.sort((a, b) => {
      if (b.drinksToday !== a.drinksToday) {
        return b.drinksToday - a.drinksToday;
      }
      // Tie-breaker: den der drak tidligst, vinder. Ingen logninger → bagerst.
      if (a.lastDrinkAt === undefined) return 1;
      if (b.lastDrinkAt === undefined) return -1;
      return a.lastDrinkAt - b.lastDrinkAt;
    });

    const result = rows.slice(0, SCOREBOARD_LIMIT);
    console.log("[Scoreboard] stilling klar", {
      kanal: kanal.name,
      rækker: result.length,
      logninger: logs.length,
    });
    return result;
  },
});

/** Undgår flydende-komma-støj som 3.0000000000000004. */
function round2(value: number): number {
  return Number(value.toFixed(2));
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

/** Stabil farve ud fra bruger-id, når brugeren ikke har valgt en. */
function fallbackColor(userId: string): string {
  const colors = ["sunset", "ocean", "berry", "gold", "aurora", "cosmic", "mint"];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}
