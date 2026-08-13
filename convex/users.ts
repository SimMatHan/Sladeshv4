import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Bruger-mutations og -queries.
 *
 * VIGTIGT om unikhed: Convex håndhæver IKKE unikke indexes. `by_email` gør
 * opslaget hurtigt, men siger intet om unikhed — den skal tjekkes eksplicit
 * før insert. Fordi mutations kører i en serialiserbar transaktion, er
 * læs-så-skriv her fri for race conditions: to samtidige `createUser` med
 * samme email kan ikke begge slippe igennem, den ene får en konflikt og
 * køres om.
 */

export const createUser = mutation({
  args: {
    authId: v.string(),
    email: v.string(),
    displayName: v.string(),
    fullName: v.optional(v.string()),
    photoURL: v.optional(v.string()),
    emoji: v.optional(v.string()),
    avatarColor: v.optional(v.string()),
    profileEmoji: v.optional(v.string()),
    profileGradient: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    const email = normalizeEmail(args.email);

    // Tjek FØRST om emailen findes — Convex gør det ikke for os.
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing !== null) {
      console.log("[User] createUser afvist — email findes allerede", { email });
      throw new ConvexError({
        code: "EMAIL_ALREADY_EXISTS",
        message: `Der findes allerede en bruger med emailen "${email}".`,
      });
    }

    // Samme tjek for auth-identiteten, så den samme konto ikke kan oprettes to
    // gange under forskellige emails.
    const existingAuth = await ctx.db
      .query("users")
      .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
      .unique();

    if (existingAuth !== null) {
      console.log("[User] createUser afvist — authId findes allerede", {
        authId: args.authId,
      });
      throw new ConvexError({
        code: "AUTH_ID_ALREADY_EXISTS",
        message: `Der findes allerede en bruger for denne auth-identitet.`,
      });
    }

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      authId: args.authId,
      email,
      displayName: args.displayName,
      fullName: args.fullName,
      photoURL: args.photoURL,
      emoji: args.emoji,
      avatarColor: args.avatarColor,
      profileEmoji: args.profileEmoji,
      profileGradient: args.profileGradient,
      joinedChannelIds: [],
      onboardingCompleted: false,
      checkInStatus: false,
      checkInCount: 0,
      totalPoints: 0,
      longestStreak: 0,
      currentDayStreak: 0,
      totalRunResets: 0,
      sladeshSent: 0,
      sladeshReceived: 0,
      sladeshCompletedCount: 0,
      sladeshFailedCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    console.log("[User] oprettet", { userId, email });
    return userId;
  },
});

/**
 * Sætter brugerens aktive Kanal.
 *
 * Kræver at brugeren faktisk er medlem — ellers ville scoreboardet og
 * kanal-visningen pege på en Kanal brugeren ikke har adgang til.
 */
export const setActiveChannel = mutation({
  args: {
    userId: v.id("users"),
    channelId: v.id("kanaler"),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Brugeren findes ikke.",
      });
    }

    const kanal = await ctx.db.get(args.channelId);
    if (kanal === null) {
      throw new ConvexError({
        code: "KANAL_NOT_FOUND",
        message: "Kanalen findes ikke.",
      });
    }

    if (!user.joinedChannelIds.includes(args.channelId)) {
      console.log("[User] setActiveChannel afvist — ikke medlem", {
        userId: args.userId,
        channelId: args.channelId,
      });
      throw new ConvexError({
        code: "NOT_A_MEMBER",
        message: `Brugeren er ikke medlem af "${kanal.name}".`,
      });
    }

    await ctx.db.patch(args.userId, {
      activeChannelId: args.channelId,
      updatedAt: Date.now(),
    });

    console.log("[User] aktiv kanal sat", {
      userId: args.userId,
      kanal: kanal.name,
    });
  },
});

export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(args.email)))
      .unique();
  },
});

/**
 * Emails sammenlignes normaliseret, ellers ville "A@b.dk" og "a@b.dk" kunne
 * oprettes som to brugere og gøre unikhedstjekket meningsløst.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
