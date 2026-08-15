import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCanViewUser, requireCurrentUser } from "./identity";
import type { Ctx } from "./identity";

/**
 * Sladesh — opslag af den aktive udfordring.
 *
 * Dette erstatter det fjernede `users.activeSladesh`-felt. I stedet for at
 * holde en kopi af udfordringens tilstand på brugerdokumentet, slås den op
 * direkte i `sladeshChallenges`, hvor `status` er sandhedskilden. Der er
 * dermed intet at holde i sync, og den klasse af fejl er væk.
 *
 * En bruger kan være involveret i en udfordring på to måder, så der skal to
 * opslag til — begge er nu præcise indeks-opslag:
 *
 *   som MODTAGER: by_recipient_and_status → (recipientId, status)
 *   som AFSENDER: by_sender_and_status    → (senderId, status)
 *
 * Tidligere fandtes `by_sender_and_status` ikke, og afsender-siden måtte
 * hente de seneste 25 afsendte udfordringer og filtrere i hukommelsen. Det
 * var kun korrekt så længe en aktiv udfordring lå inden for de 25 nyeste —
 * en bruger der sendte mange udfordringer i træk kunne få en ældre, stadig
 * aktiv udfordring til at forsvinde ud af vinduet.
 *
 * Kun status "in_progress" regnes som aktiv. "pending" er en udfordring der
 * er sendt men ikke påbegyndt, og den blokerede heller ikke i det gamle repo,
 * hvor låsen udtrykkeligt var `status: 'in_progress'`.
 */

const ACTIVE_STATUS = "in_progress" as const;

/**
 * Den aktive udfordring hvor brugeren er modtager eller afsender.
 *
 * Modtager-siden slås op først: det er den retning der betyder noget for
 * brugeren, fordi det er dér der er en frist at overholde.
 */
async function findActive(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"sladeshChallenges"> | null> {
  const asRecipient = await ctx.db
    .query("sladeshChallenges")
    .withIndex("by_recipient_and_status", (q) =>
      q.eq("recipientId", userId).eq("status", ACTIVE_STATUS),
    )
    .first();

  if (asRecipient !== null) {
    console.log("[Sladesh] aktiv udfordring fundet (modtager)", {
      userId,
      challengeId: asRecipient._id,
    });
    return asRecipient;
  }

  const asSender = await ctx.db
    .query("sladeshChallenges")
    .withIndex("by_sender_and_status", (q) =>
      q.eq("senderId", userId).eq("status", ACTIVE_STATUS),
    )
    .first();

  if (asSender !== null) {
    console.log("[Sladesh] aktiv udfordring fundet (afsender)", {
      userId,
      challengeId: asSender._id,
    });
    return asSender;
  }

  return null;
}

/** Afgør hvem der spørges om, og at man må. */
async function resolveTarget(
  ctx: Ctx,
  userId: Id<"users"> | undefined,
): Promise<Id<"users">> {
  const viewer = await requireCurrentUser(ctx);
  const target = userId ?? viewer._id;
  if (target !== viewer._id) {
    await requireCanViewUser(ctx, target);
  }
  return target;
}

export const getActiveSladeshForUser = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args): Promise<Doc<"sladeshChallenges"> | null> => {
    const userId = await resolveTarget(ctx, args.userId);
    const active = await findActive(ctx, userId);

    if (active === null) {
      console.log("[Sladesh] ingen aktiv udfordring", { userId });
    }
    return active;
  },
});

/** Om brugeren er optaget af en aktiv Sladesh — erstatter `!!activeSladesh`. */
export const hasActiveSladesh = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args): Promise<boolean> => {
    const userId = await resolveTarget(ctx, args.userId);
    return (await findActive(ctx, userId)) !== null;
  },
});
