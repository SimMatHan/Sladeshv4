import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Oprydning efter smoke-testen.
 *
 * Bevidst snæver: den sletter KUN rækker hvis email/kode bærer smoke-test-
 * præfikset, og afviser alt andet. Det er ikke en generel "slet bruger"-
 * mutation, og den kan ikke bruges til at rydde rigtige data.
 *
 * Kør den aldrig mod produktion.
 */

/** Præfiks som smoke-testens data SKAL bære for at kunne slettes. */
export const SMOKE_PREFIX = "smoke-test+";
export const SMOKE_KANAL_PREFIX = "SMOKE-";

export const cleanupSmokeTest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    channelId: v.optional(v.id("kanaler")),
  },
  handler: async (ctx, args): Promise<{ deleted: Record<string, number> }> => {
    const deleted: Record<string, number> = {
      drinkLogs: 0,
      checkIns: 0,
      kanaler: 0,
      users: 0,
    };

    if (args.userId !== undefined) {
      const user = await ctx.db.get(args.userId);
      if (user === null) {
        throw new ConvexError({
          code: "USER_NOT_FOUND",
          message: "Brugeren findes ikke.",
        });
      }
      // Sikkerhedsspærre: kun smoke-test-brugere må slettes.
      if (!user.email.startsWith(SMOKE_PREFIX)) {
        throw new ConvexError({
          code: "NOT_TEST_DATA",
          message:
            `Nægter at slette "${user.email}" — kun brugere med præfikset ` +
            `"${SMOKE_PREFIX}" kan ryddes op af denne mutation.`,
        });
      }

      for (const log of await ctx.db
        .query("drinkLogs")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!))
        .collect()) {
        await ctx.db.delete(log._id);
        deleted.drinkLogs++;
      }

      for (const row of await ctx.db
        .query("checkIns")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!))
        .collect()) {
        await ctx.db.delete(row._id);
        deleted.checkIns++;
      }
    }

    if (args.channelId !== undefined) {
      const kanal = await ctx.db.get(args.channelId);
      if (kanal !== null) {
        if (!kanal.code.startsWith(SMOKE_KANAL_PREFIX)) {
          throw new ConvexError({
            code: "NOT_TEST_DATA",
            message:
              `Nægter at slette Kanalen "${kanal.name}" — kun koder med ` +
              `præfikset "${SMOKE_KANAL_PREFIX}" kan ryddes op.`,
          });
        }
        await ctx.db.delete(kanal._id);
        deleted.kanaler++;
      }
    }

    if (args.userId !== undefined) {
      await ctx.db.delete(args.userId);
      deleted.users++;
    }

    console.log("[Testing] smoke-test-data ryddet op", deleted);
    return { deleted };
  },
});
