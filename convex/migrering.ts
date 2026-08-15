import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { computeStreak, pointsForDrink } from "./streaks";

/**
 * Migrering fra Firestore til Convex.
 *
 * Kaldes af scripts/migrer.ts, som læser produktions-Firestore lokalt og
 * sender transformerede rækker herind.
 *
 * OM ADGANGSKONTROLLEN: fase 5's oplæg bad om `internalMutation`, så
 * funktionerne ikke er kaldbare fra klienten. Det er ikke praktisk muligt her:
 * `ConvexHttpClient` eksponerer ikke admin-auth (`adminAuth` er privat), og
 * `npx convex run` tager sine argumenter som JSON på kommandolinjen — 1.725
 * drikkelogninger går ikke gennem et argv.
 *
 * I stedet er hver funktion spærret af en hemmelighed, der kun findes som
 * deployment-variabel:
 *
 *   export MIGRATION_SECRET=$(openssl rand -hex 32)
 *   npx convex env set MIGRATION_SECRET "$MIGRATION_SECRET"
 *
 * Generér den ÉN gang i en shell-variabel og brug den begge steder — sætter
 * man den direkte med `$(openssl …)`, kender man den aldrig selv. Den kan
 * hentes tilbage med `npx convex env get MIGRATION_SECRET`.
 *
 * Effekten er den samme — en klient uden hemmeligheden kan intet — og
 * spærren kan fjernes permanent efter cutover:
 *
 *   npx convex env remove MIGRATION_SECRET
 *
 * Uden variablen sat afviser hver eneste funktion herunder. Hele filen bør
 * slettes, når migreringen er endeligt gennemført.
 */

/**
 * Læser en deployment-variabel uden at kræve node-typer.
 *
 * Denne fil indgår i `api`-modulgrafen, som frontenden importerer, så den
 * typechecker OGSÅ i frontend-programmet — og dér findes `process` ikke.
 * `convex/auth.config.ts` slipper for det, fordi codegen udelader filer med
 * mere end ét punktum i navnet.
 */
function deploymentVariabel(navn: string): string | undefined {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return g.process?.env?.[navn];
}

function kræverHemmelighed(secret: string): void {
  const forventet = deploymentVariabel("MIGRATION_SECRET");

  if (!forventet) {
    throw new ConvexError({
      code: "MIGRATION_DISABLED",
      message:
        "MIGRATION_SECRET er ikke sat på deploymentet. Migreringsfunktionerne " +
        "er slået fra. Kør: npx convex env set MIGRATION_SECRET <hemmelighed>",
    });
  }

  if (secret !== forventet) {
    throw new ConvexError({
      code: "MIGRATION_FORBIDDEN",
      message: "Forkert migreringshemmelighed.",
    });
  }
}

const hemmelighed = { secret: v.string() };

/** Tæller rækker per tabel, så scriptet kan se om der allerede er data. */
export const status = query({
  args: hemmelighed,
  handler: async (ctx, args): Promise<Record<string, number>> => {
    kræverHemmelighed(args.secret);
    const tabeller = [
      "users",
      "kanaler",
      "checkIns",
      "drinkLogs",
      "achievements",
      "messages",
      "beacons",
      "sladeshChallenges",
    ] as const;

    const ud: Record<string, number> = {};
    for (const tabel of tabeller) {
      ud[tabel] = (await ctx.db.query(tabel).collect()).length;
    }
    return ud;
  },
});

/**
 * Rydder ALT migreret data. Kun til gentagne tørkørsler mod dev.
 *
 * Bevidst destruktiv og bevidst eksplicit: scriptet kalder den kun med et
 * udtrykkeligt flag, og den kræver samme hemmelighed som resten.
 */
export const ryd = mutation({
  args: hemmelighed,
  handler: async (ctx, args): Promise<Record<string, number>> => {
    kræverHemmelighed(args.secret);
    const tabeller = [
      "achievements",
      "drinkLogs",
      "checkIns",
      "messages",
      "sladeshChallenges",
      "beacons",
      "kanaler",
      "users",
    ] as const;

    const slettet: Record<string, number> = {};
    for (const tabel of tabeller) {
      const rækker = await ctx.db.query(tabel).collect();
      for (const række of rækker) await ctx.db.delete(række._id);
      slettet[tabel] = rækker.length;
    }

    console.log("[Migrering] alt data ryddet", slettet);
    return slettet;
  },
});

