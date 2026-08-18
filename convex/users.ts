import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { AVATAR_COLOR_NAMES, isAvatarColor } from "./constants";
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
      // Emailen logges IKKE. Convex-loggen er ikke et sted for
      // personoplysninger, og id'et er nok til at finde rækken.
      console.log("[User] createUser afvist — email findes allerede", {
        eksisterende: existingByEmail._id,
      });
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

    console.log("[User] profil oprettet", { userId });
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

/** Længdegrænser for profilfelter. Nye — det gamle repo havde ingen. */
export const NAVN_MAX = 40;
export const FULDT_NAVN_MAX = 100;
/** Emoji fylder flere UTF-16-enheder; 8 rummer også sammensatte tegn. */
export const EMOJI_MAX = 8;

/**
 * Retter den indloggede brugers egen profil.
 *
 * Hullet der blokerede /settings, /profile og /onboarding: felterne har været
 * i schemaet siden fase 1, men `createUser` satte dem én gang, og der fandtes
 * ingen vej til at ændre dem bagefter.
 *
 * Man kan kun rette SIG SELV. Der er bevidst ingen `userId`-parameter — heller
 * ikke for admins. Skal en admin kunne rette andres profiler, er det en anden
 * funktion med sin egen begrundelse.
 *
 * Konventionen er som i `promille.setPromilleIndstilling`:
 * `undefined` = rør ikke feltet, `null` = ryd det.
 *
 * `email` og `authId` kan ikke ændres her — de kommer fra Firebase-tokenet og
 * ville kunne bruges til at overtage en anden profil.
 */
export const opdaterProfil = mutation({
  args: {
    displayName: v.optional(v.string()),
    fullName: v.optional(v.union(v.string(), v.null())),
    photoURL: v.optional(v.union(v.string(), v.null())),
    emoji: v.optional(v.union(v.string(), v.null())),
    avatarColor: v.optional(v.union(v.string(), v.null())),
    profileEmoji: v.optional(v.union(v.string(), v.null())),
    profileGradient: v.optional(v.union(v.string(), v.null())),
    onboardingCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireCurrentUser(ctx);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.displayName !== undefined) {
      const displayName = args.displayName.trim();
      // Til forskel fra de øvrige kan visningsnavnet ikke ryddes: det står
      // på scoreboardet og i hver logrække, og en tom streng ville vise sig
      // som et hul overalt i appen.
      if (displayName.length === 0) {
        throw new ConvexError({
          code: "EMPTY_DISPLAY_NAME",
          message: "Visningsnavnet må ikke være tomt.",
        });
      }
      patch.displayName = kraeverLaengde(displayName, NAVN_MAX, "Visningsnavnet");
    }

    if (args.fullName !== undefined) {
      patch.fullName = tomTilUndefined(args.fullName, FULDT_NAVN_MAX, "Det fulde navn");
    }

    if (args.photoURL !== undefined) {
      patch.photoURL = tomTilUndefined(args.photoURL, 2000, "Billed-URL'en");
    }

    if (args.emoji !== undefined) {
      patch.emoji = tomTilUndefined(args.emoji, EMOJI_MAX, "Avatar-emojien");
    }

    if (args.profileEmoji !== undefined) {
      patch.profileEmoji = tomTilUndefined(args.profileEmoji, EMOJI_MAX, "Status-emojien");
    }

    if (args.profileGradient !== undefined) {
      // Frit format: en Tailwind-klassestreng som "from-gray-400 to-gray-600".
      patch.profileGradient = tomTilUndefined(args.profileGradient, 200, "Gradienten");
    }

    if (args.avatarColor !== undefined) {
      if (args.avatarColor === null || args.avatarColor.trim().length === 0) {
        patch.avatarColor = undefined;
      } else {
        const farve = args.avatarColor.trim();
        // NY spærre: farven skal være en af de kendte. Uden den kunne der
        // gemmes et navn, ingen skærm kan tegne, og brugeren ville få
        // fallback-farven uden at forstå hvorfor.
        if (!isAvatarColor(farve)) {
          throw new ConvexError({
            code: "UNKNOWN_AVATAR_COLOR",
            message:
              `"${farve}" er ikke en kendt avatar-farve. Gyldige: ` +
              AVATAR_COLOR_NAMES.join(", "),
          });
        }
        patch.avatarColor = farve;
      }
    }

    if (args.onboardingCompleted !== undefined) {
      patch.onboardingCompleted = args.onboardingCompleted;
    }

    await ctx.db.patch(user._id, patch);

    // Kun FELTNAVNE logges. Et visningsnavn er en personoplysning.
    console.log("[User] profil opdateret", {
      userId: user._id,
      felter: Object.keys(patch).filter((navn) => navn !== "updatedAt"),
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

/**
 * Trimmer og længdetjekker. Tom streng og `null` bliver til `undefined`, som
 * i Convex fjerner feltet — samme virkning som `deleteField()` i Firestore.
 */
function tomTilUndefined(
  raa: string | null,
  max: number,
  etiket: string,
): string | undefined {
  if (raa === null) return undefined;
  const vaerdi = raa.trim();
  if (vaerdi.length === 0) return undefined;
  return kraeverLaengde(vaerdi, max, etiket);
}

function kraeverLaengde(vaerdi: string, max: number, etiket: string): string {
  if (vaerdi.length > max) {
    throw new ConvexError({
      code: "FIELD_TOO_LONG",
      message: `${etiket} må højst fylde ${max} tegn (var ${vaerdi.length}).`,
    });
  }
  return vaerdi;
}
