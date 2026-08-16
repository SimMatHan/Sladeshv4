import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireCurrentUser } from "./identity";
import {
  BEACON_MAX_RUNDER,
  BEACON_RADIUS_M,
  BEACON_STANDARD_BESKED,
  BEACON_TYPE,
  BEACON_UKENDT_OPRETTER,
  beaconTitel,
  beaconVarsling,
  beslutVarsling,
  erBeaconUdloebet,
  erRunderOpbrugt,
  laesPosition,
} from "./beaconRules";

/**
 * Beacons (stress-signaler).
 *
 * Afløser /stressBeacons i Firestore samt den planlagte Cloud Function
 * sendBeaconNotifications, som kørte hvert 5. minut.
 *
 * Oprettelse er ADMIN-ONLY. Det var det også i det gamle repo, men kun i
 * praksis: admin-portalen og kortets admin-tilstand var de eneste to
 * skriveveje, og spærren lå i UI'et. Her er den en serverregel.
 *
 * VIGTIGT om varsling: selve push-LEVERINGEN findes ikke i denne app endnu.
 * Den gik gennem Web Push og collectionen `pushSubscriptions`, som ligger
 * uden for migreringens afgrænsning (docs/eksisterende-datamodel.md, 7.6).
 * `evaluerBeacons` udfører derfor hele udvælgelsen — radius, forældede
 * positioner, deduplikering, runder, udløb — og returnerer modtagerne, men
 * sender ingenting. Se kommentaren ved `evaluerAlleBeacons`.
 */

/**
 * Opretter en beacon på et punkt. Kun admins.
 *
 * Defaults er ordret fra adminService.createStressSignal, så en beacon
 * oprettet i den nye app ser ud som en fra den gamle.
 */
export const opretBeacon = mutation({
  args: {
    lat: v.number(),
    lng: v.number(),
    title: v.optional(v.string()),
    venue: v.optional(v.string()),
    message: v.optional(v.string()),
    radius: v.optional(v.number()),
    channelId: v.optional(v.id("kanaler")),
  },
  handler: async (ctx, args): Promise<Id<"beacons">> => {
    const admin = await requireAdmin(ctx);

    if (!erGyldigKoordinat(args.lat, args.lng)) {
      throw new ConvexError({
        code: "INVALID_LOCATION",
        message: "Koordinaterne er uden for jorden.",
      });
    }

    // En beacon bundet til en Kanal må kun oprettes af et medlem. Admins
    // slipper bevidst ikke igennem her — se convex/identity.ts.
    if (args.channelId !== undefined && !admin.joinedChannelIds.includes(args.channelId)) {
      throw new ConvexError({
        code: "NOT_A_MEMBER",
        message: "Du er ikke medlem af den angivne Kanal.",
      });
    }

    const radius = args.radius ?? BEACON_RADIUS_M;
    if (radius <= 0) {
      throw new ConvexError({
        code: "INVALID_RADIUS",
        message: "Radius skal være større end 0 meter.",
      });
    }

    const now = Date.now();
    const beaconId = await ctx.db.insert("beacons", {
      createdBy: admin._id,
      channelId: args.channelId,
      lat: args.lat,
      lng: args.lng,
      title: beaconTitel(args.title, args.venue),
      venue: args.venue,
      message: args.message?.trim() || BEACON_STANDARD_BESKED,
      type: BEACON_TYPE,
      radius,
      active: true,
      notificationsSent: 0,
      createdAt: now,
      updatedAt: now,
    });

    console.log("[Beacon] oprettet", { beaconId, radius });
    return beaconId;
  },
});

/**
 * Beacons på kortet.
 *
 * Aktive beacons ses af alle; inaktive kun af admins. Det svarer til
 * kortets `data.active || userIsAdmin` i det gamle repo, hvor en inaktiv
 * beacon var en admin har placeret, men ikke aktiveret.
 *
 * Er `channelId` sat, returneres kun beacons for den Kanal — plus dem uden
 * Kanal, som gælder alle.
 */
