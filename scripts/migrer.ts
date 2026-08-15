/**
 * Migrering: Firestore → Convex.
 *
 * LÆSER kun fra Firestore. Skriver ALDRIG til Firebase.
 *
 * Kør — tørkørsel er DEFAULT:
 *   export GOOGLE_APPLICATION_CREDENTIALS=~/.config/sladesh/datarevision-key.json
 *
 *   # Generér hemmeligheden ÉN gang og brug den begge steder — ellers kender
 *   # du den ikke selv bagefter:
 *   export MIGRATION_SECRET=$(openssl rand -hex 32)
 *   npx convex env set MIGRATION_SECRET "$MIGRATION_SECRET"
 *
 *   # I en ny terminal hentes den tilbage fra deploymentet:
 *   #   export MIGRATION_SECRET=$(npx convex env get MIGRATION_SECRET)
 *
 *   npm run migrer                    # tørkørsel: læser, transformerer, rapporterer
 *   npm run migrer -- --skriv         # skriver rigtigt
 *   npm run migrer -- --skriv --ryd   # rydder først (kun til gentagne dev-kørsler)
 *
 * Rækkefølgen er bestemt af, at users og kanaler peger på hinanden:
 *   1. brugere ind uden kanalreferencer
 *   2. kanaler ind, med medlemmer oversat til Convex-id'er
 *   3. brugernes joinedChannelIds/activeChannelId sættes
 *   4. historik (checkIns, drinkLogs, achievements, beacons)
 *   5. totalPoints og stræk genberegnes fra logrækkerne
 *
 * PRIVATLIV: konsoloutput indeholder kun tal og feltnavne — aldrig emails,
 * navne, positioner eller dokument-id'er fra produktionen.
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";

// ---------------------------------------------------------------------------
// Opsætning
// ---------------------------------------------------------------------------

const skriv = process.argv.includes("--skriv");
const ryd = process.argv.includes("--ryd");

const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL;
const secret = process.env.MIGRATION_SECRET;
const nøglesti = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projektId = process.env.FIREBASE_PROJECT_ID ?? "sladeshultimate-1";

const mangler = Object.entries({
  VITE_CONVEX_URL: convexUrl,
  MIGRATION_SECRET: secret,
  GOOGLE_APPLICATION_CREDENTIALS: nøglesti,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (mangler.length > 0) {
  console.error(
    `[Migrering] mangler: ${mangler.join(", ")}\n` +
      "  Se kommentaren øverst i scripts/migrer.ts.",
  );
  process.exit(1);
}

if (ryd && !skriv) {
  console.error("[Migrering] --ryd kræver --skriv. Afbryder.");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: projektId });
const db = getFirestore();
const auth = getAuth();
const convex = new ConvexHttpClient(convexUrl!);

// ---------------------------------------------------------------------------
// Transformationshjælpere
// ---------------------------------------------------------------------------

/**
 * Firestore Timestamp → epoch ms.
 * Returnerer undefined for null/manglende, så feltet kan udelades helt.
 */
function tid(værdi: unknown): number | undefined {
  if (værdi === null || værdi === undefined) return undefined;
  if (typeof værdi === "number") return værdi;
  if (typeof værdi === "object" && typeof (værdi as { toDate?: unknown }).toDate === "function") {
    return ((værdi as { toDate: () => Date }).toDate)().getTime();
  }
  return undefined;
}

/**
 * Fjerner felter med værdien `undefined`.
 *
 * Firestore gemmer eksplicit `null`, hvor Convex' `v.optional()` betyder
 * "feltet er der ikke". 343 af de ~350 afvigelser datarevisionen fandt er
 * netop dette — derfor konverteres null til undefined undervejs, og denne
 * funktion fjerner dem til sidst.
 */
function udenTomme<T extends Record<string, unknown>>(objekt: T): T {
  const ud: Record<string, unknown> = {};
  for (const [nøgle, værdi] of Object.entries(objekt)) {
    if (værdi !== undefined) ud[nøgle] = værdi;
  }
  return ud as T;
}

