import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  getAuthId,
  getCurrentUser,
  requireCanViewUser,
  requireCurrentUser,
} from "./identity";

/**
 * Bruger-mutations og -queries.
 *
 * Identiteten kommer fra det verificerede Firebase-token, ikke fra
 * argumenterne — se convex/identity.ts.
 *
 * VIGTIGT om unikhed: Convex håndhæver IKKE unikke indexes. `by_email` og
 * `by_auth_id` gør opslaget hurtigt, men siger intet om unikhed — den skal
 * tjekkes eksplicit før insert. Fordi mutations kører i en serialiserbar
 * transaktion, er læs-så-skriv her fri for race conditions.
 */

/**
 * Opretter profilen for den INDLOGGEDE bruger.
 *
 * `authId` og `email` tages fra tokenet, ikke fra klienten — ellers kunne man
 * oprette en profil på en andens Firebase-konto. Idempotent: findes profilen
 * allerede, returneres den eksisterende, så et gentaget kald efter signup
 * ikke fejler.
 */
export const createUser = mutation({
  args: {
    displayName: v.optional(v.string()),
    fullName: v.optional(v.string()),
    photoURL: v.optional(v.string()),
    emoji: v.optional(v.string()),
    avatarColor: v.optional(v.string()),
    profileEmoji: v.optional(v.string()),
    profileGradient: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError({
        code: "NOT_AUTHENTICATED",
        message: "Du skal være logget ind for at oprette en profil.",
      });
    }

    const authId = identity.subject;
    const email = normalizeEmail(identity.email ?? "");

    if (email === "") {
      throw new ConvexError({
        code: "NO_EMAIL_IN_TOKEN",
        message:
          "Firebase-tokenet indeholder ingen email. Log ind med email/adgangskode eller Google.",
      });
    }

    // Findes profilen allerede for denne Firebase-konto, er kaldet et no-op.
    const existingByAuth = await ctx.db
      .query("users")
      .withIndex("by_auth_id", (q) => q.eq("authId", authId))
      .unique();

    if (existingByAuth !== null) {
      console.log("[User] profil findes allerede — ingen ændring", {
        userId: existingByAuth._id,
      });
      return existingByAuth._id;
    }

    // Emailen skal være ledig. Den kan være taget af en ANDEN Firebase-konto,
    // fx hvis brugeren først har oprettet sig med adgangskode og siden med
    // Google — det skal fanges frem for at give to profiler.
    const existingByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existingByEmail !== null) {
      console.log("[User] createUser afvist — email findes allerede", { email });
      throw new ConvexError({
        code: "EMAIL_ALREADY_EXISTS",
        message: `Der findes allerede en profil med emailen "${email}".`,
      });
    }

    // Samme default som det gamle repo: displayName falder tilbage til
    // delen før @ i emailen.
    const displayName =
      args.displayName?.trim() ||
      identity.name?.trim() ||
      email.split("@")[0];

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      authId,
      email,
      displayName,
      fullName: args.fullName,
      photoURL: args.photoURL ?? identity.pictureUrl,
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
      // isAdmin sættes bevidst IKKE her — kun manuelt via dashboardet.
      createdAt: now,
      updatedAt: now,
    });

    console.log("[User] profil oprettet", { userId, email });
    return userId;
  },
});

/** Sætter den indloggede brugers aktive Kanal. Kræver medlemskab. */
export const setActiveChannel = mutation({
  args: { channelId: v.id("kanaler") },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireCurrentUser(ctx);

    const kanal = await ctx.db.get(args.channelId);
    if (kanal === null) {
      throw new ConvexError({
        code: "KANAL_NOT_FOUND",
        message: "Kanalen findes ikke.",
      });
    }

    if (!user.joinedChannelIds.includes(args.channelId)) {
      console.log("[User] setActiveChannel afvist — ikke medlem", {
        userId: user._id,
        channelId: args.channelId,
      });
      throw new ConvexError({
        code: "NOT_A_MEMBER",
        message: `Du er ikke medlem af "${kanal.name}".`,
      });
    }

    await ctx.db.patch(user._id, {
      activeChannelId: args.channelId,
      updatedAt: Date.now(),
    });

    console.log("[User] aktiv kanal sat", {
      userId: user._id,
      kanal: kanal.name,
    });
  },
});

/**
 * Opdaterer den indloggede brugers live-position.
 *
 * Modparten til det gamle repos kort, som skrev `users.location` direkte fra
 * klienten. Feltet er det beacon-evalueringen læser, og dets `lastUpdated`
 * afgør om positionen er frisk nok til at tælle — derfor sættes tidsstemplet
 * her på serveren og ikke af klienten.
 */
export const opdaterPosition = mutation({
  args: { lat: v.number(), lng: v.number() },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireCurrentUser(ctx);

    const gyldig =
      Number.isFinite(args.lat) &&
      Number.isFinite(args.lng) &&
      args.lat >= -90 &&
      args.lat <= 90 &&
      args.lng >= -180 &&
      args.lng <= 180;

    if (!gyldig) {
      throw new ConvexError({
        code: "INVALID_LOCATION",
        message: "Koordinaterne er uden for jorden.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(user._id, {
      location: { lat: args.lat, lng: args.lng, lastUpdated: now },
      updatedAt: now,
    });
  },
});

/**
 * Den indloggede brugers egen profil.
 *
 * Returnerer null både når man ikke er logget ind, og når man er logget ind
 * uden profil — frontenden bruger det til at afgøre om onboarding skal vises.
 */
export const getMe = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

/** Om den indloggede Firebase-konto allerede har en profil. */
export const hasProfile = query({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const authId = await getAuthId(ctx);
    if (authId === null) return false;
    const user = await ctx.db
      .query("users")
      .withIndex("by_auth_id", (q) => q.eq("authId", authId))
      .unique();
    return user !== null;
  },
});

/**
 * En anden brugers profil. Kræver at I deler mindst én Kanal.
 *
 * `authId` og `email` fjernes fra svaret — de hører til kontoen, ikke til det
 * offentlige profilbillede, og andre brugere har ingen grund til at se dem.
 */
export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { target } = await requireCanViewUser(ctx, args.userId);
    const { authId: _authId, email: _email, ...offentlig } = target;
    return offentlig;
  },
});

/**
 * Emails sammenlignes normaliseret, ellers ville "A@b.dk" og "a@b.dk" kunne
 * oprettes som to profiler og gøre unikhedstjekket meningsløst.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