export const getBeacons = query({
  args: { channelId: v.optional(v.id("kanaler")) },
  handler: async (ctx, args): Promise<Doc<"beacons">[]> => {
    const user = await requireCurrentUser(ctx);

    if (args.channelId !== undefined && !user.joinedChannelIds.includes(args.channelId)) {
      throw new ConvexError({
        code: "NOT_A_MEMBER",
        message: "Du er ikke medlem af den angivne Kanal.",
      });
    }

    const aktive = await ctx.db
      .query("beacons")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    // `isAdmin` styrer KUN om slukkede beacons er med — ikke om man må se på
    // tværs af Kanaler. Admins slipper bevidst ikke uden om kanalspærren, jf.
    // convex/identity.ts.
    const kandidater =
      user.isAdmin === true
        ? [
            ...aktive,
            ...(await ctx.db
              .query("beacons")
              .withIndex("by_active", (q) => q.eq("active", false))
              .collect()),
          ]
        : aktive;

    return kandidater.filter((beacon) => {
      // En beacon uden Kanal gælder alle; ellers kræves medlemskab. Uden
      // dette ville en beacons position og eksistens kunne ses af enhver
      // indlogget bruger, også uden for Kanalen.
      if (beacon.channelId !== undefined) {
        if (!user.joinedChannelIds.includes(beacon.channelId)) return false;
      }

      if (args.channelId === undefined) return true;
      return beacon.channelId === undefined || beacon.channelId === args.channelId;
    });
  },
});

/** Slukker en beacon manuelt. Kun admins. */
export const deaktiverBeacon = mutation({
  args: { beaconId: v.id("beacons") },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx);

    const beacon = await ctx.db.get(args.beaconId);
    if (beacon === null) {
      throw new ConvexError({
        code: "BEACON_NOT_FOUND",
        message: "Beaconen findes ikke.",
      });
    }

    // Idempotent: en allerede slukket beacon er ikke en fejl.
    if (!beacon.active) return;

    const now = Date.now();
    await ctx.db.patch(args.beaconId, {
      active: false,
      deactivatedAt: now,
      updatedAt: now,
    });

    console.log("[Beacon] deaktiveret manuelt", { beaconId: args.beaconId });
  },
});

export type Evalueringsresultat = {
  /** Antal aktive beacons der blev set på. */
  evalueret: number;
  /** Antal der blev slukket i denne kørsel. */
  deaktiveret: number;
  /** Modtagere udvalgt til varsling, per beacon. */
  varslinger: Array<{
    beaconId: Id<"beacons">;
    titel: string;
    tekst: string;
    modtagere: Id<"users">[];
  }>;
};

/**
 * Gennemgår alle aktive beacons og finder ud af, hvem der skal varsles.
 *
 * Rækkefølgen af spærrer er den samme som i Cloud Functionen, og den er
 * betydningsfuld:
 *   1. runder opbrugt  → sluk, se ikke på brugere
 *   2. udløbet (>2t)   → sluk, se ikke på brugere
 *   3. ugyldigt punkt  → spring over
 *   4. per bruger: opretter / allerede varslet / position / radius
 *
 * At udløb ligger FØR brugergennemgangen er også det, der gør de migrerede
 * beacons ufarlige: deres `notifiedUsers` er nøglet på Firebase-UID'er, men
 * de er alle ældre end 2 timer og slukkes i trin 2.
 *
 * Skrevet som en almindelig funktion frem for kun en mutation-handler, så
 * både cron-jobbet og smoke-testens indpakning kan kalde præcis den samme
 * kode. Ingen personoplysninger logges — kun tal og beacon-id'er.
 */
