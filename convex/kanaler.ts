import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCurrentUser, requireKanalMedlem } from "./identity";

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
    description: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"kanaler">> => {
    // Opretteren er altid den indloggede bruger.
    const user = await requireCurrentUser(ctx);
    const code = normalizeCode(args.code);

    // Tjek FØRST at koden er ledig — Convex gør det ikke for os.
    const existing = await ctx.db
      .query("kanaler")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();

    if (existing !== null) {
      console.log("[Kanal] createKanal afvist — kode i brug", {
        eksisterende: existing._id,
      });
      throw new ConvexError({
        code: "KANAL_CODE_ALREADY_EXISTS",
        message: `Koden "${code}" er allerede i brug af Kanalen "${existing.name}".`,
      });
    }

    const now = Date.now();
    const channelId = await ctx.db.insert("kanaler", {
      name: args.name,
      code,
      // `isDefault` kan IKKE sættes af klienten. Default-kanalen bestemmer
      // hvor nye brugere lander, og det er en admin-beslutning.
      isDefault: false,
      description: args.description,
      members: [user._id],
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Opretteren er medlem fra start — hold begge sider af relationen i sync
    // i samme transaktion.
    await ctx.db.patch(user._id, {
      joinedChannelIds: [...user.joinedChannelIds, channelId],
      updatedAt: now,
    });

    // Invitationskoden logges IKKE — den ER adgangsbeviset til Kanalen.
    console.log("[Kanal] oprettet", { channelId, navn: args.name });
    return channelId;
  },
});

/**
 * Melder den indloggede bruger ind i en Kanal via invitationskoden.
 *
 * Koden ER adgangsbeviset — kender man den, må man melde sig ind. Derfor er
 * dette den ene query-agtige vej hvor man må slå en Kanal op uden at være
 * medlem i forvejen.
 *
 * Idempotent: er man allerede medlem, er kaldet et no-op frem for en fejl.
 */
export const joinKanal = mutation({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<Id<"kanaler">> => {
    const user = await requireCurrentUser(ctx);
    const code = normalizeCode(args.code);

    const kanal = await ctx.db
      .query("kanaler")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();

    if (kanal === null) {
      console.log("[Kanal] joinKanal afvist — ukendt kode");
      throw new ConvexError({
        code: "KANAL_NOT_FOUND",
        message: `Der findes ingen Kanal med koden "${code}".`,
      });
    }

    if (user.joinedChannelIds.includes(kanal._id)) {
      console.log("[Kanal] allerede medlem — ingen ændring", {
        userId: user._id,
        kanal: kanal.name,
      });
      return kanal._id;
    }

    const now = Date.now();

    // Begge sider af relationen opdateres i samme transaktion.
    await ctx.db.patch(kanal._id, {
      members: [...kanal.members, user._id],
      updatedAt: now,
    });
    await ctx.db.patch(user._id, {
      joinedChannelIds: [...user.joinedChannelIds, kanal._id],
      updatedAt: now,
    });

    console.log("[Kanal] bruger meldt ind", {
      userId: user._id,
      kanal: kanal.name,
      medlemmer: kanal.members.length + 1,
    });
    return kanal._id;
  },
});

/** Én Kanal. Kræver medlemskab. */
export const getKanal = query({
  args: { channelId: v.id("kanaler") },
  handler: async (ctx, args) => {
    const { kanal } = await requireKanalMedlem(ctx, args.channelId);
    return kanal;
  },
});

/** De Kanaler den indloggede bruger er medlem af. */
export const getMineKanaler = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const kanaler = await Promise.all(
      user.joinedChannelIds.map((channelId) => ctx.db.get(channelId)),
    );
    return kanaler.filter((kanal) => kanal !== null);
  },
});

/**
 * Slår en Kanal op på invitationskode, så man kan se hvad man er ved at melde
 * sig ind i. Kræver login, men ikke medlemskab — koden er adgangsbeviset.
 *
 * Returnerer bevidst kun navn og beskrivelse. Medlemslisten ville lække hvem
 * der er i Kanalen til enhver der gætter en kode.
 */
export const getKanalByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx);

    const kanal = await ctx.db
      .query("kanaler")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(args.code)))
      .unique();

    if (kanal === null) return null;

    return {
      _id: kanal._id,
      name: kanal.name,
      description: kanal.description,
      memberCount: kanal.members.length,
    };
  },
});

/**
 * Koder sammenlignes normaliseret (trimmet + store bogstaver), så "fri-9024"
 * og "FRI-9024" er den samme kode. Ellers kunne unikhedstjekket omgås.
 */
function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
