import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { evaluerAchievements } from "./achievements";
import { requireAdmin } from "./identity";

/**
 * Admin-handlinger på ANDRE brugere.
 *
 * De ligger samlet her frem for spredt i users.ts, drinkLogs.ts og
 * sladesh.ts, fordi de deler den egenskab, der betyder mest: de rører data,
 * som ikke tilhører den, der kalder. Det skal være ét sted at læse, hvad en
 * admin overhovedet kan gøre ved en anden persons konto.
 *
 * ## Hvad der er lavet om i forhold til det gamle repo
 *
 * `adminService` i det gamle repo nulstillede ved at SÆTTE TÆLLERE TIL NUL på
 * brugerdokumentet: `achievements: {}`, `currentRunDrinkCount: 0`,
 * `drinkVariations: {}`, `sladeshSent: 0` og så videre. Det virkede, fordi
 * appen troede på de tællere.
 *
 * v4 tror ikke på tællere. Stillingen, achievements og livstidstallene
 * beregnes fra `drinkLogs`, så at nulstille et felt ville ikke ændre noget —
 * tallet ville komme igen ved næste beregning. Hver handling herunder er
 * derfor skrevet om til at gøre det, den gamle knap HED, i den nye model.
 */

/**
 * Nulstiller en brugers run — det samme som brugeren selv kan gøre.
 *
 * Den gamle `resetUserDrinkDay` satte `currentRunDrinkCount: 0` og
 * `drinkVariations: {}`. Her indsættes en nulstillings-markør i `drinkLogs`,
 * præcis som `drinkLogs.resetRun` gør for en selv: stillingen starter forfra,
 * mens logrækkerne og Kanalens historik bliver stående.
 *
 * IKKE-DESTRUKTIVT med vilje. At slette dagens logninger ville også fjerne
 * dem fra brugerens livstidstal og dermed ændre, hvilke achievements hun kan
 * opnå — en oprydning må ikke omskrive folks historik.
 *
 * Nulstillingen tælles i `totalRunResets`, som "Are you sure about that?"
 * måler på. Det er ikke en bivirkning, men netop pointen: for motoren er det
 * en rigtig nulstilling, uanset hvem der trykkede.
 */
export const nulstilRunForBruger = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx);

    const bruger = await kraeverBruger(ctx, args.userId);
    const now = Date.now();

    await ctx.db.insert("drinkLogs", {
      userId: bruger._id,
      channelId: bruger.activeChannelId,
      categoryId: "other",
      variationName: "Run nulstillet",
      timestamp: now,
      isReset: true,
      userDisplayName: bruger.displayName,
    });

    await ctx.db.patch(bruger._id, {
      totalRunResets: (bruger.totalRunResets ?? 0) + 1,
      updatedAt: now,
    });

    // Nulstillingen er selv en betingelse, så motoren skal se den opdaterede
    // tæller — samme rækkefølge som i `drinkLogs.resetRun`.
    const opdateret = (await ctx.db.get(bruger._id))!;
    await evaluerAchievements(ctx, opdateret, now);

    console.log("[Admin] run nulstillet for bruger", {
      userId: bruger._id,
      nulstillinger: (bruger.totalRunResets ?? 0) + 1,
    });
  },
});

/**
 * Nulstiller en brugers Sladesh-tal.
 *
 * Tællerne (`sladeshSent`, `sladeshReceived`, `sladeshCompletedCount`,
 * `sladeshFailedCount`) er ægte felter i v4 og kan derfor nulstilles direkte,
 * som i det gamle repo.
 *
 * `activeSladesh` findes derimod ikke længere som felt — den var en
 * denormaliseret kopi af `sladeshChallenges.status`, og det at holde de to i
 * sync var kilden til de brede fejl i den gamle app. En hængende udfordring
 * ryddes derfor der, hvor den faktisk står: rækken sættes til `expired`, så
 * hverken afsender eller modtager bliver ved med at se en udfordring, der
 * aldrig bliver afgjort.
 */