// ---------------------------------------------------------------------------
// Trin 1: brugere (uden kanalreferencer — de sættes i trin 3)
// ---------------------------------------------------------------------------

const brugerFelter = v.object({
  /** Firestore-dokument-id, så scriptet kan bygge id-mappingen. */
  firestoreId: v.string(),
  authId: v.string(),
  email: v.string(),
  displayName: v.string(),
  fullName: v.optional(v.string()),
  photoURL: v.optional(v.string()),
  onboardingCompleted: v.optional(v.boolean()),
  isAdmin: v.optional(v.boolean()),
  checkInStatus: v.optional(v.boolean()),
  lastCheckIn: v.optional(v.number()),
  lastCheckInVenue: v.optional(v.string()),
  lastStatusCheckedAt: v.optional(v.number()),
  checkInCount: v.optional(v.number()),
  location: v.optional(
    v.object({ lat: v.number(), lng: v.number(), lastUpdated: v.number() }),
  ),
  currentLocation: v.optional(
    v.object({
      lat: v.number(),
      lng: v.number(),
      venue: v.string(),
      timestamp: v.number(),
    }),
  ),
  lastDrinkAt: v.optional(v.number()),
  lastDrinkDayStart: v.optional(v.number()),
  totalRunResets: v.optional(v.number()),
  promille: v.optional(
    v.object({
      enabled: v.boolean(),
      gender: v.optional(v.union(v.literal("male"), v.literal("female"))),
      weight: v.optional(v.number()),
      height: v.optional(v.number()),
    }),
  ),
  sladeshSent: v.optional(v.number()),
  sladeshReceived: v.optional(v.number()),
  sladeshCompletedCount: v.optional(v.number()),
  sladeshFailedCount: v.optional(v.number()),
  lastSladeshSentAt: v.optional(v.number()),
  emoji: v.optional(v.string()),
  avatarColor: v.optional(v.string()),
  profileEmoji: v.optional(v.string()),
  profileGradient: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
});

export const indsætBrugere = mutation({
  args: { ...hemmelighed, brugere: v.array(brugerFelter) },
  handler: async (ctx, args): Promise<Record<string, Id<"users">>> => {
    kræverHemmelighed(args.secret);
    const map: Record<string, Id<"users">> = {};

    for (const { firestoreId, ...felter } of args.brugere) {
      // Idempotens: authId er unik per Firebase-konto.
      const findes = await ctx.db
        .query("users")
        .withIndex("by_auth_id", (q) => q.eq("authId", felter.authId))
        .unique();

      if (findes !== null) {
        map[firestoreId] = findes._id;
        continue;
      }

      // joinedChannelIds sættes i trin 3, når kanalerne findes.
      map[firestoreId] = await ctx.db.insert("users", {
        ...felter,
        joinedChannelIds: [],
      });
    }

    console.log("[Migrering] brugere indsat", { antal: args.brugere.length });
    return map;
  },
});

// ---------------------------------------------------------------------------
// Trin 2: kanaler
// ---------------------------------------------------------------------------

