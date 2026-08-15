import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex-schema for SladeshApp.
 *
 * Navngivningsregel (aftalt i fase 1):
 * - Tabellen for Kanal hedder `kanaler` (dansk, kanonisk domænebegreb).
 * - Feltnavne bevares EKSAKT som i det gamle Firebase-repo (`channelId`,
 *   `activeChannelId`, `joinedChannelIds`, `createdAt`, `timestamp`) — så
 *   datamigreringen i en senere fase bliver en ren 1:1-mapping.
 * - Danske dataværdier ("Ballade", "Brøndby IF", "Den Åbne Kanal", "Øl",
 *   "Lille") gemmes ordret og oversættes aldrig.
 *
 * Om tidsstempler: alle tidsfelter er epoch ms (`v.number()`). Convex tilføjer
 * automatisk `_creationTime`, men den kan IKKE sættes ved indsættelse — derfor
 * beholder vi eksplicitte `createdAt`/`timestamp`-felter, så den oprindelige
 * Firestore-historik overlever migreringen.
 *
 * Om indexes: Convex tilføjer implicit `_creationTime` som sidste felt i ethvert
 * index. `.index("by_kanal", ["channelId"])` svarer altså til Firestores
 * composite index `channelId ASC, createdAt ASC`.
 *
 * Kortlægningen af den eksisterende Firestore-model ligger i
 * docs/eksisterende-datamodel.md.
 *
 * Bemærk: Scoreboard er IKKE en tabel. Stillingen beregnes live af en Convex
 * query-funktion ud fra `drinkLogs` — se convex/scoreboard.ts.
 */

console.log("[Schema] indlæser SladeshApp Convex-schema");

/** Geografisk punkt. Bruges af checkIns, drinkLogs og sladeshChallenges. */
const location = v.object({
  lat: v.number(),
  lng: v.number(),
});

/** Sladesh-udfordringens livscyklus. Fra src/types/sladesh.ts (SladeshStatus). */
const sladeshStatus = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("expired"),
);

/** UI-fase for Sladesh-scanneren. Fra src/types/sladesh.ts (SladeshPhase). */
const sladeshPhase = v.union(
  v.literal("intro"),
  v.literal("awaiting_filled"),
  v.literal("filled_captured"),
  v.literal("awaiting_empty"),
  v.literal("empty_captured"),
  v.literal("completed"),
  v.literal("failed"),
);