export async function evaluerAlleBeacons(
  ctx: MutationCtx,
  now: number,
): Promise<Evalueringsresultat> {
  const aktive = await ctx.db
    .query("beacons")
    .withIndex("by_active", (q) => q.eq("active", true))
    .collect();

  const resultat: Evalueringsresultat = {
    evalueret: aktive.length,
    deaktiveret: 0,
    varslinger: [],
  };

  if (aktive.length === 0) return resultat;

  // Opretternes navne slås op én gang og genbruges på tværs af beacons —
  // som creatorNameCache i det gamle repo.
  const opretterNavne = new Map<Id<"users">, string>();
  const opretterNavn = async (userId: Id<"users">): Promise<string> => {
    const kendt = opretterNavne.get(userId);
    if (kendt !== undefined) return kendt;
    const bruger = await ctx.db.get(userId);
    const navn = bruger?.displayName.trim() || BEACON_UKENDT_OPRETTER;
    opretterNavne.set(userId, navn);
    return navn;
  };

  // Indcheckede brugere hentes én gang for hele kørslen. Det er samme
  // øjebliksbillede for alle beacons, hvilket er både billigere og mere
  // konsistent end et opslag per beacon.
  const indcheckede = await ctx.db
    .query("users")
    .withIndex("by_check_in", (q) => q.eq("checkInStatus", true))
    .collect();

  for (const beacon of aktive) {
    const sluk = async (grund: string): Promise<void> => {
      await ctx.db.patch(beacon._id, {
        active: false,
        deactivatedAt: now,
        updatedAt: now,
      });
      resultat.deaktiveret++;
      console.log("[Beacon] slukket", { beaconId: beacon._id, grund });
    };

    if (erRunderOpbrugt(beacon.notificationsSent)) {
      await sluk("runder opbrugt");
      continue;
    }

    if (erBeaconUdloebet(beacon, now)) {
      await sluk("udloebet");
      continue;
    }

    if (!erGyldigKoordinat(beacon.lat, beacon.lng)) {
      console.log("[Beacon] springer over — ugyldigt punkt", {
        beaconId: beacon._id,
      });
      continue;
    }

    const radius = beacon.radius ?? BEACON_RADIUS_M;
    const notificerede = { ...(beacon.notifiedUsers ?? {}) };

    // En kanalbundet beacon gælder kun Kanalens medlemmer.
    const beaconKanal = beacon.channelId;
    const kandidater =
      beaconKanal === undefined
        ? indcheckede
        : indcheckede.filter((bruger) => bruger.joinedChannelIds.includes(beaconKanal));

    const modtagere: Id<"users">[] = [];
    for (const bruger of kandidater) {
      const beslutning = beslutVarsling({
        erOpretter: bruger._id === beacon.createdBy,
        alleredeVarslet: notificerede[bruger._id] === true,
        position: laesPosition(bruger),
        beaconLat: beacon.lat,
        beaconLng: beacon.lng,
        radius,
        now,
      });

      if (!beslutning.varsl) continue;

      notificerede[bruger._id] = true;
      modtagere.push(bruger._id);
    }

    if (modtagere.length === 0) {
      // Map'et skrives alligevel, hvis det manglede helt — så er formen den
      // samme på alle rækker fra nu af.
      if (beacon.notifiedUsers === undefined) {
        await ctx.db.patch(beacon._id, { notifiedUsers: notificerede, updatedAt: now });
      }
      continue;
    }

    const runder = (beacon.notificationsSent ?? 0) + 1;

    await ctx.db.patch(beacon._id, {
      notificationsSent: runder,
      lastNotificationSentAt: now,
      notifiedUsers: notificerede,
      updatedAt: now,
      // Sidste runde slukker beaconen med det samme, så den ikke bliver
      // hentet igen om 5 minutter bare for at blive slukket i trin 1.
      ...(runder >= BEACON_MAX_RUNDER ? { active: false, deactivatedAt: now } : {}),
    });

    if (runder >= BEACON_MAX_RUNDER) resultat.deaktiveret++;

    const varsling = beaconVarsling(await opretterNavn(beacon.createdBy));
    resultat.varslinger.push({
      beaconId: beacon._id,
      titel: varsling.titel,
      tekst: varsling.tekst,
      modtagere,
    });

    console.log("[Beacon] varslingsrunde", {
      beaconId: beacon._id,
      runde: runder,
      modtagere: modtagere.length,
    });
  }

  return resultat;
}

/**
 * Cron-jobbets indgang. `internalMutation` betyder at ingen klient kan kalde
 * den — den kører kun på serverens eget initiativ.
 */
export const evaluerBeacons = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Evalueringsresultat> => {
    return await evaluerAlleBeacons(ctx, args.now ?? Date.now());
  },
});

/**
 * Grove grænser. Fanger NaN, uendelige tal og koordinater der er byttet om
 * eller kommer fra en anden enhed end grader. Punktet 0/0 er teknisk set
 * gyldigt (Atlanterhavet) og afvises derfor ikke her.
 */
function erGyldigKoordinat(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
