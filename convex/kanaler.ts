import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { Ctx } from "./identity";
import { requireAdmin, requireCurrentUser, requireKanalMedlem } from "./identity";
import { milepaelsVarsling } from "./paamindelseRules";

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

    // En arkiveret Kanal er ude af drift. Koden virker stadig som opslag —
    // rækken findes jo — så uden dette tjek kunne man melde sig ind i noget,
    // en admin lige har lukket, og stå alene i den.
    if (kanal.archived === true) {
      console.log("[Kanal] joinKanal afvist — arkiveret", { kanal: kanal.name });
      throw new ConvexError({
        code: "KANAL_ARCHIVED",
        message: `Kanalen "${kanal.name}" er lukket.`,
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

    // Samme svar for en arkiveret Kanal som for en kode, der ikke findes.
    // Forhåndsvisningen står lige før "Meld mig ind", og at vise en Kanal man
    // ikke kan komme ind i ville kun føre til et afvist tryk.
    if (kanal === null || kanal.archived === true) return null;

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

/**
 * Alle Kanaler, arkiverede med. Kun admins.
 *
 * `getMineKanaler` viser dem, man selv er medlem af; denne viser dem alle, så
 * en admin kan rydde op i Kanaler, hun ikke er med i.
 */
export const getAlleKanaler = query({
  args: { inkluderArkiverede: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const alle = await ctx.db.query("kanaler").collect();
    const synlige =
      args.inkluderArkiverede === true
        ? alle
        : alle.filter((kanal) => kanal.archived !== true);

    // Nyeste først — samme rækkefølge som brugerlisten, så de to lister
    // opfører sig ens.
    synlige.sort((a, b) => b.createdAt - a.createdAt);
    return synlige;
  },
});

/**
 * Arkiverer en Kanal og melder alle medlemmer ud af den.
 *
 * Der er BEVIDST ingen `sletKanal`. En Kanal er refereret af `messages`,
 * `drinkLogs`, `checkIns` og `beacons`; en kaskade ville slette logninger,
 * som brugernes livstidstal og achievements er beregnet ud fra. Oprydning i
 * en liste må ikke ændre folks historik.
 *
 * Medlemmerne meldes ud, fordi en arkiveret Kanal ellers ville blive stående
 * som nogens aktive Kanal — og så ville de se en stilling, ingen kan skrive i
 * længere. Står den som aktiv, flyttes de til en anden af deres Kanaler, hvis
 * de har en.
 *
 * Standard-Kanalen kan ikke arkiveres: nye brugere meldes automatisk ind i
 * den, så en arkiveret standard ville give hver ny bruger en død Kanal.
 */
/**
 * Melder en bruger ind i standard-Kanalen — i praksis Den Åbne Kanal.
 *
 * ## Hvorfor den her fandtes som en påstand, før den fandtes som kode
 *
 * `isDefault` har stået i skemaet siden migreringen med kommentaren "hvis
 * true joiner nye brugere automatisk". `arkiverKanal` nægter at arkivere
 * standard-Kanalen med begrundelsen, at nye brugere meldes ind i den. Admin
 * skjuler arkivér-knappen af samme grund.
 *
 * Ingen af delene var sande. `by_default`-indekset blev aldrig slået op, og
 * `createUser` indsatte `joinedChannelIds: []`. Tre steder beskrev en
 * opførsel, der ikke var bygget — det her er den.
 *
 * ## Den fejler ikke opad
 *
 * Findes der ingen standard-Kanal, eller er den arkiveret, gør funktionen
 * ingenting og siger det i loggen. Den kaldes fra `createUser`, og en profil,
 * der ikke kan oprettes, fordi en Kanal mangler, ville låse folk ude af
 * appen for at håndhæve en bekvemmelighed. Brugeren lander så i "Ingen
 * Kanal", præcis som før.
 *
 * Idempotent: er man allerede medlem, røres ingenting.
 */
export async function meldIndIStandardKanal(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"kanaler"> | undefined> {
  const standard = await ctx.db
    .query("kanaler")
    .withIndex("by_default", (q) => q.eq("isDefault", true))
    .first();

  if (standard === null) {
    console.log("[Kanal] ingen standard-Kanal — bruger meldes ikke ind", { userId });
    return undefined;
  }

  if (standard.archived === true) {
    console.log("[Kanal] standard-Kanalen er arkiveret — bruger meldes ikke ind", {
      userId,
      kanal: standard.name,
    });
    return undefined;
  }

  const bruger = await ctx.db.get(userId);
  if (bruger === null) return undefined;
  if (bruger.joinedChannelIds.includes(standard._id)) return standard._id;

  const now = Date.now();

  // Begge sider af relationen i samme transaktion, som i `joinKanal`.
  await ctx.db.patch(standard._id, {
    members: [...standard.members, userId],
    updatedAt: now,
  });
  await ctx.db.patch(userId, {
    joinedChannelIds: [...bruger.joinedChannelIds, standard._id],
    // Kun hvis brugeren ikke allerede står et sted. En bagudrettet
    // indmeldelse må ikke flytte nogen væk fra den Kanal, de er i gang i.
    ...(bruger.activeChannelId === undefined
      ? { activeChannelId: standard._id }
      : {}),
    updatedAt: now,
  });

  console.log("[Kanal] meldt ind i standard-Kanalen", {
    userId,
    kanal: standard.name,
    medlemmer: standard.members.length + 1,
  });
  return standard._id;
}

/**
 * Udpeger standard-Kanalen.
 *
 * Indtil nu kunne `isDefault` KUN komme ind via migreringen fra Firestore:
 * `createKanal` sætter den altid til `false`, og der fandtes ingen vej til at
 * ændre den. Et deployment uden migrerede data — et nyt dev-miljø, en
 * gendannelse — havde derfor ingen standard-Kanal og ingen måde at få en på.
 *
 * Præcis ÉN ad gangen. Den forrige nulstilles i samme transaktion, så to
 * Kanaler ikke kan stå som standard og gøre det til et lotteri, hvilken en
 * ny bruger havner i.
 */
export const saetStandardKanal = mutation({
  args: { channelId: v.id("kanaler") },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx);

    const kanal = await ctx.db.get(args.channelId);
    if (kanal === null) {
      throw new ConvexError({
        code: "KANAL_NOT_FOUND",
        message: "Kanalen findes ikke.",
      });
    }

    // En arkiveret Kanal er ude af drift. Som standard ville den give hver ny
    // bruger en død Kanal — og `arkiverKanal` nægter i forvejen den omvendte
    // rækkefølge, så den her lukker det sidste hul.
    if (kanal.archived === true) {
      throw new ConvexError({
        code: "KANAL_ARCHIVED",
        message: `"${kanal.name}" er arkiveret og kan ikke være standard-Kanal.`,
      });
    }

    const now = Date.now();

    const nuvaerende = await ctx.db
      .query("kanaler")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .collect();

    for (const tidligere of nuvaerende) {
      if (tidligere._id === args.channelId) continue;
      await ctx.db.patch(tidligere._id, { isDefault: false, updatedAt: now });
    }

    if (!kanal.isDefault) {
      await ctx.db.patch(args.channelId, { isDefault: true, updatedAt: now });
    }

    console.log("[Kanal] standard-Kanal sat", { kanal: kanal.name });
  },
});

/**
 * Melder ALLE eksisterende brugere ind i standard-Kanalen.
 *
 * `createUser` melder nye brugere ind fra fødslen, men reglen kom til, længe
 * efter de nuværende brugere blev oprettet. Uden den her ville "alle brugere
 * er i Den Åbne Kanal" først være sandt om et år, når den sidste
 * migrerede konto var udskiftet.
 *
 * Den reparerer BEGGE sider af relationen hver for sig. De to kan være ude af
 * trit — en bruger kan stå i `members` uden at have Kanalen i
 * `joinedChannelIds` eller omvendt — og en reparation, der kun kigger den ene
 * vej, ville efterlade den anden halvdel af skævheden.
 *
 * Tilføjer kun. Ingen meldes ud af noget, og ingens aktive Kanal flyttes,
 * hvis de allerede står et sted.
 */
export const meldAlleIndIStandardKanal = mutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ kanal: string; tilfoejet: number; ialt: number }> => {
    await requireAdmin(ctx);

    const standard = await ctx.db
      .query("kanaler")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .first();

    if (standard === null) {
      throw new ConvexError({
        code: "INGEN_STANDARD_KANAL",
        message:
          "Der er ingen standard-Kanal. Udpeg en under Kanaler, før du melder " +
          "alle ind.",
      });
    }

    if (standard.archived === true) {
      throw new ConvexError({
        code: "KANAL_ARCHIVED",
        message: `Standard-Kanalen "${standard.name}" er arkiveret.`,
      });
    }

    const alle = await ctx.db.query("users").collect();
    const now = Date.now();

    const iMedlemmer = new Set<string>(standard.members.map((id) => id as string));
    const tilfoejTilMedlemmer: Id<"users">[] = [];
    let tilfoejet = 0;

    for (const bruger of alle) {
      const harKanalen = bruger.joinedChannelIds.includes(standard._id);
      const staarSomMedlem = iMedlemmer.has(bruger._id as string);

      if (harKanalen && staarSomMedlem) continue;
      tilfoejet += 1;

      if (!harKanalen) {
        await ctx.db.patch(bruger._id, {
          joinedChannelIds: [...bruger.joinedChannelIds, standard._id],
          ...(bruger.activeChannelId === undefined
            ? { activeChannelId: standard._id }
            : {}),
          updatedAt: now,
        });
      }

      if (!staarSomMedlem) tilfoejTilMedlemmer.push(bruger._id);
    }

    // ÉN patch af medlemslisten, ikke en per bruger. Et `members`-array der
    // læses og skrives i en løkke er kvadratisk i antallet af brugere, og
    // det er der ingen grund til, når listen kan samles først.
    if (tilfoejTilMedlemmer.length > 0) {
      await ctx.db.patch(standard._id, {
        members: [...standard.members, ...tilfoejTilMedlemmer],
        updatedAt: now,
      });
    }

    console.log("[Kanal] alle meldt ind i standard-Kanalen", {
      kanal: standard.name,
      tilfoejet,
      ialt: alle.length,
    });

    return { kanal: standard.name, tilfoejet, ialt: alle.length };
  },
});

