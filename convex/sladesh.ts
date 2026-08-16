import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCanViewUser, requireCurrentUser } from "./identity";
import type { Ctx } from "./identity";
import {
  SLADESH_ERRORS,
  SLADESH_TIME_LIMIT_MS,
  beregnCooldown,
  erAfsluttetStatus,
  erCooldownAktiv,
  erFremadrettet,
  erUdloebet,
  type CooldownTilstand,
} from "./sladeshRules";

/**
 * Sladesh — hele livscyklussen.
 *
 * Rekonstrueret fra det gamle repos Cloud Functions
 * (functions/src/callable/sladesh.ts), som var den autoritative kilde.
 *
 * Der findes IKKE et `users.activeSladesh`-felt. Det blev fjernet i fase 3,
 * fordi det var en denormaliseret kopi af `sladeshChallenges.status`, og de to
 * kunne komme ud af sync. Den aktive udfordring slås op direkte i tabellen med
 * præcise indeks-opslag:
 *
 *   som MODTAGER: by_recipient_and_status → (recipientId, status)
 *   som AFSENDER: by_sender_and_status    → (senderId, status)
 *
 * Reglerne (blokke, faser, frister) ligger som rene funktioner i
 * convex/sladeshRules.ts, så de kan testes uden et deployment.
 */

/**
 * Begge statusser tæller som aktive.
 *
 * Det gamle repos lås hed `status: 'in_progress'`, men den blev sat på
 * BRUGEREN i samme øjeblik udfordringen blev sendt — mens selve udfordringen
 * stadig stod som `pending`. Låsen dækkede altså begge tilstande. Slår man
 * kun `in_progress` op, kan man sende en ny Sladesh oven i en netop afsendt,
 * som ingen har rørt endnu.
 */
const AKTIVE_STATUSSER = ["pending", "in_progress"] as const;

// ---------------------------------------------------------------------------
// Opslag
// ---------------------------------------------------------------------------

/** Den aktive udfordring hvor brugeren er modtager eller afsender. */
async function findActive(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"sladeshChallenges"> | null> {
  // Modtager-siden først: det er den retning hvor brugeren har en frist.
  for (const status of AKTIVE_STATUSSER) {
    const fundet = await ctx.db
      .query("sladeshChallenges")
      .withIndex("by_recipient_and_status", (q) =>
        q.eq("recipientId", userId).eq("status", status),
      )
      .first();
    if (fundet !== null) return fundet;
  }

  for (const status of AKTIVE_STATUSSER) {
    const fundet = await ctx.db
      .query("sladeshChallenges")
      .withIndex("by_sender_and_status", (q) =>
        q.eq("senderId", userId).eq("status", status),
      )
      .first();
    if (fundet !== null) return fundet;
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

/** Om brugeren er optaget af en aktiv Sladesh. */
export const hasActiveSladesh = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args): Promise<boolean> => {
    const userId = await resolveTarget(ctx, args.userId);
    return (await findActive(ctx, userId)) !== null;
  },
});

/**
 * Må jeg sende en Sladesh lige nu, og hvornår kan jeg igen?
 *
 * Blokkene er 00:00–12:00 og 12:00–24:00 i dansk tid — en ANDEN grænse end
 * drikkedagens kl. 10:00.
 */
export const getCooldown = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<CooldownTilstand> => {
    const bruger = await requireCurrentUser(ctx);
    return beregnCooldown(bruger.lastSladeshSentAt, args.now ?? Date.now());
  },
});

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

/**
 * Markerer en udløbet udfordring som `expired`.
 *
 * Kaldes både af den planlagte funktion og inline, når en ny Sladesh forsøges
 * sendt oven i en forældet. Idempotent: en allerede afsluttet udfordring
 * røres ikke.
 */
