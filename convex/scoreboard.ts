import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  AVATAR_COLOR_NAMES,
  SCOREBOARD_LIMIT,
  getDrinkDayStart,
  isDrinkCategory,
} from "./constants";
import { beregnRunStart } from "./drinkRules";
import { requireKanalMedlem } from "./identity";
import { beregnPromille, kanBeregnePromille } from "./promilleRules";

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
 *
 * PROMILLE (fase 8): kolonnen viste før pladsholderen `genstande × 0,18` fra
 * useLeaderboard.ts — det samme tal for alle, uanset vægt og køn. Nu regnes
 * den efter Widmark ud fra brugerens egne indstillinger, og den er `undefined`
 * for dem der ikke har slået den til eller ikke har udfyldt vægt og køn. At
 * vise et opdigtet tal ved siden af et rigtigt ville være værre end at vise
 * ingenting.
 *
 * To ting adskiller scoreboardets promille fra `promille.getMinPromille`:
 * den regnes kun på logninger i DENNE Kanal, og den ser kun logninger fra
 * drikkedagens start. Ens egen promille bruger alle ens logninger. Forskellen
 * er bevidst: at hente hvert medlems fulde logbog for at fylde én kolonne ud
 * ville koste et opslag per medlem ved hver eneste opdatering af stillingen.
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
  /**
   * Promille efter Widmark. `undefined` når brugeren ikke har slået den til
   * eller mangler vægt/køn — se filens hoved.
   */
  promille?: number;
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

    // Grupper per bruger. Nulstillings-rækkerne beholdes her, fordi de er
    // det der afgør hvornår brugerens igangværende run begyndte.
    const logsPerBruger = new Map<Id<"users">, typeof logs>();
    for (const log of logs) {
      const liste = logsPerBruger.get(log.userId);
      if (liste === undefined) logsPerBruger.set(log.userId, [log]);
      else liste.push(log);
    }

    const members = await Promise.all(
      kanal.members.map((userId) => ctx.db.get(userId)),
    );

    const rows: ScoreboardRow[] = [];
    for (const user of members) {
      if (user === null) continue;
      if (user.checkInStatus !== true) continue;

      const brugerLogs = logsPerBruger.get(user._id) ?? [];

      // Stillingen gøres op for det IGANGVÆRENDE run, ikke hele drikkedagen.
      // Det var også meningen i det gamle repo, hvor listen sorterede efter
      // `currentRunDrinkCount` — men den nye `resetRun` skrev kun en markør,
      // som stillingen sprang over uden at flytte grænsen. En nulstilling
      // nulstiller nu faktisk stillingen.
      const runStart = beregnRunStart(dayStart, brugerLogs);

      let drinks = 0;
      let lastDrinkAt: number | undefined;
      const runLogs = [];

      for (const log of brugerLogs) {
        if (log.timestamp < runStart) continue;
        if (log.isReset === true) continue;
        runLogs.push(log);

        // Kun rigtige drikkevarer tæller i stillingen — en cigaret gør ikke.
        if (!isDrinkCategory(log.categoryId)) continue;
        drinks += log.sizeMultiplier ?? 1;
        lastDrinkAt = Math.max(lastDrinkAt ?? 0, log.timestamp);
      }

      const indstilling = user.promille;
      const promille = kanBeregnePromille(indstilling)
        ? beregnPromille(runLogs, indstilling.weight, indstilling.gender, now)
        : undefined;

      rows.push({
        userId: user._id,
        name: user.displayName || "Anonym",
        avatar: user.emoji ?? "🍺",
        color: user.avatarColor ?? fallbackColor(user._id),
        profileEmoji: user.profileEmoji,
        profileGradient: user.profileGradient,
        drinksToday: round2(drinks),
        streak: user.currentDayStreak ?? 0,
        ...(promille !== undefined ? { promille: round2(promille) } : {}),
        lastDrinkAt,
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

/**
 * Stabil farve ud fra bruger-id, når brugeren ikke har valgt en.
 *
 * Listen kommer fra `AVATAR_COLOR_NAMES` i convex/constants.ts — den stod før
 * skrevet af her, hvilket betød at en ny farve i den ene liste ikke fandtes i
 * den anden.
 */
function fallbackColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return AVATAR_COLOR_NAMES[Math.abs(hash) % AVATAR_COLOR_NAMES.length];
}
