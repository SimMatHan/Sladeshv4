import { ConvexError } from "convex/values";
import { mutation } from "./_generated/server";
import { requireCurrentUser } from "./identity";

/**
 * Oprydning efter smoke-testen.
 *
 * Tre spærrer, så den ikke kan bruges til at rydde rigtige data:
 * 1. Kræver login — som alt andet.
 * 2. Rydder KUN op efter den kaldende bruger selv; man kan ikke pege den mod
 *    en anden konto.
 * 3. Kræver at brugerens email bærer smoke-test-præfikset.
 *
 * Kør den aldrig mod produktion.
 */

/** Præfiks som smoke-testens data SKAL bære for at kunne slettes. */
export const SMOKE_PREFIX = "smoke-test+";
export const SMOKE_KANAL_PREFIX = "SMOKE-";

export const cleanupSmokeTest = mutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: Record<string, number> }> => {
    const user = await requireCurrentUser(ctx);

    // Sikkerhedsspærre: kun smoke-test-brugere må slettes.
    if (!user.email.startsWith(SMOKE_PREFIX)) {
      throw new ConvexError({
        code: "NOT_TEST_DATA",
        message:
          `Nægter at rydde op for "${user.email}" — kun brugere med præfikset ` +
          `"${SMOKE_PREFIX}" kan ryddes op af denne mutation.`,
      });
    }

    const deleted: Record<string, number> = {
      drinkLogs: 0,
      checkIns: 0,
      kanaler: 0,
      users: 0,
    };

    for (const log of await ctx.db
      .query("drinkLogs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()) {
      await ctx.db.delete(log._id);
      deleted.drinkLogs++;
    }

    for (const row of await ctx.db
      .query("checkIns")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()) {
      await ctx.db.delete(row._id);
      deleted.checkIns++;
    }

    // Kun Kanaler brugeren selv har oprettet, og kun med test-præfiks.
    for (const channelId of user.joinedChannelIds) {
      const kanal = await ctx.db.get(channelId);
      if (kanal === null) continue;
      if (kanal.createdBy !== user._id) continue;
      if (!kanal.code.startsWith(SMOKE_KANAL_PREFIX)) continue;
      await ctx.db.delete(kanal._id);
      deleted.kanaler++;
    }

    await ctx.db.delete(user._id);
    deleted.users++;

    console.log("[Testing] smoke-test-data ryddet op", deleted);
    return { deleted };
  },
});