async function udloebHvisForaeldet(
  ctx: MutationCtx,
  udfordring: Doc<"sladeshChallenges">,
  now: number,
): Promise<boolean> {
  if (erAfsluttetStatus(udfordring.status)) return false;
  if (!erUdloebet(udfordring.deadlineAt, now)) return false;

  await ctx.db.patch(udfordring._id, {
    status: "expired",
    phase: "failed",
    updatedAt: now,
  });

  const modtager = await ctx.db.get(udfordring.recipientId);
  if (modtager !== null) {
    await ctx.db.patch(udfordring.recipientId, {
      sladeshFailedCount: (modtager.sladeshFailedCount ?? 0) + 1,
      updatedAt: now,
    });
  }

  console.log("[Sladesh] udløbet", { challengeId: udfordring._id });
  return true;
}

export const sendSladesh = mutation({
  args: {
    recipientId: v.id("users"),
    /**
     * Stabil nøgle fra klienten. PÅKRÆVET med vilje.
     *
     * Det gamle repo gjorde den valgfri og faldt tilbage til id'et på det
     * dokument, den lige havde oprettet — en frisk værdi hver gang. Nøglen
     * beskyttede derfor kun, hvis klienten selv sendte en, og et gentaget
     * kald uden nøgle lavede en dublet. Ved at kræve den kan det ikke ske:
     * klienten skal danne én per forsøg (fx et uuid) og genbruge den ved
     * retry.
     */
    idempotencyKey: v.string(),
    channelId: v.optional(v.id("kanaler")),
    venue: v.optional(v.string()),
    location: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    /** Overstyrer "nu" — kun til test. */
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"sladeshChallenges">> => {
    const afsender = await requireCurrentUser(ctx);
    const now = args.now ?? Date.now();

    if (args.recipientId === afsender._id) {
      throw new ConvexError({
        code: "SELF_SLADESH",
        message: "Du kan ikke sende en Sladesh til dig selv.",
      });
    }

    // Idempotens FØRST: et gentaget kald må ikke løbe ind i cooldown-fejlen
    // for den udfordring, det selv oprettede.
    const eksisterende = await ctx.db
      .query("sladeshChallenges")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .first();

    if (eksisterende !== null) {
      if (erAfsluttetStatus(eksisterende.status)) {
        throw new ConvexError({
          code: SLADESH_ERRORS.SLADESH_ALREADY_RESOLVED,
          message: "Den Sladesh er allerede afgjort.",
        });
      }
      console.log("[Sladesh] idempotent genkald — samme udfordring", {
        challengeId: eksisterende._id,
      });
      return eksisterende._id;
    }

    const modtager = await ctx.db.get(args.recipientId);
    if (modtager === null) {
      throw new ConvexError({
        code: SLADESH_ERRORS.RECIPIENT_NOT_FOUND,
        message: "Modtageren findes ikke.",
      });
    }

    // Modtageren skal være i en Kanal, afsenderen også er i.
    const deltKanal =
      args.channelId !== undefined
        ? afsender.joinedChannelIds.includes(args.channelId) &&
          modtager.joinedChannelIds.includes(args.channelId)
        : modtager.joinedChannelIds.some((id) =>
            afsender.joinedChannelIds.includes(id),
          );

    if (!deltKanal) {
      console.log("[Sladesh] afvist — ingen delt Kanal", {
        senderId: afsender._id,
        recipientId: args.recipientId,
      });
      throw new ConvexError({
        code: "NOT_A_MEMBER",
        message: "I deler ingen Kanal.",
      });
    }

    if (erCooldownAktiv(afsender.lastSladeshSentAt, now)) {
      console.log("[Sladesh] afvist — cooldown", { senderId: afsender._id });
      throw new ConvexError({
        code: SLADESH_ERRORS.COOLDOWN_ACTIVE,
        message: "Du har allerede sendt en Sladesh i denne 12-timers blok.",
      });
    }

    // Begge parter skal være frie. Det gamle repo tjekkede KUN modtageren, så
    // man kunne sende midt i sin egen igangværende Sladesh.
    for (const [rolle, bruger] of [
      ["afsender", afsender],
      ["modtager", modtager],
    ] as const) {
      const aktiv = await findActive(ctx, bruger._id);
      if (aktiv === null) continue;

      // En forældet udfordring blokerer ikke — den lukkes først.
      const blevUdloebet = await udloebHvisForaeldet(ctx, aktiv, now);
      if (blevUdloebet) continue;

      console.log("[Sladesh] afvist — aktiv udfordring", { rolle });
      throw new ConvexError({
        code: SLADESH_ERRORS.SLADESH_ACTIVE_ERROR,
        message:
          rolle === "afsender"
            ? "Du er selv midt i en Sladesh."
            : `${modtager.displayName} er allerede i gang med en Sladesh.`,
      });
    }

    const deadlineAt = now + SLADESH_TIME_LIMIT_MS;

    const challengeId = await ctx.db.insert("sladeshChallenges", {
      senderId: afsender._id,
      recipientId: args.recipientId,
      channelId: args.channelId,
      // Snapshot af navnene, så historikken ikke ændrer sig senere.
      senderName: afsender.displayName,
      recipientName: modtager.displayName,
      status: "pending",
      phase: "intro",
      createdAt: now,
      deadlineAt,
      updatedAt: now,
      venue: args.venue,
      location: args.location,
      idempotencyKey: args.idempotencyKey,
    });

    // Samme transaktion: begge parters tællere.
    await ctx.db.patch(afsender._id, {
      sladeshSent: (afsender.sladeshSent ?? 0) + 1,
      lastSladeshSentAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.recipientId, {
      // Tælles ved AFSENDELSE, ikke ved accept — som i det gamle repo.
      sladeshReceived: (modtager.sladeshReceived ?? 0) + 1,
      updatedAt: now,
    });

    // Convex' scheduler kører funktionen på det angivne tidspunkt, uanset om
    // nogen klient er forbundet. Den planlagte kørsel er en del af samme
    // transaktion: ruller indsættelsen tilbage, planlægges den heller ikke.
    await ctx.scheduler.runAt(deadlineAt, internal.sladesh.udloebSladesh, {
      challengeId,
    });

    console.log("[Sladesh] sendt", {
      challengeId,
      senderId: afsender._id,
      recipientId: args.recipientId,
      frist: new Date(deadlineAt).toISOString(),
    });

    return challengeId;
  },
});

// ---------------------------------------------------------------------------
// Bevisbilleder
// ---------------------------------------------------------------------------

/**
 * URL klienten kan uploade et bevisbillede til.
 *
 * Det gamle repo komprimerede billedet og lagde det i Firebase Storage, og
 * gemte kun download-URL'en i dokumentet — ikke base64, som typekommentaren
 * ellers antydede. Convex-pendanten er storage, og feltet er `v.id("_storage")`.
 */
export const genererUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    await requireCurrentUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Henter en visnings-URL til et gemt bevisbillede. */
export const getBevisUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<string | null> => {
    await requireCurrentUser(ctx);
    return await ctx.storage.getUrl(args.storageId);
  },
});