export const arkiverKanal = mutation({
  args: { channelId: v.id("kanaler") },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx);

    const kanal = await ctx.db.get(args.channelId);
    if (kanal === null) {
      throw new ConvexError({
        code: "KANAL_NOT_FOUND",
        message: "Kanalen findes ikke.",
      });
    }

    // Idempotent: en allerede arkiveret Kanal er ikke en fejl.
    if (kanal.archived === true) return;

    if (kanal.isDefault) {
      throw new ConvexError({
        code: "KANAL_IS_DEFAULT",
        message:
          `"${kanal.name}" er standard-Kanalen, som nye brugere meldes ind i. ` +
          `Gør en anden Kanal til standard først.`,
      });
    }

    const now = Date.now();

    // Medlemslisten på Kanalen og `joinedChannelIds` på brugeren er to sider
    // af samme forhold, så begge skal ryddes — ellers ville brugeren stadig
    // kunne læse Kanalens stilling gennem `requireKanalMedlem`.
    for (const userId of kanal.members) {
      const bruger = await ctx.db.get(userId);
      if (bruger === null) continue;

      const tilbage = bruger.joinedChannelIds.filter(
        (id) => id !== args.channelId,
      );

      await ctx.db.patch(userId, {
        joinedChannelIds: tilbage,
        ...(bruger.activeChannelId === args.channelId
          ? { activeChannelId: tilbage[0] }
          : {}),
        // Favoritten peger på en Kanal, man ikke er i længere. Ryd den, så
        // den ikke bliver ved med at pege ind i noget arkiveret.
        ...(bruger.favoriteChannelId === args.channelId
          ? { favoriteChannelId: undefined }
          : {}),
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.channelId, {
      archived: true,
      archivedAt: now,
      members: [],
      updatedAt: now,
    });

    console.log("[Admin] kanal arkiveret", {
      channelId: args.channelId,
      navn: kanal.name,
      medlemmerMeldtUd: kanal.members.length,
    });
  },
});