export const indsætKanaler = mutation({
  args: {
    ...hemmelighed,
    kanaler: v.array(
      v.object({
        firestoreId: v.string(),
        name: v.string(),
        code: v.optional(v.string()),
        isDefault: v.boolean(),
        description: v.optional(v.string()),
        /** Allerede oversat til Convex-id'er af scriptet. */
        members: v.array(v.id("users")),
        createdBy: v.optional(v.id("users")),
        createdAt: v.number(),
        updatedAt: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<Record<string, Id<"kanaler">>> => {
    kræverHemmelighed(args.secret);
    const map: Record<string, Id<"kanaler">> = {};

    for (const { firestoreId, ...felter } of args.kanaler) {
      // Idempotens: navnet er den eneste nøgle der findes på alle kanaler —
      // `code` mangler på mindst én.
      const findes = await ctx.db
        .query("kanaler")
        .withIndex("by_name", (q) => q.eq("name", felter.name))
        .first();

      if (findes !== null) {
        map[firestoreId] = findes._id;
        continue;
      }

      map[firestoreId] = await ctx.db.insert("kanaler", felter);
    }

    console.log("[Migrering] kanaler indsat", { antal: args.kanaler.length });
    return map;
  },
});

// ---------------------------------------------------------------------------
// Trin 3: kobl brugere til kanaler
// ---------------------------------------------------------------------------

export const koblBrugereTilKanaler = mutation({
  args: {
    ...hemmelighed,
    koblinger: v.array(
      v.object({
        userId: v.id("users"),
        joinedChannelIds: v.array(v.id("kanaler")),
        activeChannelId: v.optional(v.id("kanaler")),
        favoriteChannelId: v.optional(v.id("kanaler")),
      }),
    ),
  },
  handler: async (ctx, args): Promise<number> => {
    kræverHemmelighed(args.secret);

    for (const { userId, ...felter } of args.koblinger) {
      await ctx.db.patch(userId, felter);
    }

    console.log("[Migrering] kanalkoblinger sat", {
      antal: args.koblinger.length,
    });
    return args.koblinger.length;
  },
});

// ---------------------------------------------------------------------------
// Trin 4: historik
// ---------------------------------------------------------------------------

export const indsætCheckIns = mutation({
  args: {
    ...hemmelighed,
    rækker: v.array(
      v.object({
        userId: v.id("users"),
        channelId: v.optional(v.id("kanaler")),
        venue: v.string(),
        location: v.optional(v.object({ lat: v.number(), lng: v.number() })),
        timestamp: v.number(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<number> => {
    kræverHemmelighed(args.secret);
    for (const række of args.rækker) await ctx.db.insert("checkIns", række);
    return args.rækker.length;
  },
});

export const indsætDrinkLogs = mutation({
  args: {
    ...hemmelighed,
    rækker: v.array(
      v.object({
        userId: v.id("users"),
        channelId: v.optional(v.id("kanaler")),
        categoryId: v.string(),
        variationName: v.string(),
        sizeId: v.optional(v.string()),
        sizeMultiplier: v.optional(v.number()),
        sizeLabel: v.optional(v.string()),
        sizeVolume: v.optional(v.string()),
        location: v.optional(v.object({ lat: v.number(), lng: v.number() })),
        timestamp: v.number(),
        userDisplayName: v.optional(v.string()),
        userEmoji: v.optional(v.string()),
        userProfileEmoji: v.optional(v.string()),
        userProfileGradient: v.optional(v.string()),
        isReset: v.optional(v.boolean()),
        action: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<number> => {
    kræverHemmelighed(args.secret);
    for (const række of args.rækker) await ctx.db.insert("drinkLogs", række);
    return args.rækker.length;
  },
});

export const indsætAchievements = mutation({
  args: {
    ...hemmelighed,
    rækker: v.array(
      v.object({
        userId: v.id("users"),
        achievementId: v.string(),
        count: v.number(),
        unlockedAt: v.optional(v.number()),
        firstUnlockedAt: v.optional(v.number()),
        lastUnlockedAt: v.optional(v.number()),
        maxStreak: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<number> => {
    kræverHemmelighed(args.secret);
    for (const række of args.rækker) await ctx.db.insert("achievements", række);
    return args.rækker.length;
  },
});

export const indsætBeacons = mutation({
  args: {
    ...hemmelighed,
    rækker: v.array(
      v.object({
        createdBy: v.id("users"),
        channelId: v.optional(v.id("kanaler")),
        lat: v.number(),
        lng: v.number(),
        title: v.optional(v.string()),
        type: v.optional(v.string()),
        radius: v.optional(v.number()),
        venue: v.optional(v.string()),
        message: v.optional(v.string()),
        active: v.boolean(),
        notificationsSent: v.optional(v.number()),
        lastNotificationSentAt: v.optional(v.number()),
        notifiedUsers: v.optional(v.record(v.string(), v.boolean())),
        expiresAt: v.optional(v.number()),
        deactivatedAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<number> => {
    kræverHemmelighed(args.secret);
    for (const række of args.rækker) await ctx.db.insert("beacons", række);
    return args.rækker.length;
  },
});

// ---------------------------------------------------------------------------
// Trin 5: genberegn afledte tal fra logrækkerne
// ---------------------------------------------------------------------------

/**
 * Genberegner `totalPoints`, `currentDayStreak` og `longestStreak` ud fra
 * brugerens faktiske `drinkLogs`.
 *
 * De gamle tællere kopieres bevidst IKKE: datarevisionen viste at 20 af 32
 * brugeres `totalDrinks` var drevet fra deres egne logrækker, med op til 76
 * genstandes afvigelse. At kopiere dem ville flytte fejlen med over.
 *
 * Strækket udledes ved at afspille logrækkerne kronologisk gennem den samme
 * `computeStreak()`, som den nye app bruger — så historikken og fremtiden
 * regnes efter samme regler. Fortrydelser (negativ `sizeMultiplier`) tæller
 * hverken point eller stræk.
 */
export const genberegnStats = mutation({
  args: { ...hemmelighed, userIds: v.array(v.id("users")) },
  handler: async (ctx, args): Promise<number> => {
    kræverHemmelighed(args.secret);

    for (const userId of args.userIds) {
      const logs = await ctx.db
        .query("drinkLogs")
        .withIndex("by_user_and_timestamp", (q) => q.eq("userId", userId))
        .collect();

      logs.sort((a, b) => a.timestamp - b.timestamp);

      let totalPoints = 0;
      let currentDayStreak = 0;
      let longestStreak = 0;
      let lastDrinkAt: number | undefined = undefined;
      let lastDrinkDayStart: number | undefined = undefined;

      for (const log of logs) {
        if (log.isReset === true) continue;

        totalPoints += pointsForDrink(log.categoryId, log.sizeMultiplier);

        const streak = computeStreak({
          now: log.timestamp,
          lastDrinkAt,
          currentDayStreak,
          longestStreak,
          categoryId: log.categoryId,
          sizeMultiplier: log.sizeMultiplier,
        });

        currentDayStreak = streak.currentDayStreak;
        longestStreak = streak.longestStreak;
        if (streak.changed) {
          lastDrinkAt = log.timestamp;
          lastDrinkDayStart = streak.drinkDayStart;
        }
      }

      await ctx.db.patch(userId, {
        totalPoints: Number(totalPoints.toFixed(2)),
        currentDayStreak,
        longestStreak,
        ...(lastDrinkAt !== undefined ? { lastDrinkAt, lastDrinkDayStart } : {}),
      });
    }

    console.log("[Migrering] stats genberegnet", { antal: args.userIds.length });
    return args.userIds.length;
  },
});

/** Kontrolopslag efter migrering: findes brugeren via sin Firebase-UID? */
export const findBrugerViaAuthId = query({
  args: { ...hemmelighed, authId: v.string() },
  handler: async (ctx, args): Promise<Doc<"users"> | null> => {
    kræverHemmelighed(args.secret);
    return await ctx.db
      .query("users")
      .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
      .unique();
  },
});

/** Leder efter referencer der peger på rækker som ikke findes. */
export const findDødeReferencer = query({
  args: hemmelighed,
  handler: async (ctx, args): Promise<Record<string, number>> => {
    kræverHemmelighed(args.secret);

    const kanalIds = new Set(
      (await ctx.db.query("kanaler").collect()).map((k) => k._id as string),
    );
    const brugerIds = new Set(
      (await ctx.db.query("users").collect()).map((u) => u._id as string),
    );

    const fund: Record<string, number> = {
      "users.activeChannelId": 0,
      "users.favoriteChannelId": 0,
      "users.joinedChannelIds": 0,
      "kanaler.members": 0,
      "checkIns.userId": 0,
      "checkIns.channelId": 0,
      "drinkLogs.userId": 0,
      "drinkLogs.channelId": 0,
    };

    for (const bruger of await ctx.db.query("users").collect()) {
      if (bruger.activeChannelId && !kanalIds.has(bruger.activeChannelId)) {
        fund["users.activeChannelId"]++;
      }
      if (bruger.favoriteChannelId && !kanalIds.has(bruger.favoriteChannelId)) {
        fund["users.favoriteChannelId"]++;
      }
      for (const id of bruger.joinedChannelIds) {
        if (!kanalIds.has(id)) fund["users.joinedChannelIds"]++;
      }
    }

    for (const kanal of await ctx.db.query("kanaler").collect()) {
      for (const id of kanal.members) {
        if (!brugerIds.has(id)) fund["kanaler.members"]++;
      }
    }

    for (const række of await ctx.db.query("checkIns").collect()) {
      if (!brugerIds.has(række.userId)) fund["checkIns.userId"]++;
      if (række.channelId && !kanalIds.has(række.channelId)) {
        fund["checkIns.channelId"]++;
      }
    }

    for (const række of await ctx.db.query("drinkLogs").collect()) {
      if (!brugerIds.has(række.userId)) fund["drinkLogs.userId"]++;
      if (række.channelId && !kanalIds.has(række.channelId)) {
        fund["drinkLogs.channelId"]++;
      }
    }

    return fund;
  },
});