const scannerFase = v.union(
  v.literal("awaiting_filled"),
  v.literal("filled_captured"),
  v.literal("awaiting_empty"),
  v.literal("empty_captured"),
);

/**
 * Rykker udfordringen frem gennem scanner-faserne, eventuelt med et billede.
 *
 * Kun MODTAGEREN må kalde den, og kun fremad. Et forsøg på at hoppe baglæns
 * eller gentage en fase afvises — det gamle repo ignorerede dem stille, hvilket
 * gjorde en klientfejl usynlig.
 */
export const registrerBevis = mutation({
  args: {
    challengeId: v.id("sladeshChallenges"),
    phase: scannerFase,
    storageId: v.optional(v.id("_storage")),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const bruger = await requireCurrentUser(ctx);
    const now = args.now ?? Date.now();

    const udfordring = await ctx.db.get(args.challengeId);
    if (udfordring === null) {
      throw new ConvexError({
        code: "CHALLENGE_NOT_FOUND",
        message: "Udfordringen findes ikke.",
      });
    }

    if (udfordring.recipientId !== bruger._id) {
      console.log("[Sladesh] bevis afvist — ikke modtageren", {
        challengeId: args.challengeId,
        userId: bruger._id,
      });
      throw new ConvexError({
        code: "NOT_RECIPIENT",
        message: "Kun modtageren kan gennemføre en Sladesh.",
      });
    }

    if (erAfsluttetStatus(udfordring.status)) {
      throw new ConvexError({
        code: SLADESH_ERRORS.SLADESH_ALREADY_RESOLVED,
        message: "Den Sladesh er allerede afgjort.",
      });
    }

    if (erUdloebet(udfordring.deadlineAt, now)) {
      await udloebHvisForaeldet(ctx, udfordring, now);
      throw new ConvexError({
        code: "SLADESH_EXPIRED",
        message: "Tiden er løbet ud.",
      });
    }

    if (!erFremadrettet(udfordring.phase, args.phase)) {
      throw new ConvexError({
        code: "INVALID_PHASE_TRANSITION",
        message: `Kan ikke gå fra "${udfordring.phase}" til "${args.phase}".`,
      });
    }

    const felter: Record<string, unknown> = {
      phase: args.phase,
      // Første skridt væk fra intro gør udfordringen påbegyndt.
      status: "in_progress",
      updatedAt: now,
    };

    if (args.storageId !== undefined) {
      if (args.phase === "filled_captured") {
        felter.proofBeforeImage = args.storageId;
        felter.filledCapturedAt = now;
      } else if (args.phase === "empty_captured") {
        felter.proofAfterImage = args.storageId;
        felter.emptyCapturedAt = now;
      } else {
        throw new ConvexError({
          code: "UNEXPECTED_PROOF",
          message: `Fasen "${args.phase}" tager ikke et bevisbillede.`,
        });
      }
    }

    await ctx.db.patch(args.challengeId, felter);

    console.log("[Sladesh] fase rykket frem", {
      challengeId: args.challengeId,
      fra: udfordring.phase,
      til: args.phase,
      medBevis: args.storageId !== undefined,
    });
  },
});