/** null → undefined, alt andet uændret. */
function tomtSomUndefined<T>(værdi: T | null | undefined): T | undefined {
  return værdi === null || værdi === undefined ? undefined : værdi;
}

function tekst(værdi: unknown): string | undefined {
  return typeof værdi === "string" && værdi.length > 0 ? værdi : undefined;
}

function tal(værdi: unknown): number | undefined {
  return typeof værdi === "number" && Number.isFinite(værdi) ? værdi : undefined;
}

function boolsk(værdi: unknown): boolean | undefined {
  return typeof værdi === "boolean" ? værdi : undefined;
}

function punkt(værdi: unknown): { lat: number; lng: number } | undefined {
  if (værdi === null || typeof værdi !== "object") return undefined;
  const o = værdi as { lat?: unknown; lng?: unknown };
  const lat = tal(o.lat);
  const lng = tal(o.lng);
  return lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
}

/** Deler en liste i portioner, så én mutation ikke bliver for stor. */
function portioner<T>(liste: T[], størrelse: number): T[][] {
  const ud: T[][] = [];
  for (let i = 0; i < liste.length; i += størrelse) {
    ud.push(liste.slice(i, i + størrelse));
  }
  return ud;
}

// Afvigelser vi vil rapportere til sidst frem for at fejle på.
const noter: string[] = [];
const ukendteGenderVærdier = new Map<string, number>();

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(
    `[Migrering] ${skriv ? "SKRIVER RIGTIGT" : "TØRKØRSEL — der skrives intet"}`,
  );
  console.log(`[Migrering] kilde: Firestore/${projektId}`);
  console.log(`[Migrering] mål:   ${convexUrl}\n`);

  // --- Læs alt fra Firestore -----------------------------------------------
  console.log("[Migrering] læser Firestore …");

  // Auth-UID'erne skal med, så vi kan se HVILKE brugere der ikke kan logge
  // ind efter migreringen. Det kan ikke afgøres ud fra dokument-id'ets form:
  // det afvigende dokument har et helt normalt 28-tegns id, det findes bare
  // ikke i Firebase Auth længere.
  const authUids = new Set<string>();
  {
    let sideToken: string | undefined = undefined;
    do {
      const side = await auth.listUsers(1000, sideToken);
      for (const bruger of side.users) authUids.add(bruger.uid);
      sideToken = side.pageToken;
    } while (sideToken);
  }

  const brugerSnap = await db.collection("users").get();
  const kanalSnap = await db.collection("channels").get();
  const checkInSnap = await db.collectionGroup("checkIns").get();
  const drinkLogSnap = await db.collectionGroup("drinkLogs").get();
  const beaconSnap = await db.collection("stressBeacons").get();

  console.log(
    `[Migrering]   ${authUids.size} Auth-brugere, ` +
      `${brugerSnap.size} brugere, ${kanalSnap.size} kanaler, ` +
      `${checkInSnap.size} check ins, ${drinkLogSnap.size} drikkelogninger, ` +
      `${beaconSnap.size} beacons`,
  );

  const levendeKanalIds = new Set(kanalSnap.docs.map((d) => d.id));
  const levendeBrugerIds = new Set(brugerSnap.docs.map((d) => d.id));

  // --- Transformér brugere -------------------------------------------------
  const brugere = brugerSnap.docs.map((doc) => {
    const d = doc.data();

    // promille.gender: UI'et tilbyder kun male/female. Alt andet — typisk
    // null — logges og udelades frem for at gætte en værdi.
    let gender: "male" | "female" | undefined = undefined;
    const råGender = (d.promille as { gender?: unknown } | undefined)?.gender;
    if (råGender === "male" || råGender === "female") {
      gender = råGender;
    } else if (råGender !== undefined) {
      const nøgle = råGender === null ? "null" : `${typeof råGender}`;
      ukendteGenderVærdier.set(
        nøgle,
        (ukendteGenderVærdier.get(nøgle) ?? 0) + 1,
      );
    }

    const promilleRå = d.promille as Record<string, unknown> | undefined;
    const promille =
      promilleRå !== undefined && promilleRå !== null
        ? udenTomme({
            enabled: boolsk(promilleRå.enabled) ?? false,
            gender,
            weight: tal(promilleRå.weight),
            height: tal(promilleRå.height),
          })
        : undefined;

    const lokation = d.location as Record<string, unknown> | undefined;
    const nuLokation = d.currentLocation as Record<string, unknown> | undefined;

    return {
      firestoreId: doc.id,
      // Dokument-id'et ER Firebase UID'et for 31 af 32 brugere.
      authId: doc.id,
      email: String(d.email ?? "").trim().toLowerCase(),
      displayName: tekst(d.displayName) ?? String(d.email ?? "").split("@")[0],
      ...udenTomme({
        fullName: tekst(d.fullName),
        photoURL: tekst(d.photoURL),
        onboardingCompleted: boolsk(d.onboardingCompleted),
        isAdmin: boolsk(d.isAdmin),
        checkInStatus: boolsk(d.checkInStatus),
        lastCheckIn: tid(d.lastCheckIn),
        lastCheckInVenue: tekst(d.lastCheckInVenue),
        lastStatusCheckedAt: tid(d.lastStatusCheckedAt),
        checkInCount: tal(d.checkInCount),
        location:
          lokation !== undefined && punkt(lokation) !== undefined
            ? {
                ...punkt(lokation)!,
                lastUpdated: tid(lokation.lastUpdated) ?? 0,
              }
            : undefined,
        currentLocation:
          nuLokation !== undefined && punkt(nuLokation) !== undefined
            ? {
                ...punkt(nuLokation)!,
                venue: tekst(nuLokation.venue) ?? "",
                timestamp: tid(nuLokation.timestamp) ?? 0,
              }
            : undefined,
        lastDrinkAt: tid(d.lastDrinkAt),
        lastDrinkDayStart: tid(d.lastDrinkDayStart),
        totalRunResets: tal(d.totalRunResets),
        promille,
        sladeshSent: tal(d.sladeshSent),
        sladeshReceived: tal(d.sladeshReceived),
        sladeshCompletedCount: tal(d.sladeshCompletedCount),
        sladeshFailedCount: tal(d.sladeshFailedCount),
        lastSladeshSentAt: tid(d.lastSladeshSentAt),
        emoji: tekst(d.emoji),
        avatarColor: tekst(d.avatarColor),
        profileEmoji: tekst(d.profileEmoji),
        profileGradient: tekst(d.profileGradient),
        updatedAt: tid(d.updatedAt),
      }),
      createdAt: tid(d.createdAt) ?? Date.now(),
    };
  });

  // Kan brugeren logge ind bagefter? Det afgøres af, om dokument-id'et
  // faktisk findes i Firebase Auth — ikke af hvordan id'et ser ud.
  const udenAuthKonto = brugere.filter((b) => !authUids.has(b.authId));
  if (udenAuthKonto.length > 0) {
    noter.push(
      `${udenAuthKonto.length} bruger(e) har intet tilsvarende Firebase ` +
        "Auth-login. De migreres (så deres historik bevares), men kan ikke " +
        "logge ind før kontoen genskabes eller authId kobles manuelt.",
    );
  }

  // Den anden vej: Auth-konti uden profil migreres ikke — de får en profil
  // første gang de logger ind i den nye app.
  const brugerDokIds = new Set(brugere.map((b) => b.authId));
  const authUdenProfil = [...authUids].filter((uid) => !brugerDokIds.has(uid));
  if (authUdenProfil.length > 0) {
    noter.push(
      `${authUdenProfil.length} Firebase Auth-konto(er) har ingen profil og ` +
        "migreres ikke. De får en profil første gang de logger ind.",
    );
  }

  const udenEmail = brugere.filter((b) => b.email === "");
  if (udenEmail.length > 0) {
    noter.push(`${udenEmail.length} bruger(e) mangler email.`);
  }

  // --- Transformér kanaler -------------------------------------------------
  const kanaler = kanalSnap.docs.map((doc) => {
    const d = doc.data();
    const medlemmer = Array.isArray(d.members)
      ? d.members.filter(
          (m: unknown): m is string =>
            typeof m === "string" && levendeBrugerIds.has(m),
        )
      : [];

    const opretter =
      typeof d.createdBy === "string" && levendeBrugerIds.has(d.createdBy)
        ? d.createdBy
        : undefined;

    return {
      firestoreId: doc.id,
      name: String(d.name ?? "Uden navn"),
      ...udenTomme({
        code: tekst(d.code),
        description: tekst(tomtSomUndefined(d.description)),
        updatedAt: tid(d.updatedAt),
      }),
      isDefault: boolsk(d.isDefault) ?? false,
      medlemFirestoreIds: medlemmer,
      opretterFirestoreId: opretter,
      createdAt: tid(d.createdAt) ?? Date.now(),
    };
  });

  const udenKode = kanaler.filter((k) => k.code === undefined);
  if (udenKode.length > 0) {
    noter.push(`${udenKode.length} kanal(er) har ingen invitationskode.`);
  }
  const udenOpretter = kanaler.filter((k) => k.opretterFirestoreId === undefined);
  if (udenOpretter.length > 0) {
    noter.push(`${udenOpretter.length} kanal(er) har ingen kendt opretter.`);
  }

  // --- Transformér historik ------------------------------------------------
  let sprungetCheckIns = 0;
  const checkIns = checkInSnap.docs.flatMap((doc) => {
    const ejer = doc.ref.parent.parent?.id;
    if (ejer === undefined || !levendeBrugerIds.has(ejer)) {
      sprungetCheckIns++;
      return [];
    }
    const d = doc.data();
    const kanal =
      typeof d.channelId === "string" && levendeKanalIds.has(d.channelId)
        ? d.channelId
        : undefined;

    return [
      {
        ejerFirestoreId: ejer,
        kanalFirestoreId: kanal,
        venue: tekst(d.venue) ?? "",
        location: punkt(d.location),
        timestamp: tid(d.timestamp) ?? 0,
      },
    ];
  });

  let sprungetLogs = 0;
  const drinkLogs = drinkLogSnap.docs.flatMap((doc) => {
    const ejer = doc.ref.parent.parent?.id;
    if (ejer === undefined || !levendeBrugerIds.has(ejer)) {
      sprungetLogs++;
      return [];
    }
    const d = doc.data();
    const kanal =
      typeof d.channelId === "string" && levendeKanalIds.has(d.channelId)
        ? d.channelId
        : undefined;

    return [
      {
        ejerFirestoreId: ejer,
        kanalFirestoreId: kanal,
        categoryId: tekst(d.categoryId) ?? "other",
        variationName: tekst(d.variationName) ?? "",
        ...udenTomme({
          sizeId: tekst(d.sizeId),
          // Fortrydelser bærer NEGATIV vægt — fortegnet skal med uændret.
          sizeMultiplier: tal(d.sizeMultiplier),
          sizeLabel: tekst(d.sizeLabel),
          sizeVolume: tekst(d.sizeVolume),
          location: punkt(d.location),
          userDisplayName: tekst(d.userDisplayName),
          userEmoji: tekst(d.userEmoji),
          userProfileEmoji: tekst(d.userProfileEmoji),
          userProfileGradient: tekst(d.userProfileGradient),
          isReset: boolsk(d.isReset),
          action: tekst(d.action),
        }),
        timestamp: tid(d.timestamp) ?? 0,
      },
    ];
  });

  const fortrydelser = drinkLogs.filter(
    (l) => (l as { sizeMultiplier?: number }).sizeMultiplier !== undefined &&
      (l as { sizeMultiplier: number }).sizeMultiplier < 0,
  ).length;

  // Achievements: map på brugeren → én række per (bruger, achievement).
  const achievements = brugerSnap.docs.flatMap((doc) => {
    const map = doc.data().achievements as Record<string, unknown> | undefined;
    if (map === null || typeof map !== "object") return [];
    return Object.entries(map).flatMap(([achievementId, rå]) => {
      if (rå === null || typeof rå !== "object") return [];
      const a = rå as Record<string, unknown>;
      return [
        {
          ejerFirestoreId: doc.id,
          achievementId,
          count: tal(a.count) ?? 1,
          ...udenTomme({
            unlockedAt: tid(a.unlockedAt),
            firstUnlockedAt: tid(a.firstUnlockedAt),
            lastUnlockedAt: tid(a.lastUnlockedAt),
            maxStreak: tal(a.maxStreak),
          }),
        },
      ];
    });
  });

  // Beacons: legacy `location: {lat,lng}` normaliseres til flad lat/lng.
  let sprungetBeacons = 0;
  let normaliseredeBeacons = 0;
  const beacons = beaconSnap.docs.flatMap((doc) => {
    const d = doc.data();
    const flad = punkt({ lat: d.lat, lng: d.lng });
    const legacy = punkt(d.location);
    const koordinat = flad ?? legacy;

    if (koordinat === undefined) {
      sprungetBeacons++;
      return [];
    }
    if (flad === undefined && legacy !== undefined) normaliseredeBeacons++;

    const opretter =
      typeof d.createdBy === "string" && levendeBrugerIds.has(d.createdBy)
        ? d.createdBy
        : undefined;
    if (opretter === undefined) {
      sprungetBeacons++;
      return [];
    }

    const notificerede = d.notifiedUsers as Record<string, unknown> | undefined;
    const notifiedUsers =
      notificerede !== null && typeof notificerede === "object"
        ? Object.fromEntries(
            Object.entries(notificerede).filter(
              (par): par is [string, boolean] => typeof par[1] === "boolean",
            ),
          )
        : undefined;

    return [
      {
        opretterFirestoreId: opretter,
        ...koordinat,
        ...udenTomme({
          title: tekst(d.title),
          type: tekst(d.type),
          radius: tal(d.radius),
          venue: tekst(d.venue),
          message: tekst(d.message),
          notificationsSent: tal(d.notificationsSent),
          lastNotificationSentAt: tid(d.lastNotificationSentAt),
          notifiedUsers,
          expiresAt: tid(d.expiresAt),
          deactivatedAt: tid(d.deactivatedAt),
          updatedAt: tid(d.updatedAt),
        }),
        active: boolsk(d.active) ?? false,
        createdAt: tid(d.createdAt) ?? Date.now(),
      },
    ];
  });

  // --- Rapport -------------------------------------------------------------
  console.log("\n[Migrering] transformeret:");
  console.log(`  brugere:        ${brugere.length}`);
  console.log(`  kanaler:        ${kanaler.length}`);
  console.log(`  check ins:      ${checkIns.length} (sprunget over: ${sprungetCheckIns})`);
  console.log(`  drikkelogninger:${drinkLogs.length} (sprunget over: ${sprungetLogs})`);
  console.log(`    heraf fortrydelser med negativ vægt: ${fortrydelser}`);
  console.log(`  achievements:   ${achievements.length}`);
  console.log(`  beacons:        ${beacons.length} (sprunget over: ${sprungetBeacons}, normaliseret fra legacy: ${normaliseredeBeacons})`);

  if (ukendteGenderVærdier.size > 0) {
    console.log("\n[Migrering] promille.gender med værdier uden for male/female:");
    for (const [type, antal] of ukendteGenderVærdier) {
      console.log(`  ${type}: ${antal} → feltet udelades`);
    }
  }

  if (noter.length > 0) {
    console.log("\n[Migrering] noter:");
    for (const note of noter) console.log(`  • ${note}`);
  }

  if (!skriv) {
    console.log(
      "\n[Migrering] TØRKØRSEL færdig — intet er skrevet.\n" +
        "  Kør igen med --skriv når tallene ser rigtige ud.",
    );
    return;
  }

  // --- Skriv til Convex ----------------------------------------------------
  if (ryd) {
    console.log("\n[Migrering] rydder eksisterende data …");
    const slettet = await convex.mutation(api.migrering.ryd, { secret: secret! });
    console.log(`  slettet: ${JSON.stringify(slettet)}`);
  } else {
    const status = await convex.query(api.migrering.status, { secret: secret! });
    const ikkeTom = Object.entries(status).filter(([, n]) => n > 0);
    if (ikkeTom.length > 0) {
      console.log(
        `\n[Migrering] deploymentet har allerede data: ${JSON.stringify(status)}`,
      );
      console.log(
        "  Migreringen er idempotent for brugere og kanaler, men historik " +
          "ville blive indsat igen. Brug --ryd hvis du vil starte forfra.",
      );
      process.exit(1);
    }
  }

  console.log("\n[Migrering] 1/5 indsætter brugere …");
  const brugerMap: Record<string, Id<"users">> = {};
  for (const portion of portioner(brugere, 50)) {
    Object.assign(
      brugerMap,
      await convex.mutation(api.migrering.opretBrugere, {
        secret: secret!,
        brugere: portion,
      }),
    );
  }
  console.log(`  ${Object.keys(brugerMap).length} brugere`);

  console.log("[Migrering] 2/5 indsætter kanaler …");
  const kanalMap = await convex.mutation(api.migrering.opretKanaler, {
    secret: secret!,
    kanaler: kanaler.map((k) => ({
      firestoreId: k.firestoreId,
      name: k.name,
      code: k.code,
      isDefault: k.isDefault,
      description: k.description,
      members: k.medlemFirestoreIds
        .map((id) => brugerMap[id])
        .filter((id): id is Id<"users"> => id !== undefined),
      createdBy:
        k.opretterFirestoreId !== undefined
          ? brugerMap[k.opretterFirestoreId]
          : undefined,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    })),
  });
  console.log(`  ${Object.keys(kanalMap).length} kanaler`);

  console.log("[Migrering] 3/5 kobler brugere til kanaler …");
  let dødeReferencer = 0;
  const koblinger = brugerSnap.docs.flatMap((doc) => {
    const userId = brugerMap[doc.id];
    if (userId === undefined) return [];
    const d = doc.data();

    const joined = (Array.isArray(d.joinedChannelIds) ? d.joinedChannelIds : [])
      .filter((id: unknown): id is string => typeof id === "string")
      .map((id: string) => {
        const convexId = kanalMap[id];
        if (convexId === undefined) dødeReferencer++;
        return convexId;
      })
      .filter((id): id is Id<"kanaler"> => id !== undefined);

    const aktiv =
      typeof d.activeChannelId === "string" ? kanalMap[d.activeChannelId] : undefined;
    if (typeof d.activeChannelId === "string" && aktiv === undefined) {
      dødeReferencer++;
    }
    const favorit =
      typeof d.favoriteChannelId === "string"
        ? kanalMap[d.favoriteChannelId]
        : undefined;

    return [
      udenTomme({
        userId,
        joinedChannelIds: joined,
        activeChannelId: aktiv,
        favoriteChannelId: favorit,
      }),
    ];
  });

  for (const portion of portioner(koblinger, 50)) {
    await convex.mutation(api.migrering.koblBrugereTilKanaler, {
      secret: secret!,
      koblinger: portion,
    });
  }
  console.log(`  ${koblinger.length} brugere koblet (døde referencer udeladt: ${dødeReferencer})`);

  console.log("[Migrering] 4/5 indsætter historik …");
  for (const portion of portioner(checkIns, 200)) {
    await convex.mutation(api.migrering.opretCheckIns, {
      secret: secret!,
      raekker: portion.flatMap((r) => {
        const userId = brugerMap[r.ejerFirestoreId];
        if (userId === undefined) return [];
        return [
          udenTomme({
            userId,
            channelId:
              r.kanalFirestoreId !== undefined
                ? kanalMap[r.kanalFirestoreId]
                : undefined,
            venue: r.venue,
            location: r.location,
            timestamp: r.timestamp,
          }),
        ];
      }),
    });
  }
  console.log(`  ${checkIns.length} check ins`);

  for (const portion of portioner(drinkLogs, 200)) {
    await convex.mutation(api.migrering.opretDrinkLogs, {
      secret: secret!,
      raekker: portion.flatMap((r) => {
        const { ejerFirestoreId, kanalFirestoreId, ...felter } = r;
        const userId = brugerMap[ejerFirestoreId];
        if (userId === undefined) return [];
        return [
          udenTomme({
            ...felter,
            userId,
            channelId:
              kanalFirestoreId !== undefined ? kanalMap[kanalFirestoreId] : undefined,
          }),
        ];
      }),
    });
  }
  console.log(`  ${drinkLogs.length} drikkelogninger`);

  for (const portion of portioner(achievements, 200)) {
    await convex.mutation(api.migrering.opretAchievements, {
      secret: secret!,
      raekker: portion.flatMap((r) => {
        const { ejerFirestoreId, ...felter } = r;
        const userId = brugerMap[ejerFirestoreId];
        if (userId === undefined) return [];
        return [{ ...felter, userId }];
      }),
    });
  }
  console.log(`  ${achievements.length} achievements`);

  if (beacons.length > 0) {
    await convex.mutation(api.migrering.opretBeacons, {
      secret: secret!,
      raekker: beacons.flatMap((r) => {
        const { opretterFirestoreId, ...felter } = r;
        const createdBy = brugerMap[opretterFirestoreId];
        if (createdBy === undefined) return [];
        return [udenTomme({ ...felter, createdBy })];
      }),
    });
  }
  console.log(`  ${beacons.length} beacons`);

  console.log("[Migrering] 5/5 genberegner point og stræk fra logrækkerne …");
  const alleBrugerIds = Object.values(brugerMap);
  for (const portion of portioner(alleBrugerIds, 25)) {
    await convex.mutation(api.migrering.genberegnStats, {
      secret: secret!,
      userIds: portion,
    });
  }
  console.log(`  ${alleBrugerIds.length} brugere`);

  // --- Verifikation --------------------------------------------------------
  console.log("\n[Migrering] verificerer …");
  const status = await convex.query(api.migrering.status, { secret: secret! });
  console.log(`  rækker i Convex: ${JSON.stringify(status)}`);

  const døde = await convex.query(api.migrering.findBrudteReferencer, {
    secret: secret!,
  });
  const dødeIAlt = Object.values(døde).reduce((a, b) => a + b, 0);
  if (dødeIAlt === 0) {
    console.log("  ✓ ingen døde referencer");
  } else {
    console.error(`  ✗ døde referencer: ${JSON.stringify(døde)}`);
  }

  const stikprøve = brugere.find((b) => b.authId.length === 28);
  if (stikprøve !== undefined) {
    const fundet = await convex.query(api.migrering.findBrugerViaAuthId, {
      secret: secret!,
      authId: stikprøve.authId,
    });
    console.log(
      fundet !== null
        ? "  ✓ en migreret bruger kan slås op via authId"
        : "  ✗ opslag via authId fejlede",
    );
  }

  if (noter.length > 0) {
    console.log("\n[Migrering] husk:");
    for (const note of noter) console.log(`  • ${note}`);
  }

  console.log("\n[Migrering] færdig.");
}

main().catch((fejl) => {
  console.error(
    "\n[Migrering] fejlede:",
    fejl instanceof Error ? fejl.message : fejl,
  );
  process.exit(1);
});