/**
 * Fortryder en arkivering.
 *
 * Kanalen kommer tilbage tom — medlemmerne blev meldt ud ved arkiveringen, og
 * at melde dem ind igen ville kræve, at vi huskede hvem der var med, og
 * antage at de stadig vil være det. De kan melde sig ind med koden igen.
 */
export const genaktiverKanal = mutation({
  args: { channelId: v.id("kanaler") },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx);

    const kanal = await ctx.db.get(args.channelId);
    if (kanal === null) {
      throw new ConvexError({
        code: "KANAL_NOT_FOUND",
        message: "Kanalen findes ikke.",
      });
    }

    if (kanal.archived !== true) return;

    await ctx.db.patch(args.channelId, {
      archived: false,
      archivedAt: undefined,
      updatedAt: Date.now(),
    });

    console.log("[Admin] kanal genaktiveret", {
      channelId: args.channelId,
      navn: kanal.name,
    });
  },
});

/**
 * Kanalens navn og alle ANDRE medlemmer end én selv.
 *
 * Til varslinger om, at der sker noget i Kanalen. Bevidst enklere end
 * `beregnModtagere` i convex/messages.ts, som også springer dem over, der
 * står med chatten åben — det er rigtigt for en besked, man kan se komme
 * ind, og forkert for alt andet: at sidde i chatten betyder ikke, at man
 * har set, at nogen er gået ud.
 */