// ---------------------------------------------------------------------------
// Afslutning
// ---------------------------------------------------------------------------

/** Fælles guard: hent udfordringen og bekræft at kalderen er modtageren. */
async function hentSomModtager(
  ctx: Ctx,
  challengeId: Id<"sladeshChallenges">,
): Promise<{ udfordring: Doc<"sladeshChallenges">; bruger: Doc<"users"> }> {
  const bruger = await requireCurrentUser(ctx);
  const udfordring = await ctx.db.get(challengeId);

  if (udfordring === null) {
    throw new ConvexError({
      code: "CHALLENGE_NOT_FOUND",
      message: "Udfordringen findes ikke.",
    });
  }
  if (udfordring.recipientId !== bruger._id) {
    throw new ConvexError({
      code: "NOT_RECIPIENT",
      message: "Kun modtageren kan afslutte en Sladesh.",
    });
  }
  if (erAfsluttetStatus(udfordring.status)) {
    throw new ConvexError({
      code: SLADESH_ERRORS.SLADESH_ALREADY_RESOLVED,
      message: "Den Sladesh er allerede afgjort.",
    });
  }

  return { udfordring, bruger };
}

/** Gennemfør. Kræver at begge beviser er registreret. */
export const afslutSladesh = mutation({
  args: {
    challengeId: v.id("sladeshChallenges"),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = args.now ?? Date.now();
    const { udfordring, bruger } = await hentSomModtager(ctx, args.challengeId);

    if (udfordring.phase !== "empty_captured") {
      throw new ConvexError({
        code: "INVALID_PHASE_TRANSITION",
        message:
          `En Sladesh kan kun gennemføres fra "empty_captured" — ` +
          `den står på "${udfordring.phase}".`,
      });
    }

    if (erUdloebet(udfordring.deadlineAt, now)) {
      await udloebHvisForaeldet(ctx, udfordring, now);
      throw new ConvexError({
        code: "SLADESH_EXPIRED",
        message: "Tiden er løbet ud.",
      });
    }

    await ctx.db.patch(args.challengeId, {
      status: "completed",
      phase: "completed",
      completedAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(bruger._id, {
      sladeshCompletedCount: (bruger.sladeshCompletedCount ?? 0) + 1,
      updatedAt: now,
    });

    console.log("[Sladesh] gennemført", { challengeId: args.challengeId });
  },
});

/** Giv op. Kun modtageren selv. */
export const opgivSladesh = mutation({
  args: {
    challengeId: v.id("sladeshChallenges"),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = args.now ?? Date.now();
    const { bruger } = await hentSomModtager(ctx, args.challengeId);

    await ctx.db.patch(args.challengeId, {
      status: "failed",
      phase: "failed",
      updatedAt: now,
    });

    await ctx.db.patch(bruger._id, {
      sladeshFailedCount: (bruger.sladeshFailedCount ?? 0) + 1,
      updatedAt: now,
    });

    console.log("[Sladesh] opgivet", { challengeId: args.challengeId });
  },
});

// ---------------------------------------------------------------------------
// Udløb
// ---------------------------------------------------------------------------

/**
 * Planlagt af `sendSladesh` til at køre præcis ved `deadlineAt`.
 *
 * `internalMutation` betyder at den ikke kan kaldes fra en klient — kun af
 * Convex selv gennem scheduleren.
 *
 * Idempotent: har modtageren nået at gennemføre eller opgive, gør den intet.
 */
export const udloebSladesh = internalMutation({
  args: { challengeId: v.id("sladeshChallenges") },
  handler: async (ctx, args): Promise<void> => {
    const udfordring = await ctx.db.get(args.challengeId);
    if (udfordring === null) return;

    const now = Date.now();
    if (erAfsluttetStatus(udfordring.status)) {
      console.log("[Sladesh] allerede afgjort — udløb springes over", {
        challengeId: args.challengeId,
        status: udfordring.status,
      });
      return;
    }

    await ctx.db.patch(args.challengeId, {
      status: "expired",
      phase: "failed",
      updatedAt: now,
    });

    const modtager = await ctx.db.get(udfordring.recipientId);
    if (modtager !== null) {
      await ctx.db.patch(udfordring.recipientId, {
        sladeshFailedCount: (modtager.sladeshFailedCount ?? 0) + 1,
        updatedAt: now,
      });
    }

    console.log("[Sladesh] udløbet af scheduleren", {
      challengeId: args.challengeId,
    });
  },
});

/**
 * Sikkerhedsnet: fanger udfordringer hvis planlagte udløb aldrig kørte.
 *
 * Scheduleren er pålidelig, men en udfordring oprettet før denne kode blev
 * deployet har ingen planlagt kørsel, og et deployment der har været nede kan
 * i teorien misse en. Uden dette ville sådan en udfordring blokere begge
 * parter for evigt, fordi den tæller som aktiv.
 *
 * Kører hver 10. minut via convex/crons.ts.
 */
export const fejlEfterladte = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    let antal = 0;

    for (const status of AKTIVE_STATUSSER) {
      const kandidater = await ctx.db
        .query("sladeshChallenges")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(100);

      for (const udfordring of kandidater) {
        if (await udloebHvisForaeldet(ctx, udfordring, now)) antal++;
      }
    }

    if (antal > 0) {
      console.log("[Sladesh] efterladte udfordringer lukket", { antal });
    }
    return antal;
  },
});
