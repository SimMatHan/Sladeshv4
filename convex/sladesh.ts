import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireCanViewUser, requireCurrentUser } from "./identity";

/**
 * Sladesh — opslag af den aktive udfordring.
 *
 * Dette erstatter det fjernede `users.activeSladesh`-felt. I stedet for at
 * holde en kopi af udfordringens tilstand på brugerdokumentet, slås den op
 * direkte i `sladeshChallenges`, hvor `status` er sandhedskilden. Der er
 * dermed intet at holde i sync, og den klasse af fejl er væk.
 *
 * En bruger kan være involveret i en udfordring på to måder, så der skal to
 * opslag til:
 *
 * - som MODTAGER: `by_recipient_and_status` rammer direkte på
 *   (recipientId, status) — det præcise opslag.
 * - som AFSENDER: der findes ikke et (senderId, status)-index, så
 *   `by_sender_and_created_at` bruges baglæns fra nyeste og filtreres på
 *   status. Fase 2 måtte kun ændre schemaet ét sted, så indexet er ikke
 *   tilføjet — se noten nederst.
 *
 * Kun status "in_progress" regnes som aktiv. "pending" er en udfordring der
 * er sendt men ikke påbegyndt, og den blokerede heller ikke i det gamle repo,
 * hvor låsen udtrykkeligt var `status: 'in_progress'`.
 */

const ACTIVE_STATUS = "in_progress" as const;

/**
 * Hvor langt tilbage vi leder i afsenderens historik, når vi ikke har et
 * (senderId, status)-index. En bruger kan højst have én aktiv udfordring ad
 * gangen, og listen er sorteret nyeste-først, så den aktive ligger i toppen
 * hvis den findes.
 */
const SENDER_SCAN_LIMIT = 25;

export const getActiveSladeshForUser = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args): Promise<Doc<"sladeshChallenges"> | null> => {
    // Uden userId spørges der om en selv. Ellers kræves en delt Kanal.
    const viewer = await requireCurrentUser(ctx);
    const userId = args.userId ?? viewer._id;
    if (userId !== viewer._id) {
      await requireCanViewUser(ctx, userId);
    }

    // Som modtager — præcist indeks-opslag.
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

    // Som afsender — nyeste først, filtrér på status.
    const recentAsSender = await ctx.db
      .query("sladeshChallenges")
      .withIndex("by_sender_and_created_at", (q) => q.eq("senderId", userId))
      .order("desc")
      .take(SENDER_SCAN_LIMIT);

    const asSender =
      recentAsSender.find((challenge) => challenge.status === ACTIVE_STATUS) ??
      null;

    if (asSender !== null) {
      console.log("[Sladesh] aktiv udfordring fundet (afsender)", {
        userId,
        challengeId: asSender._id,
      });
      return asSender;
    }

    console.log("[Sladesh] ingen aktiv udfordring", { userId });
    return null;
  },
});

/** Om brugeren er optaget af en aktiv Sladesh — erstatter `!!activeSladesh`. */
export const hasActiveSladesh = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args): Promise<boolean> => {
    const viewer = await requireCurrentUser(ctx);
    const userId = args.userId ?? viewer._id;
    if (userId !== viewer._id) {
      await requireCanViewUser(ctx, userId);
    }

    const asRecipient = await ctx.db
      .query("sladeshChallenges")
      .withIndex("by_recipient_and_status", (q) =>
        q.eq("recipientId", userId).eq("status", ACTIVE_STATUS),
      )
      .first();

    if (asRecipient !== null) return true;

    const recentAsSender = await ctx.db
      .query("sladeshChallenges")
      .withIndex("by_sender_and_created_at", (q) => q.eq("senderId", userId))
      .order("desc")
      .take(SENDER_SCAN_LIMIT);

    return recentAsSender.some(
      (challenge) => challenge.status === ACTIVE_STATUS,
    );
  },
});
