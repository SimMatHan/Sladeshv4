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

    // Chat. `lastMessageViewedAt` er nøglet på Kanal-id og driver
    // ulæst-markeringen; `activeChatChannelId` er tilstedeværelses-signalet,
    // der fortæller at brugeren har netop denne chat åben lige nu, så hun
    // ikke skal varsles om beskeder hun sidder og læser.
    lastMessageViewedAt: v.optional(v.record(v.id("kanaler"), v.number())),
    activeChatChannelId: v.optional(v.id("kanaler")),

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
    .index("by_kanal_and_check_in", ["activeChannelId", "checkInStatus"])
    // Beacon-evalueringen skal finde ALLE indcheckede brugere på tværs af
    // Kanaler. Uden dette index måtte den scanne hele users-tabellen hvert
    // 5. minut.
    .index("by_check_in", ["checkInStatus"]),

  /**
   * Kanal. Afløser /channels/{channelId}.
   * `name` bærer de kanoniske danske navne: "Den Åbne Kanal", "Ballade",
   * "Brøndby IF".
   */
  kanaler: defineTable({
    name: v.string(),
    // Invitationskode, fx "FRI-9024". VALGFRI: datarevisionen fandt én Kanal
    // uden kode — efter alt at dømme "Den Åbne Kanal", som alle joiner
    // automatisk og derfor aldrig har haft brug for en kode.
    code: v.optional(v.string()),
    isDefault: v.boolean(), // hvis true joiner nye brugere automatisk
    description: v.optional(v.string()),
    members: v.array(v.id("users")),
    // VALGFRI: to Kanaler i produktion er ældre end feltet. At tildele dem en
    // ejer ved migrering ville opfinde data der ikke findes.
    createdBy: v.optional(v.id("users")),

    /**
     * Arkiveret. En arkiveret Kanal er ude af drift, men IKKE slettet.
     *
     * Der findes bevidst ingen sletning. En Kanal er refereret af `messages`,
     * `drinkLogs`, `checkIns` og `beacons`, og en kaskade ville fjerne
     * logninger, som brugernes livstidstal og achievements er regnet ud fra —
     * altså ændre folks historik for at rydde op i en liste. Arkivering
     * melder medlemmerne ud og skjuler Kanalen, og rækkerne bliver stående.
     *
     * VALGFRI, fordi alle eksisterende Kanaler er fra før feltet. Fraværende
     * betyder aktiv.
     */
    archived: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),

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

    // "remove" markerer en FORTRYDELSE af en tidligere logning. Sådanne
    // rækker bærer en NEGATIV sizeMultiplier, så aggregeringer trækker dem
    // fra af sig selv — se convex/streaks.ts og convex/scoreboard.ts.
    action: v.optional(v.string()),

    // Hvilken logning fortrydelsen ophæver. Kun sat på "remove"-rækker.
    // Det gamle repo skrev en løs negativ række uden reference, så intet
    // forhindrede at samme genstand blev fortrudt to gange.
    removesLogId: v.optional(v.id("drinkLogs")),
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
  /**
   * Kataloget over drikkevarianter — "Tuborg", "Rødvin", "Vermouth Tonic".
   * Det brugeren vælger imellem, når hun logger en genstand.
   *
   * Svarer til rod-collectionen `/drinkVariations` i Firestore. Den blev
   * holdt uden for fase 1's afgrænsning og kom først med i fase 10, da
   * skærmkortlægningen viste, at hverken forsiden eller /log kan fungere
   * uden den.
   *
   * NAVNEFÆLDE: brugerdokumentet i den gamle app havde et felt med SAMME
   * navn, som var en tæller per variant i det aktuelle run. Det felt er
   * bevidst fjernet og beregnes nu fra `drinkLogs`. De to har intet med
   * hinanden at gøre.
   *
   * `drinkLogs.variationName` er et snapshot af navnet, ikke en reference
   * hertil. Historikken overlever derfor, at en variant omdøbes eller
   * slettes — hvilket er meningen: man drak den Tuborg, uanset hvad
   * kataloget hedder i dag.
   */
  drinkVariations: defineTable({
    name: v.string(),
    // Valgfri: rod-collectionen indgik ikke i datarevisionen i fase 4, så vi
    // ved ikke om alle rækker i produktionen har en beskrivelse. Migreringen
    // rapporterer hvor mange der manglede.
    description: v.optional(v.string()),
    categoryId: v.string(), // "beer", "wine", … jf. DRINK_CATEGORIES
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_category", ["categoryId"])
    // Unikhed på (kategori, navn) håndhæves ikke af Convex, men dette index
    // gør det billigt at tjekke eksplicit før indsættelse.
    .index("by_category_and_name", ["categoryId", "name"]),

  achievements: defineTable({
    userId: v.id("users"),
    achievementId: v.string(), // fx "obeerma", "mr_worldwide", "puff_minister"
    count: v.number(), // antal oplåsninger (repeatable achievements)
    unlockedAt: v.optional(v.number()),
    firstUnlockedAt: v.optional(v.number()),
    lastUnlockedAt: v.optional(v.number()),
    maxStreak: v.optional(v.number()),

    // Starttidspunktet for det run der udløste den seneste oplåsning.
    // Gælder kun run-baserede achievements og afgør, om de kan opnås igen.
    // Det gamle repo gemte i stedet antallet af nulstillinger — se
    // convex/achievementRules.ts for hvorfor det var utilstrækkeligt.
    // VALGFRI: migrerede rækker har den ikke, og en manglende værdi
    // behandles som "et nyt run".
    lastRunStart: v.optional(v.number()),
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

    // Flad lat/lng er den kanoniske form: begge skriveveje i det gamle repo
    // bruger den (AntigravityMap.tsx:372 og adminService.ts:106), og kortet
    // springer beacons uden dem over.
    //
    // Produktionen indeholder ét LEGACY-dokument med `location: {lat, lng}`
    // i stedet. Cloud Functionen læser begge former eksplicit
    // ("Support both flat (map placement) and nested (legacy) beacon
    // structures"). Vi normaliserer legacy → flad ved migrering frem for at
    // gøre den forældede form kanonisk i schemaet.
    lat: v.number(),
    lng: v.number(),

    // VALGFRIE: legacy-dokumentet har dem ikke, og Cloud Functionen falder
    // tilbage til radius 50 ved læsning. At udfylde dem ved migrering ville
    // opfinde data.
    title: v.optional(v.string()),
    type: v.optional(v.string()),
    radius: v.optional(v.number()),
    venue: v.optional(v.string()),
    message: v.optional(v.string()),

    active: v.boolean(),

    // Notifikations-tilstand, skrevet af den planlagte Cloud Function.
    notificationsSent: v.optional(v.number()),
    lastNotificationSentAt: v.optional(v.number()),
    // Per-bruger-deduplikering: hvilke brugere der allerede er notificeret.
    //
    // Nøglen er et Convex `users`-id som streng for alt hvad denne app selv
    // skriver. De MIGREREDE rækker bærer derimod Firebase-UID'er, fordi
    // migreringen kopierede map'et ordret. De to kan ikke forveksles i
    // praksis: hver migreret beacon er ældre end 2 timer, og evalueringen
    // deaktiverer en udløbet beacon FØR den ser på `notifiedUsers`. Ingen
    // migreret række kan altså nå varslingsstien.
    //
    // `v.string()` frem for `v.id("users")` netop for at rumme begge dele
    // uden at skulle omskrive migreret data.
    notifiedUsers: v.optional(v.record(v.string(), v.boolean())),

    expiresAt: v.optional(v.number()),
    deactivatedAt: v.optional(v.number()),

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

  /**
   * Admin-beskeder til alle. Afløser /broadcasts/{broadcastId}.
   *
   * I det gamle repo var en broadcast en ORDRE til en Cloud Function: skriv
   * et dokument med `status: "pending"`, og `onBroadcastCreated` faner den ud
   * som push og sletter sig selv ud af historien. Push-kanalen findes ikke
   * endnu i v4, så rækken er her i stedet en TILSTAND: broadcasten er aktiv,
   * indtil den udløber eller slås fra, og appen viser den som en bjælke.
   *
   * Derfor er der intet `status`-felt. Der er ingen kø at være i.
   */
  broadcasts: defineTable({
    title: v.string(),
    body: v.string(),

    /**
     * Målgruppen. Uden `channelId` gælder broadcasten alle; med den kun
     * Kanalens medlemmer — samme to muligheder som `targetAudience` gav i det
     * gamle repo, men udledt af feltet frem for gentaget i et andet.
     */
    channelId: v.optional(v.id("kanaler")),

    active: v.boolean(),
    /** Valgfri udløbstid. Uden den står broadcasten, til den slås fra. */
    expiresAt: v.optional(v.number()),

    createdBy: v.id("users"),
    createdAt: v.number(),
    deactivatedAt: v.optional(v.number()),
  })
    .index("by_active", ["active"])
    .index("by_kanal_and_active", ["channelId", "active"])
    .index("by_created_at", ["createdAt"]),

  /**
   * Donationer. Afløser /donations/{donationId}.
   *
   * Beløbet er i hele kroner. Donorens navn og avatar blev i det gamle repo
   * kopieret ned i rækken (`userName`, `userInitials`, `userAvatarGradient`)
   * — en denormalisering, der gik i stykker, så snart nogen skiftede navn.
   * Her står kun `userId`, og visningen slår brugeren op.
   */
  donations: defineTable({
    userId: v.id("users"),
    /** Beløb i DKK. Altid positivt — se `opretDonation`. */
    amount: v.number(),
    message: v.optional(v.string()),
    /** Hvornår der blev doneret. Kan ligge før `createdAt`, hvis den er efterregistreret. */
    date: v.number(),

    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_date", ["date"]),

  /**
   * Globale indstillinger, som en admin styrer for alle. Afløser
   * /settings/themes.
   *
   * Én række per nøgle frem for ét dokument med et felt per indstilling. Det
   * gamle `settings/themes`-dokument voksede et boolean ad gangen
   * (`copenhellBallade`, så `odaysBallade`), og hver ny gav en schemaændring.
   */
  indstillinger: defineTable({
    /** Fx "balladeTema". */
    noegle: v.string(),
    /** Værdien som tekst. Tomt betyder "slået fra". */
    vaerdi: v.string(),
    opdateretAf: v.optional(v.id("users")),
    updatedAt: v.number(),
  }).index("by_noegle", ["noegle"]),

  /**
   * Web Push-abonnementer. Én række per ENHED en bruger har givet
   * tilladelse fra — en bruger med både telefon og bærbar har to.
   *
   * `pushSubscriptions` var navngivet, men aldrig bygget, i det gamle repo
   * (se docs/eksisterende-datamodel.md, afsnit 7.6) — der lå ingen kollektion
   * bag, kun en note om at den skulle findes. Formen her er browserens egen:
   * `endpoint` er URL'en, push-tjenesten (Chrome, Firefox, …) selv har
   * tildelt abonnementet, og `p256dh`/`auth` er de to nøgler, serveren skal
   * kryptere beskeden med — begge dele kommer direkte fra
   * `PushSubscription.toJSON()` og gemmes uden at blive fortolket.
   */
  pushAbonnementer: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    // `endpoint` er unikt pr. enhed på tværs af ALLE brugere — to brugere
    // kan aldrig dele ét. Indekset gør genabonnering (samme enhed, samme
    // bruger) til et opslag i stedet for endnu en række.
    .index("by_endpoint", ["endpoint"]),
});