export default defineSchema({
  /**
   * Bruger. Afløser /users/{userId}.
   *
   * De denormaliserede tællere fra Firestore (`totalDrinks`,
   * `currentRunDrinkCount`, `drinkTypes`, `drinkVariations`,
   * `allTimeDrinkVariations`) er bevidst udeladt: de beregnes nu fra
   * `drinkLogs`, så der kun er én sandhedskilde.
   */
  users: defineTable({
    // Identitet. `authId` er den eksterne auth-identitet — i det gamle repo
    // Firebase Auth `uid`, som også var dokument-id'et.
    authId: v.string(),
    email: v.string(),
    displayName: v.string(),
    fullName: v.optional(v.string()),
    photoURL: v.optional(v.string()),
    onboardingCompleted: v.optional(v.boolean()),
    isAdmin: v.optional(v.boolean()),

    // Kanal-tilhørsforhold
    activeChannelId: v.optional(v.id("kanaler")),
    favoriteChannelId: v.optional(v.id("kanaler")),
    joinedChannelIds: v.array(v.id("kanaler")),

    // Check In-status (seneste tilstand; historikken ligger i `checkIns`)
    checkInStatus: v.optional(v.boolean()),
    lastCheckIn: v.optional(v.number()),
    lastCheckInVenue: v.optional(v.string()),
    lastStatusCheckedAt: v.optional(v.number()),
    checkInCount: v.optional(v.number()),

    // Position
    location: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
        lastUpdated: v.number(),
      }),
    ),
    currentLocation: v.optional(
      v.union(
        v.object({
          lat: v.number(),
          lng: v.number(),
          venue: v.string(),
          timestamp: v.number(),
        }),
        v.null(),
      ),
    ),

    // Drikke-metadata der ikke kan udledes af drinkLogs
    lastDrinkAt: v.optional(v.number()),
    lastDrinkDayStart: v.optional(v.number()), // grænsen for drikkedagen (kl. 10:00)
    totalRunResets: v.optional(v.number()),

    // Fladgjort fra Firestores indlejrede `stats`-objekt.
    //
    // `currentStreak` er bevidst udeladt: i det gamle repo blev den
    // initialiseret til 0 (AuthContext.tsx:116) og aldrig skrevet, så profil
    // og scoreboard viste permanent 0. `currentDayStreak` er den eneste
    // rigtige stræk — at have begge er samme denormaliserings-anti-mønster
    // som `activeSladesh`.
    totalPoints: v.optional(v.number()),
    longestStreak: v.optional(v.number()),
    currentDayStreak: v.optional(v.number()),

    // Promille-indstillinger
    promille: v.optional(
      v.object({
        enabled: v.boolean(),
        gender: v.optional(v.union(v.literal("male"), v.literal("female"))),
        weight: v.optional(v.number()), // kg
        height: v.optional(v.number()), // cm
      }),
    ),

    // Sladesh-tællere.
    //
    // `activeSladesh` er bevidst udeladt: det var en denormaliseret kopi af
    // `sladeshChallenges.status`, og det at holde de to i sync var kilden til
    // de brede fejl i den gamle app. Den aktive udfordring slås nu op direkte
    // i `sladeshChallenges` — se convex/sladesh.ts.
    sladeshSent: v.optional(v.number()),
    sladeshReceived: v.optional(v.number()),
    sladeshCompletedCount: v.optional(v.number()),
    sladeshFailedCount: v.optional(v.number()),
    lastSladeshSentAt: v.optional(v.number()),

    // Avatar / udseende
    emoji: v.optional(v.string()), // avatar-emoji
    avatarColor: v.optional(v.string()), // gradient-navn, fx "sunset"
    profileEmoji: v.optional(v.string()), // status/profil-emoji
    profileGradient: v.optional(v.string()), // Tailwind-klasser

    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_auth_id", ["authId"])
    .index("by_email", ["email"])
    .index("by_kanal", ["activeChannelId"])
    .index("by_kanal_and_check_in", ["activeChannelId", "checkInStatus"]),

  /**
   * Kanal. Afløser /channels/{channelId}.
   * `name` bærer de kanoniske danske navne: "Den Åbne Kanal", "Ballade",
   * "Brøndby IF".
   */
  kanaler: defineTable({
    name: v.string(),
    code: v.string(), // unik invitationskode, fx "FRI-9024"
    isDefault: v.boolean(), // hvis true joiner nye brugere automatisk
    description: v.optional(v.string()),
    members: v.array(v.id("users")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_default", ["isDefault"])
    .index("by_name", ["name"]),

  /** Check In. Afløser /users/{userId}/checkIns/{checkInId}. */
  checkIns: defineTable({
    userId: v.id("users"),
    channelId: v.optional(v.id("kanaler")),
    venue: v.string(),
    location: v.optional(v.union(location, v.null())),
    timestamp: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_kanal", ["channelId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_user_and_timestamp", ["userId", "timestamp"])
    .index("by_kanal_and_timestamp", ["channelId", "timestamp"]),

  /**
   * Drikkelogning. Afløser /users/{userId}/drinkLogs/{logId}.
   * Dette er sandhedskilden for scoreboardet.
   */
  drinkLogs: defineTable({
    userId: v.id("users"),
    channelId: v.optional(v.id("kanaler")),

    categoryId: v.string(), // "beer" | "cider" | "wine" | "cocktail" | "shot" | "other"
    variationName: v.string(), // dansk variantnavn, fx "Cigaret", "Vermouth Tonic"

    // Størrelse — jf. DRINK_SIZES i det gamle repo
    sizeId: v.optional(v.string()), // "small" | "medium" | "large"
    sizeMultiplier: v.optional(v.number()), // 1.0 | 1.5 | 2.0
    sizeLabel: v.optional(v.string()), // "Lille" | "Mellem" | "Stor"
    sizeVolume: v.optional(v.string()), // "33cl" | "50cl" | "75cl"

    location: v.optional(location),
    timestamp: v.number(),

    // Snapshot af brugeren på logtidspunktet, så historikken ikke ændrer sig,
    // hvis brugeren senere skifter navn eller avatar
    userDisplayName: v.optional(v.string()),
    userEmoji: v.optional(v.string()),
    userProfileEmoji: v.optional(v.string()),
    userProfileGradient: v.optional(v.string()),

    // Markerer en nulstillings-hændelse frem for en reel genstand
    isReset: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_kanal", ["channelId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_user_and_timestamp", ["userId", "timestamp"])
    .index("by_kanal_and_timestamp", ["channelId", "timestamp"])
    .index("by_user_and_category", ["userId", "categoryId"]),

  /**
   * Achievements — én række per (bruger, achievement).
   *
   * Erstatter map'et `UserData.achievements` fra Firestore. Selve
   * achievement-DEFINITIONERNE (titel, billede, tærskel) er fortsat statiske i
   * kode; her ligger kun brugerens oplåsninger.
   */
  achievements: defineTable({
    userId: v.id("users"),
    achievementId: v.string(), // fx "obeerma", "mr_worldwide", "puff_minister"
    count: v.number(), // antal oplåsninger (repeatable achievements)
    unlockedAt: v.optional(v.number()),
    firstUnlockedAt: v.optional(v.number()),
    lastUnlockedAt: v.optional(v.number()),
    maxStreak: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_achievement", ["achievementId"])
    .index("by_user_and_achievement", ["userId", "achievementId"]),

  /** Kanal-beskeder. Afløser /channels/{channelId}/messages/{messageId}. */
  messages: defineTable({
    channelId: v.id("kanaler"),
    senderId: v.id("users"),
    text: v.string(),
    createdAt: v.number(),

    // Snapshot af afsenderen på afsendelsestidspunktet
    senderName: v.string(),
    senderEmoji: v.optional(v.string()),
    senderGradient: v.optional(v.string()),
  })
    .index("by_kanal", ["channelId"])
    .index("by_user", ["senderId"])
    .index("by_created_at", ["createdAt"])
    .index("by_kanal_and_created_at", ["channelId", "createdAt"]),

  /**
   * Beacon (stress-signal). Afløser /stressBeacons/{beaconId}.
   * Felterne følger det der FAKTISK skrives i adminService.createStressSignal(),
   * ikke det ufuldstændige `Beacon`-interface (se docs, afsnit 2.6).
   */
  beacons: defineTable({
    createdBy: v.id("users"),
    channelId: v.optional(v.id("kanaler")),

    lat: v.number(),
    lng: v.number(),

    title: v.string(), // falder tilbage til "Stress Beacon"
    venue: v.optional(v.string()),
    message: v.optional(v.string()), // default "Stress signal aktiveret!"
    type: v.string(), // p.t. altid "stress"
    radius: v.number(), // meter, default 50

    active: v.boolean(),
    notificationsSent: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_user", ["createdBy"])
    .index("by_kanal", ["channelId"])
    .index("by_active", ["active"])
    .index("by_created_at", ["createdAt"])
    .index("by_kanal_and_active", ["channelId", "active"]),

  /**
   * Sladesh-udfordringer. Afløser /sladeshChallenges/{challengeId}.
   * Alle tidsfelter er epoch ms — Firestores blandede `Timestamp | number` er
   * normaliseret væk.
   */
  sladeshChallenges: defineTable({
    senderId: v.id("users"),
    recipientId: v.id("users"),
    channelId: v.optional(v.id("kanaler")),

    // Snapshot af navne på afsendelsestidspunktet
    senderName: v.string(),
    recipientName: v.string(),

    status: sladeshStatus,
    phase: sladeshPhase,

    createdAt: v.number(),
    deadlineAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    filledCapturedAt: v.optional(v.number()),
    emptyCapturedAt: v.optional(v.number()),

    venue: v.optional(v.string()),
    location: v.optional(location),

    // Bevisbilleder. Convex-storage-referencer i stedet for base64, som ville
    // sprænge dokumentgrænsen.
    proofBeforeImage: v.optional(v.id("_storage")),
    proofAfterImage: v.optional(v.id("_storage")),

    idempotencyKey: v.string(),
  })
    .index("by_sender", ["senderId"])
    .index("by_recipient", ["recipientId"])
    .index("by_kanal", ["channelId"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_sender_and_created_at", ["senderId", "createdAt"])
    .index("by_recipient_and_created_at", ["recipientId", "createdAt"])
    // De to status-indexes gør opslaget af en brugers AKTIVE udfordring til et
    // præcist indeks-opslag i begge retninger. Uden `by_sender_and_status`
    // måtte afsender-siden scanne de seneste N afsendte og filtrere i
    // hukommelsen — korrekt kun så længe N var stort nok.
    .index("by_sender_and_status", ["senderId", "status"])
    .index("by_recipient_and_status", ["recipientId", "status"]),
});