export async function kanalOgAndreMedlemmer(
  ctx: Ctx,
  channelId: Id<"kanaler">,
  undtagen: Id<"users">,
): Promise<{ navn: string; modtagere: Id<"users">[] } | undefined> {
  const kanal = await ctx.db.get(channelId);
  if (kanal === null) return undefined;
  return {
    navn: kanal.name,
    modtagere: kanal.members.filter((medlemId) => medlemId !== undtagen),
  };
}

/**
 * "Anders er ude i aften" til resten af Kanalen.
 *
 * Der er TO veje ind i den tilstand, og de skal give samme besked:
 * aftenens første genstand (convex/drinkLogs.ts) og et manuelt Check In på
 * Kortet (convex/checkIns.ts). Begge kalder herind, så teksten og reglen
 * kun findes ét sted.
 *
 * KALDEREN afgør, om det er første gang i dag. Det er med vilje: begge
 * steder har allerede regnet det ud af egne grunde — logningen skal vide
 * det for at sætte `checkInStatus`, check-in for ikke at tælle dobbelt —
 * og at regne det en tredje gang herinde ville være en tredje kopi af den
 * samme grænse. Se `erUdeIDag` i convex/drinkRules.ts.
 *
 * Planlagt frem for afventet, som chatten: handlingen står, uanset om push
 * lykkes. Slår VAPID-nøglerne fejl, springer `sendTilBrugere` stille over.
 */
export async function varslingUdeIAften(
  ctx: MutationCtx,
  channelId: Id<"kanaler">,
  brugerId: Id<"users">,
  navn: string,
): Promise<void> {
  const kanal = await kanalOgAndreMedlemmer(ctx, channelId, brugerId);
  if (kanal === undefined || kanal.modtagere.length === 0) return;

  await ctx.scheduler.runAfter(0, internal.push.sendTilBrugere, {
    userIds: kanal.modtagere,
    title: kanal.navn,
    body: `🍺 ${navn.trim() || "Nogen"} er ude i aften`,
    // Per PERSON, ikke per Kanal. Med ét fælles tag ville "Mathias er ude"
    // erstatte "Anders er ude" på telefonen, og man ville aldrig se, at
    // der var to. Med et tag per person stables de, og et gentaget forsøg
    // på den samme person erstatter sig selv.
    tag: `ude-${channelId}-${brugerId}`,
  });
}

/**
 * "Anders har rundet 10 genstande i aften" til resten af Kanalen.
 *
 * Søskende til `varslingUdeIAften` og bygget som den: kalderen har allerede
 * regnet ud, at der ER en milepæl, og herinde ligger kun modtagerkredsen,
 * teksten og afsendelsen.
 *
 * ## Hvorfor den går til Kanalen og ikke til én selv
 *
 * En hyldest kræver et publikum. Man har lige selv trykket på knappen og
 * står med telefonen i hånden, så en notifikation til én selv ville være en
 * kvittering, ikke en fejring — det er den samme grund til, at
 * achievement-oplåsninger bevidst ikke sendes som push, se
 * docs/notifikationer.md. De andre i Kanalen er derimod ikke nødvendigvis i
 * appen, og det er dem, der kan hylde.
 *
 * Planlagt frem for afventet, som alle andre push i appen: logningen står,
 * uanset om telefonerne kan nås.
 */
export async function varslingMilepael(
  ctx: MutationCtx,
  channelId: Id<"kanaler">,
  brugerId: Id<"users">,
  navn: string,
  milepael: number,
): Promise<void> {
  const kanal = await kanalOgAndreMedlemmer(ctx, channelId, brugerId);
  if (kanal === undefined || kanal.modtagere.length === 0) return;

  const varsling = milepaelsVarsling(navn, milepael);

  await ctx.scheduler.runAfter(0, internal.push.sendTilBrugere, {
    userIds: kanal.modtagere,
    title: kanal.navn,
    body: varsling.tekst,
    // Per PERSON og per MILEPÆL. Med et tag per person ville "rundede 15"
    // erstatte "rundede 10" på telefonen, og man ville aldrig se, at der
    // var to — mens et gentaget forsøg på den SAMME milepæl erstatter sig
    // selv, som det skal.
    tag: `milepael-${channelId}-${brugerId}-${milepael}`,
  });
}
