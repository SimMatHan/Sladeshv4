import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { Ctx } from "./identity";
import { requireCurrentUser, requireKanalMedlem } from "./identity";
import {
  AFSENDER_STANDARD_EMOJI,
  AFSENDER_STANDARD_GRADIENT,
  AFSENDER_STANDARD_NAVN,
  BESKED_MAX_LAENGDE,
  SLET_BATCH,
  beskedFejl,
  graenseForGamleBeskeder,
  harUlaeste,
  trimBesked,
} from "./messageRules";

/**
 * Kanal-chat.
 *
 * Afløser det gamle repos src/services/messageService.ts (Firestore-listener
 * på /channels/{id}/messages) samt to Cloud Functions:
 * onChannelMessageCreated (varsling) og runDeleteOldMessages (24-timers
 * oprydning).
 *
 * Convex-queries er reaktive af sig selv, så `subscribeToChannelMessages`
 * har ingen modpart her — `getMessages` ER abonnementet, når den kaldes med
 * useQuery fra klienten.
 *
 * Alt kræver medlemskab af Kanalen. I det gamle repo lå den kontrol kun i
 * firestore.rules, altså ét sted uden for koden.
 */

/**
 * Sender en besked til en Kanal.
 *
 * Afsender-felterne snapshottes, præcis som i det gamle repo: skifter
 * brugeren siden navn eller avatar, står gamle beskeder uændret.
 */
export const sendMessage = mutation({
  args: {
    channelId: v.id("kanaler"),
    text: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"messages">> => {
    const { user, kanal } = await requireKanalMedlem(ctx, args.channelId);

    const text = trimBesked(args.text);
    const fejl = beskedFejl(text);

    if (fejl === "EMPTY_MESSAGE") {
      throw new ConvexError({
        code: fejl,
        message: "Beskeden må ikke være tom.",
      });
    }
    if (fejl === "MESSAGE_TOO_LONG") {
      throw new ConvexError({
        code: fejl,
        message: `Beskeden må højst fylde ${BESKED_MAX_LAENGDE} tegn (var ${text.length}).`,
      });
    }

    const now = Date.now();

    const messageId = await ctx.db.insert("messages", {
      channelId: args.channelId,
      senderId: user._id,
      text,
      createdAt: now,
      senderName: user.displayName.trim() || AFSENDER_STANDARD_NAVN,
      senderEmoji: user.profileEmoji ?? AFSENDER_STANDARD_EMOJI,
      senderGradient: user.profileGradient ?? AFSENDER_STANDARD_GRADIENT,
    });

    // Man har pr. definition læst det man selv lige har skrevet. Uden dette
    // ville ens egen besked markere Kanalen som ulæst for én selv, indtil
    // chatten blev åbnet igen.
    await ctx.db.patch(user._id, {
      lastMessageViewedAt: { ...(user.lastMessageViewedAt ?? {}), [args.channelId]: now },
      updatedAt: now,
    });

    console.log("[Message] sendt", {
      messageId,
      channelId: args.channelId,
      laengde: text.length,
    });

    // Push til dem der ikke selv sidder og læser med — se
    // beregnModtagere for reglen. Planlagt frem for afventet: beskeden er
    // sendt uanset om push lykkes.
    const modtagere = await beregnModtagere(ctx, kanal.members, args.channelId, user._id);
    if (modtagere.length > 0) {
      await ctx.scheduler.runAfter(0, internal.push.sendTilBrugere, {
        userIds: modtagere,
        title: kanal.name,
        body: `${user.displayName.trim() || AFSENDER_STANDARD_NAVN}: ${text}`,
        // Grupperer beskeder fra samme Kanal, så en telefon der har været
        // væk et par timer ikke får ét pip per besked.
        tag: `chat-${args.channelId}`,
      });
    }

    return messageId;
  },
});

/**
 * Hvem skal varsles om en besked i denne Kanal?
 *
 * Kanalens medlemmer minus afsenderen, minus dem der har netop denne chat
 * åben lige nu (`setAktivChat`) — de sidder og læser med, og skal ikke
 * forstyrres af et pip om det, de allerede ser.
 */
async function beregnModtagere(
  ctx: Ctx,
  members: Id<"users">[],
  channelId: Id<"kanaler">,
  senderId: Id<"users">,
): Promise<Id<"users">[]> {
  const modtagere: Id<"users">[] = [];
  for (const memberId of members) {
    if (memberId === senderId) continue;

    const medlem = await ctx.db.get(memberId);
    if (medlem === null) continue;
    if (medlem.activeChatChannelId === channelId) continue;

    modtagere.push(memberId);
  }
  return modtagere;
}

/**
 * Beskederne i en Kanal, ældste først — den rækkefølge en chat vises i.
 *
 * Convex kan kun tage de NYESTE N effektivt, så resultatet vendes bagefter.
 * At hente ældste-først direkte ville betyde at læse hele historikken.
 */
export const getMessages = query({
  args: {
    channelId: v.id("kanaler"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Doc<"messages">[]> => {
    await requireKanalMedlem(ctx, args.channelId);

    // Loftet er hårdt: en klient må ikke kunne bede om hele historikken på
    // én gang. Med 24-timers oprydningen er 200 rigeligt til en fuld dag.
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);

    const nyesteFoerst = await ctx.db
      .query("messages")
      .withIndex("by_kanal_and_created_at", (q) => q.eq("channelId", args.channelId))
      .order("desc")
      .take(limit);

    return nyesteFoerst.reverse();
  },
});

/**
 * Markerer Kanalens beskeder som læst frem til nu.
 *
 * Modparten til messageService.updateLastMessageViewed.
 */
export const markerLaest = mutation({
  args: {
    channelId: v.id("kanaler"),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const { user } = await requireKanalMedlem(ctx, args.channelId);
    const now = args.now ?? Date.now();

    await ctx.db.patch(user._id, {
      lastMessageViewedAt: { ...(user.lastMessageViewedAt ?? {}), [args.channelId]: now },
      updatedAt: now,
    });
  },
});

/**
 * Ulæst-status for hver af brugerens Kanaler.
 *
 * Ét indeks-opslag per Kanal (`.first()` på det faldende index), ikke en
 * gennemlæsning af beskederne.
 */
export const getUlaeste = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    Array<{
      channelId: Id<"kanaler">;
      navn: string;
      senesteBeskedAt: number | undefined;
      senestSetAt: number | undefined;
      ulaest: boolean;
    }>
  > => {
    const user = await requireCurrentUser(ctx);
    const set = user.lastMessageViewedAt ?? {};

    const raekker = [];
    for (const channelId of user.joinedChannelIds) {
      const kanal = await ctx.db.get(channelId);
      // En Kanal kan være slettet, mens brugeren stadig står som medlem.
      if (kanal === null) continue;

      const seneste = await ctx.db
        .query("messages")
        .withIndex("by_kanal_and_created_at", (q) => q.eq("channelId", channelId))
        .order("desc")
        .first();

      const senesteBeskedAt = seneste?.createdAt;
      const senestSetAt = set[channelId];

      raekker.push({
        channelId,
        navn: kanal.name,
        senesteBeskedAt,
        senestSetAt,
        ulaest: harUlaeste(senestSetAt, senesteBeskedAt),
      });
    }

    return raekker;
  },
});

