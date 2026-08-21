import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdmin, requireCurrentUser } from "./identity";
import { findAchievement } from "./achievementRules";

/**
 * Donationer og donorlisten.
 *
 * ## Hvad der er lavet om
 *
 * Det gamle repo kopierede donorens navn, initialer og avatar-gradient ned i
 * hver donationsrække (`userName`, `userInitials`, `userAvatarGradient`).
 * Skiftede nogen navn eller avatar, blev donorlisten stående med det gamle —
 * og de tre felter kunne ikke rettes uden at skrive hver række om. Her står
 * kun `userId`, og navnet slås op ved visning.
 *
 * ## Top Donor
 *
 * Achievementet `top_donor` er `manual` i achievementRules.ts, dvs. det har
 * ingen målbar betingelse motoren kan regne på. I det gamle repo betød det,
 * at en admin skulle huske TO ting: registrer donationen, og tildel så
 * achievementet i en anden fane. Det ene blev jævnligt glemt.
 *
 * Her tildeler `opretDonation` det selv, i samme transaktion. Achievementet
 * er stadig `manual` for motoren — den kan ikke se donationer — men "manuel"
 * skal betyde "kræver et menneskes beslutning", ikke "kræver to klik i
 * forskellige faner".
 */

export const BESKED_MAX = 200;

/** Registrerer en donation og tildeler Top Donor. Kun admins. */
export const opretDonation = mutation({
  args: {
    userId: v.id("users"),
    /** Beløb i hele kroner. */
    amount: v.number(),
    message: v.optional(v.string()),
    /** Hvornår der blev doneret. Default nu — bruges ved efterregistrering. */
    date: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"donations">> => {
    const admin = await requireAdmin(ctx);

    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      throw new ConvexError({
        code: "INVALID_AMOUNT",
        message: "Beløbet skal være større end nul.",
      });
    }

    const donor = await ctx.db.get(args.userId);
    if (donor === null) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Brugeren findes ikke.",
      });
    }

    const besked = args.message?.trim();
    if (besked !== undefined && besked.length > BESKED_MAX) {
      throw new ConvexError({
        code: "FIELD_TOO_LONG",
        message: `Beskeden må højst fylde ${BESKED_MAX} tegn (var ${besked.length}).`,
      });
    }

    const now = Date.now();

    const donationId = await ctx.db.insert("donations", {
      userId: args.userId,
      amount: args.amount,
      message: besked !== undefined && besked.length > 0 ? besked : undefined,
      date: args.date ?? now,
      createdBy: admin._id,
      createdAt: now,
    });

    await tildelTopDonor(ctx, args.userId, now);

    console.log("[Admin] donation registreret", {
      donationId,
      userId: args.userId,
      beloeb: args.amount,
    });

    return donationId;
  },
});

/**
 * Donorlisten med navne, og summen.
 *
 * Åben for alle indloggede: listen er selve pointen med at donere, og den
 * hang i det gamle repo på `/support`, som enhver bruger kunne se.
 */
export const getDonorer = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);

    const donationer = await ctx.db
      .query("donations")
      .withIndex("by_date")
      .order("desc")
      .take(limit);

    const beriget = await Promise.all(
      donationer.map(async (donation) => {
        const donor = await ctx.db.get(donation.userId);
        return {
          _id: donation._id,
          userId: donation.userId,
          amount: donation.amount,
          message: donation.message,
          date: donation.date,
          // En slettet bruger efterlader sin donation. Navnet er væk, men
          // beløbet tæller stadig med i summen.
          name: donor?.displayName ?? "Ukendt",
          avatar: donor?.emoji,
          color: donor?.avatarColor,
        };
      }),
    );

    return {
      donationer: beriget,
      /**
       * Summen af de HENTEDE donationer.
       *
       * Det gamle repos `getTotalDonations` hentede hele samlingen ned og lagde
       * sammen i klienten. Her er den regnet på serveren, men bemærk at den
       * følger `limit` — med under 200 donationer i alt er det hele summen.
       */
      total: beriget.reduce((sum, donation) => sum + donation.amount, 0),
      antal: beriget.length,
    };
  },
});

/**
 * Sletter en donation. Kun admins.
 *
 * Top Donor-achievementet fjernes IKKE. Det er en tak, ikke en kvittering —
 * og en fortrudt fejlindtastning skal ikke tage et mærke fra nogen, der
 * faktisk har doneret. Skal det væk, gøres det bevidst i Brugere-fanen.
 */
export const sletDonation = mutation({
  args: { donationId: v.id("donations") },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx);

    const donation = await ctx.db.get(args.donationId);
    // Idempotent: en allerede slettet donation er ikke en fejl.
    if (donation === null) return;

    await ctx.db.delete(args.donationId);

    console.log("[Admin] donation slettet", { donationId: args.donationId });
  },
});

/**
 * Tildeler Top Donor, hvis brugeren ikke allerede har det.
 *
 * Skrevet her frem for at kalde `achievements.tildelManuelt`: en mutation kan
 * ikke kalde en anden mutation i Convex, og at trække logikken ud i en delt
 * hjælper ville lade `tildelManuelt` — som har sine egne admin- og
 * type-tjek — se ud som om den kunne genbruges bredere, end den kan.
 *
 * `top_donor` er ikke `repeatable`, så anden donation låser ikke op igen.
 */
async function tildelTopDonor(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number,
): Promise<void> {
  const def = findAchievement("top_donor");
  // Forsvinder definitionen en dag, skal donationen stadig kunne registreres.
  if (def === undefined) return;

  const eksisterende = await ctx.db
    .query("achievements")
    .withIndex("by_user_and_achievement", (q) =>
      q.eq("userId", userId).eq("achievementId", "top_donor"),
    )
    .unique();

  if (eksisterende !== null) return;

  await ctx.db.insert("achievements", {
    userId,
    achievementId: "top_donor",
    count: 1,
    unlockedAt: now,
    firstUnlockedAt: now,
    lastUnlockedAt: now,
  });

  console.log("[Achievement] Top Donor tildelt via donation", { userId });
}
