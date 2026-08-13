import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Kanal-mutations og -queries.
 *
 * Kanalnavne er kanoniske danske strenge ("Den Åbne Kanal", "Ballade",
 * "Brøndby IF") og gemmes ordret som de skrives ind.
 *
 * Som i users.ts: Convex håndhæver ikke unikke indexes, så `code` tjekkes
 * eksplicit mod `by_code` før insert.
 */

export const createKanal = mutation({
  args: {
    name: v.string(),
    code: v.string(),
    createdBy: v.id("users"),
    description: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"kanaler">> => {
    const code = normalizeCode(args.code);

    // Tjek FØRST at koden er ledig — Convex gør det ikke for os.
    const existing = await ctx.db
      .query("kanaler")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();

    if (existing !== null) {
      console.log("[Kanal] createKanal afvist — kode i brug", { code });
      throw new ConvexError({
        code: "KANAL_CODE_ALREADY_EXISTS",
        message: `Koden "${code}" er allerede i brug af Kanalen "${existing.name}".`,
      });
    }

    const creator = await ctx.db.get(args.createdBy);
    if (creator === null) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Opretteren findes ikke.",
      });
    }

    const now = Date.now();
    const channelId = await ctx.db.insert("kanaler", {
      name: args.name,
      code,
      isDefault: args.isDefault ?? false,
      description: args.description,
      members: [args.createdBy],
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    // Opretteren er medlem fra start — hold begge sider af relationen i sync
    // i samme transaktion.
    await ctx.db.patch(args.createdBy, {
      joinedChannelIds: [...creator.joinedChannelIds, channelId],
      updatedAt: now,
    });

    console.log("[Kanal] oprettet", { channelId, navn: args.name, code });
    return channelId;
  },
});

/**
 * Melder en bruger ind i en Kanal via invitationskoden.
 *
 * Idempotent: er brugeren allerede medlem, er kaldet et no-op frem for en
 * fejl — at trykke på det samme invitationslink to gange skal ikke fejle.
 */
export const joinKanal = mutation({
  args: {
    userId: v.id("users"),
    code: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"kanaler">> => {
    const code = normalizeCode(args.code);

    const kanal = await ctx.db
      .query("kanaler")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();

    if (kanal === null) {
      console.log("[Kanal] joinKanal afvist — ukendt kode", { code });
      throw new ConvexError({
        code: "KANAL_NOT_FOUND",
        message: `Der findes ingen Kanal med koden "${code}".`,
      });
    }

    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Brugeren findes ikke.",
      });
    }

    if (user.joinedChannelIds.includes(kanal._id)) {
      console.log("[Kanal] allerede medlem — ingen ændring", {
        userId: args.userId,
        kanal: kanal.name,
      });
      return kanal._id;
    }

    const now = Date.now();

    // Begge sider af relationen opdateres i samme transaktion, så de aldrig
    // kan komme ud af sync.
    await ctx.db.patch(kanal._id, {
      members: [...kanal.members, args.userId],
      updatedAt: now,
    });
    await ctx.db.patch(args.userId, {
      joinedChannelIds: [...user.joinedChannelIds, kanal._id],
      updatedAt: now,
    });

    console.log("[Kanal] bruger meldt ind", {
      userId: args.userId,
      kanal: kanal.name,
      medlemmer: kanal.members.length + 1,
    });
    return kanal._id;
  },
});

export const getKanal = query({
  args: { channelId: v.id("kanaler") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.channelId);
  },
});

export const getKanalByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("kanaler")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(args.code)))
      .unique();
  },
});

/**
 * Koder sammenlignes normaliseret (trimmet + store bogstaver), så "fri-9024"
 * og "FRI-9024" er den samme kode. Ellers ville unikhedstjekket kunne omgås.
 */
function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