/**
 * Tilstedeværelse: hvilken Kanals chat brugeren har åben lige nu.
 *
 * Kald uden `channelId` når chatten lukkes. I Convex fjerner en patch med
 * `undefined` feltet helt — samme virkning som `deleteField()` i det gamle
 * repo.
 *
 * Signalet er den eneste grund til at en varsling kan springes over. I det
 * gamle repo skrev klienten det trofast, men serversiden læste det aldrig
 * (den blev tilføjet i onChannelMessage til sidst), så brugere blev
 * notificeret om beskeder de sad og læste.
 */
export const setAktivChat = mutation({
  args: { channelId: v.optional(v.id("kanaler")) },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireCurrentUser(ctx);

    if (args.channelId !== undefined && !user.joinedChannelIds.includes(args.channelId)) {
      throw new ConvexError({
        code: "NOT_A_MEMBER",
        message: "Du er ikke medlem af den angivne Kanal.",
      });
    }

    await ctx.db.patch(user._id, {
      activeChatChannelId: args.channelId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Hvem ville blive varslet om denne besked?
 *
 * Bruges IKKE af `sendMessage` selv længere — den kender allerede sin
 * Kanal og afsender og kalder `beregnModtagere` direkte. Denne query er den
 * samme regel gjort kaldbar udefra: til fejlsøgning ("hvorfor fik X ikke et
 * pip"), og fordi den fandtes før push gjorde, og intet i UI'et kalder den
 * bort. Se convex/push.ts for selve afsendelsen.
 */
export const getVarslingsmodtagere = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args): Promise<Id<"users">[]> => {
    const besked = await ctx.db.get(args.messageId);
    if (besked === null) {
      throw new ConvexError({
        code: "MESSAGE_NOT_FOUND",
        message: "Beskeden findes ikke.",
      });
    }

    // Kun medlemmer må se hvem der er i Kanalen.
    const { kanal } = await requireKanalMedlem(ctx, besked.channelId);

    return await beregnModtagere(ctx, kanal.members, besked.channelId, besked.senderId);
  },
});

/**
 * Sletter beskeder ældre end 24 timer.
 *
 * BEVIDST AFVIGELSE: det gamle job kørte én gang i døgnet kl. 10:00, så en
 * besked kunne overleve op til 48 timer — det dobbelte af den lovede levetid.
 * Her kører oprydningen hver time, hvilket både holder løftet bedre (højst
 * 25 timer) og undgår at et fast klokkeslæt skal oversættes mellem UTC og
 * dansk sommer-/vintertid i cron-udtrykket.
 *
 * Arbejdet er batchet: en mutation har en øvre grænse for hvor mange
 * dokumenter den må røre, så resten planlægges som en ny kørsel frem for at
 * lade transaktionen fejle og efterlade ALT.
 */
export const ryddGamleBeskeder = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ slettet: number; flereTilbage: boolean }> => {
    // Grænsen låses fast på første kørsel og genbruges af de planlagte
    // fortsættelser, så et batch ikke sletter efter et andet snit end det
    // forrige.
    const now = args.now ?? Date.now();
    const graense = graenseForGamleBeskeder(now);

    // Én ekstra hentes for at kunne se, om der er mere tilbage.
    const gamle = await ctx.db
      .query("messages")
      .withIndex("by_created_at", (q) => q.lt("createdAt", graense))
      .take(SLET_BATCH + 1);

    const batch = gamle.slice(0, SLET_BATCH);
    for (const besked of batch) {
      await ctx.db.delete(besked._id);
    }

    const flereTilbage = gamle.length > SLET_BATCH;
    if (flereTilbage) {
      await ctx.scheduler.runAfter(0, internal.messages.ryddGamleBeskeder, { now });
    }

    if (batch.length > 0) {
      console.log("[Message] oprydning", {
        slettet: batch.length,
        flereTilbage,
      });
    }

    return { slettet: batch.length, flereTilbage };
  },
});