export const nulstilSladeshForBruger = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<number> => {
    await requireAdmin(ctx);

    const bruger = await kraeverBruger(ctx, args.userId);
    const now = Date.now();

    // Hængende udfordringer i BEGGE retninger. En bruger kan både have sendt
    // én, der aldrig blev afgjort, og modtaget én.
    //
    // BEGGE levende tilstande skal med. `pending` er en udfordring, der er
    // sendt men ikke taget imod; `in_progress` er en, modtageren er i gang
    // med. Kun den første ville efterlade netop de udfordringer hængende, som
    // nogen faktisk sad fast i — og det er dem, knappen er til for.
    const levende = ["pending", "in_progress"] as const;

    const haengende = new Map<Id<"sladeshChallenges">, Doc<"sladeshChallenges">>();

    for (const status of levende) {
      const somModtager = await ctx.db
        .query("sladeshChallenges")
        .withIndex("by_recipient_and_status", (q) =>
          q.eq("recipientId", bruger._id).eq("status", status),
        )
        .collect();

      const somAfsender = await ctx.db
        .query("sladeshChallenges")
        .withIndex("by_sender_and_status", (q) =>
          q.eq("senderId", bruger._id).eq("status", status),
        )
        .collect();

      // Samme udfordring kan ikke stå begge steder — man kan ikke sladeshe
      // sig selv — men `Map` gør det ligegyldigt, hvis den regel ændrer sig.
      for (const udfordring of [...somModtager, ...somAfsender]) {
        haengende.set(udfordring._id, udfordring);
      }
    }

    for (const udfordring of haengende.values()) {
      await ctx.db.patch(udfordring._id, {
        status: "expired",
        updatedAt: now,
      });
    }

    await ctx.db.patch(bruger._id, {
      sladeshSent: 0,
      sladeshReceived: 0,
      sladeshCompletedCount: 0,
      sladeshFailedCount: 0,
      lastSladeshSentAt: undefined,
      updatedAt: now,
    });

    console.log("[Admin] Sladesh nulstillet for bruger", {
      userId: bruger._id,
      afsluttedeUdfordringer: haengende.size,
    });

    return haengende.size;
  },
});

/**
 * Sletter en brugers achievement-oplåsninger.
 *
 * DESTRUKTIVT, og bevidst adskilt fra `achievements.genberegnForBruger`, som
 * kun kan tilføje. Sammen er de to par: nulstil, og byg så op igen fra
 * logrækkerne. Det er den eneste måde at fjerne en oplåsning, der er givet
 * ved en fejl — fx et manuelt tildelt Top Donor.
 *
 * `genberegn` er bevidst IKKE et automatisk næste skridt her. Nulstiller man
 * for at fjerne noget forkert, og motoren straks gav det tilbage, ville
 * handlingen ikke virke; er hensigten "byg op igen", er det ét klik mere i
 * samme fane.
 */
export const nulstilAchievementsForBruger = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<number> => {
    await requireAdmin(ctx);

    const bruger = await kraeverBruger(ctx, args.userId);

    const raekker = await ctx.db
      .query("achievements")
      .withIndex("by_user", (q) => q.eq("userId", bruger._id))
      .collect();

    for (const raekke of raekker) {
      await ctx.db.delete(raekke._id);
    }

    console.log("[Admin] achievements nulstillet for bruger", {
      userId: bruger._id,
      slettede: raekker.length,
    });

    return raekker.length;
  },
});

/**
 * Gør en bruger til admin, eller fjerner rettigheden igen.
 *
 * Den gamle app havde ingen tilsvarende handling — adgang lå i en hårdkodet
 * e-mailliste i klientkoden, som kun kunne ændres ved en ny udrulning.
 * Skærmkortlægningen noterede, at nogen skal sætte `isAdmin` på de rigtige
 * brugere i produktionsdatabasen inden cutover; med denne kan det gøres fra
 * appen i stedet for i Convex-dashboardet.
 *
 * Man kan ikke fjerne sin EGEN adgang. Ellers kunne den sidste admin låse
 * alle ude af Admin permanent, og der er ingen vej tilbage uden dashboardet.
 */
export const setAdmin = mutation({
  args: { userId: v.id("users"), isAdmin: v.boolean() },
  handler: async (ctx, args): Promise<void> => {
    const admin = await requireAdmin(ctx);

    if (admin._id === args.userId && !args.isAdmin) {
      throw new ConvexError({
        code: "CANNOT_DEMOTE_SELF",
        message:
          "Du kan ikke fjerne din egen administratoradgang. " +
          "Bed en anden admin om at gøre det.",
      });
    }

    const bruger = await kraeverBruger(ctx, args.userId);

    // Idempotent: at sætte den, den allerede står på, er ikke en fejl.
    if ((bruger.isAdmin === true) === args.isAdmin) return;

    await ctx.db.patch(bruger._id, {
      isAdmin: args.isAdmin,
      updatedAt: Date.now(),
    });

    console.log("[Admin] adminrettighed aendret", {
      userId: bruger._id,
      isAdmin: args.isAdmin,
    });
  },
});

async function kraeverBruger(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"users">> {
  const bruger = await ctx.db.get(userId);
  if (bruger === null) {
    throw new ConvexError({
      code: "USER_NOT_FOUND",
      message: "Brugeren findes ikke.",
    });
  }
  return bruger;
}
