import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  PROMILLE_PER_DRINK,
  SCOREBOARD_LIMIT,
  getDrinkDayStart,
  isDrinkCategory,
} from "./constants";

/**
 * Scoreboard.
 *
 * Bevidst IKKE en tabel: stillingen beregnes live ud fra `drinkLogs`, så der
 * ikke findes en denormaliseret tæller der kan komme ud af sync. Det gamle
 * repo læste `users.currentRunDrinkCount`; her er `drinkLogs` sandhedskilden.
 *
 * Regler overtaget fra src/hooks/useLeaderboard.ts:
 * - Kun brugere der er checket ind (`checkInStatus === true`) OG medlem af
 *   Kanalen tæller med.
 * - Primær sortering: antal genstande i den aktuelle drikkedag, faldende.
 * - Tie-breaker: tidligste `lastDrinkAt` vinder.
 * - Maks. 50 rækker.
 *
 * Nyt her: "dagens genstande" respekterer størrelses-multiplikatoren
 * (Lille 1.0 / Mellem 1.5 / Stor 2.0) i stedet for at tælle rå rækker.
 */

export type ScoreboardRow = {
  userId: Id<"users">;
  name: string;
  avatar: string;
  color: string;
  profileEmoji?: string;
  profileGradient?: string;
  drinksToday: number;
  drinksTotal: number;
  streak: number;
  promille: number;
  lastDrinkAt?: number;
  hasActiveSladesh: boolean;
  isOnline: boolean;
};

export const forKanal = query({
  args: {
    channelId: v.id("kanaler"),
    /** Overstyrer "nu" — kun til test. Default er serverens tid. */
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ScoreboardRow[]> => {
    const now = args.now ?? Date.now();
    const dayStart = getDrinkDayStart(now);

    console.log("[Scoreboard] beregner stilling", {
      channelId: args.channelId,
      dayStart: new Date(dayStart).toISOString(),
    });

    // Deltagere: medlemmer af Kanalen der er checket ind.
    const kanal = await ctx.db.get(args.channelId);
    if (kanal === null) {
      console.log("[Scoreboard] ukendt kanal", { channelId: args.channelId });
      return [];
    }

    const members = await Promise.all(
      kanal.members.map((userId) => ctx.db.get(userId)),
    );
    const participants = members.filter(
      (user): user is Doc<"users"> => user !== null && user.checkInStatus === true,
    );

    const rows = await Promise.all(
      participants.map(async (user) => {
        // Alle logs for brugeren i denne Kanal fra drikkedagens start.
        const todaysLogs = await ctx.db
          .query("drinkLogs")
          .withIndex("by_user_and_timestamp", (q) =>
            q.eq("userId", user._id).gte("timestamp", dayStart),
          )
          .collect();

        const inKanal = todaysLogs.filter(
          (log) => log.channelId === args.channelId,
        );

        const drinksToday = sumDrinks(inKanal);

        // Livstidstotal for brugeren, på tværs af Kanaler.
        const allLogs = await ctx.db
          .query("drinkLogs")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();

        return {
          userId: user._id,
          name: user.displayName || "Anonym",
          avatar: user.emoji ?? "🍺",
          color: user.avatarColor ?? fallbackColor(user._id),
          profileEmoji: user.profileEmoji,
          profileGradient: user.profileGradient,
          drinksToday,
          drinksTotal: sumDrinks(allLogs),
          streak: user.currentStreak ?? 0,
          promille: Number((drinksToday * PROMILLE_PER_DRINK).toFixed(1)),
          lastDrinkAt: user.lastDrinkAt,
          hasActiveSladesh: Boolean(user.activeSladesh),
          // Kun indcheckede brugere når hertil, så de regnes som online —
          // samme antagelse som i det gamle repo.
          isOnline: true,
        };
      }),
    );

    rows.sort((a, b) => {
      if (b.drinksToday !== a.drinksToday) {
        return b.drinksToday - a.drinksToday;
      }
      // Tie-breaker: den der drak tidligst, vinder.
      if (a.lastDrinkAt === undefined) return 1;
      if (b.lastDrinkAt === undefined) return -1;
      return a.lastDrinkAt - b.lastDrinkAt;
    });

    const result = rows.slice(0, SCOREBOARD_LIMIT);
    console.log("[Scoreboard] stilling klar", { rækker: result.length });
    return result;
  },
});

/**
 * Summerer genstande. Nulstillings-rækker (`isReset`) og ikke-drikkevarer
 * (kategorien "Andet") tæller ikke med. Størrelse vægtes via
 * `sizeMultiplier`, der som default er 1.
 */
function sumDrinks(logs: Doc<"drinkLogs">[]): number {
  const total = logs.reduce((sum, log) => {
    if (log.isReset === true) return sum;
    if (!isDrinkCategory(log.categoryId)) return sum;
    return sum + (log.sizeMultiplier ?? 1);
  }, 0);

  // Undgår flydende-komma-støj som 3.0000000000000004.
  return Number(total.toFixed(2));
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
