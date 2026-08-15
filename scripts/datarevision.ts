/**
 * Datarevision — LÆSE-KUN gennemgang af produktions-Firestore.
 *
 * Svarer på: passer de virkelige data til convex/schema.ts, og kan de
 * eksisterende brugere logge ind efter en migrering?
 *
 * Skriver ingenting til Firestore. Skriver intet til Firebase Auth. Eneste
 * output er docs/datarevision.md.
 *
 * Kør:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolut/sti/til/noegle.json
 *   npm run datarevision
 *
 * Se docs/datarevision-setup.md for hvordan nøglen skaffes.
 *
 * PRIVATLIV: rapporten indeholder KUN aggregerede tal, feltnavne og
 * typenavne. Aldrig emails, navne, positioner, beskedtekst eller
 * dokument-id'er fra produktionen.
 */

import { writeFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import schema from "../convex/schema.ts";
import {
  kendteFelter,
  valider,
  type AnyValidator,
  type Undtagelser,
} from "./lib/validate.ts";

// ---------------------------------------------------------------------------
// Opsætning
// ---------------------------------------------------------------------------

const nøglesti = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projektId = process.env.FIREBASE_PROJECT_ID ?? "sladeshultimate-1";

if (!nøglesti) {
  console.error(
    "[Revision] GOOGLE_APPLICATION_CREDENTIALS mangler.\n" +
      "  Peg den på din service-account-nøgle:\n" +
      "    export GOOGLE_APPLICATION_CREDENTIALS=/absolut/sti/til/noegle.json\n" +
      "  Se docs/datarevision-setup.md.",
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: projektId });
const db = getFirestore();
const auth = getAuth();

// ---------------------------------------------------------------------------
// Hjælpere
// ---------------------------------------------------------------------------

type Tæller = Map<string, number>;

function tæl(map: Tæller, nøgle: string, antal = 1): void {
  map.set(nøgle, (map.get(nøgle) ?? 0) + antal);
}

function sorteret(map: Tæller): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function typeAf(værdi: unknown): string {
  if (værdi === null) return "null";
  if (Array.isArray(værdi)) return "array";
  if (værdi !== null && typeof værdi === "object") {
    // Firestore Timestamp og GeoPoint har genkendelige former.
    if ("toDate" in (værdi as object)) return "Timestamp";
    if ("latitude" in (værdi as object)) return "GeoPoint";
    return "object";
  }
  return typeof værdi;
}

const linjer: string[] = [];
function ud(linje = ""): void {
  linjer.push(linje);
}

/** Firestore Timestamp → epoch ms, så typetjekket matcher Convex' v.number(). */
function normalisér(værdi: unknown): unknown {
  if (værdi !== null && typeof værdi === "object") {
    const o = værdi as Record<string, unknown>;
    if (typeof o.toDate === "function") {
      return (o.toDate as () => Date)().getTime();
    }
    if (Array.isArray(værdi)) return værdi.map(normalisér);
    const ud: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) ud[k] = normalisér(v);
    return ud;
  }
  return værdi;
}

// ---------------------------------------------------------------------------
// Trin 2 — den kritiske antagelse
// ---------------------------------------------------------------------------

type AuthResultat = {
  authUids: Set<string>;
  udbyderPerUid: Map<string, string>;
  antalAuth: number;
};

async function læsAuthBrugere(): Promise<AuthResultat> {
  console.log("[Revision] læser Firebase Auth-brugere …");
  const authUids = new Set<string>();
  const udbyderPerUid = new Map<string, string>();

  let sideToken: string | undefined = undefined;
  do {
    const side = await auth.listUsers(1000, sideToken);
    for (const bruger of side.users) {
      authUids.add(bruger.uid);
      const udbydere = bruger.providerData.map((p) => p.providerId).sort();
      udbyderPerUid.set(bruger.uid, udbydere.join("+") || "ukendt");
    }
    sideToken = side.pageToken;
  } while (sideToken);

  console.log(`[Revision]   ${authUids.size} Auth-brugere`);
  return { authUids, udbyderPerUid, antalAuth: authUids.size };
}

async function trin2(auth: AuthResultat): Promise<Set<string>> {
  console.log("[Revision] sammenligner /users-dokument-id'er med Auth-UID'er …");
  const brugerDokIds = new Set<string>();

  const snap = await db.collection("users").select().get();
  for (const doc of snap.docs) brugerDokIds.add(doc.id);

  const matcher = [...brugerDokIds].filter((id) => auth.authUids.has(id));
  const kunFirestore = [...brugerDokIds].filter((id) => !auth.authUids.has(id));
  const kunAuth = [...auth.authUids].filter((id) => !brugerDokIds.has(id));

  const udbyderMatch: Tæller = new Map();
  for (const id of matcher) tæl(udbyderMatch, auth.udbyderPerUid.get(id) ?? "ukendt");
  const udbyderKunAuth: Tæller = new Map();
  for (const id of kunAuth) tæl(udbyderKunAuth, auth.udbyderPerUid.get(id) ?? "ukendt");

  ud("## 1. Den kritiske antagelse: `users.authId` = Firebase UID");
  ud();
  ud(
    "Convex-schemaet kobler `users.authId` til tokenets `sub`-claim, altså " +
      "Firebase UID. Migreringen forudsætter, at dokument-id'et i Firestores " +
      "`/users` ER dette UID. Ellers kan de eksisterende brugere ikke logge ind.",
  );
  ud();
  ud("| Måling | Antal |");
  ud("|---|---|");
  ud(`| Dokumenter i \`/users\` | ${brugerDokIds.size} |`);
  ud(`| Brugere i Firebase Auth | ${auth.antalAuth} |`);
  ud(`| **Dokument-id matcher et Auth-UID** | **${matcher.length}** |`);
  ud(`| Dokument uden tilsvarende Auth-bruger | ${kunFirestore.length} |`);
  ud(`| Auth-bruger uden Firestore-dokument | ${kunAuth.length} |`);
  ud();

  const andel =
    brugerDokIds.size === 0
      ? 0
      : Math.round((matcher.length / brugerDokIds.size) * 1000) / 10;

  if (kunFirestore.length === 0 && brugerDokIds.size > 0) {
    ud(
      `**Konklusion: antagelsen holder.** Alle ${brugerDokIds.size} ` +
        "brugerdokumenter har et dokument-id der svarer til et Firebase UID. " +
        "Migreringen kan sætte `authId` = dokument-id, og login vil matche " +
        "automatisk.",
    );
  } else {
    ud(
      `**Konklusion: antagelsen holder IKKE fuldt ud.** ${andel}% matcher ` +
        `(${matcher.length} af ${brugerDokIds.size}). ${kunFirestore.length} ` +
        "dokumenter har et id der ikke findes i Firebase Auth — de brugere " +
        "vil ikke kunne logge ind efter migreringen uden en manuel kobling.",
    );
  }
  ud();

  ud("Fordeling på login-metode:");
  ud();
  ud("| Login-metode | Matcher | Kun i Auth (ingen profil) |");
  ud("|---|---|---|");
  const alleUdbydere = new Set([...udbyderMatch.keys(), ...udbyderKunAuth.keys()]);
  for (const udbyder of [...alleUdbydere].sort()) {
    ud(
      `| \`${udbyder}\` | ${udbyderMatch.get(udbyder) ?? 0} | ${udbyderKunAuth.get(udbyder) ?? 0} |`,
    );
  }
  ud();
  if (kunAuth.length > 0) {
    ud(
      `De ${kunAuth.length} Auth-brugere uden Firestore-dokument er formentlig ` +
        "konti der aldrig fuldførte onboarding. De skal ikke migreres; de får " +
        "en profil første gang de logger ind i den nye app.",
    );
    ud();
  }

  return brugerDokIds;
}

// ---------------------------------------------------------------------------
// Trin 3 — validering mod schemaet
// ---------------------------------------------------------------------------

type Kilde = {
  /** Overskrift i rapporten. */
  navn: string;
  /** Convex-tabel hvis validator der valideres mod. */
  tabel: keyof typeof schema.tables;
  /** Firestore-sti. `gruppe: true` betyder collectionGroup. */
  sti: string;
  gruppe?: boolean;
  undtagelser?: Undtagelser;
};

/**
 * Felter Convex-schemaet kræver, men som ikke findes i Firestore-dataene,
 * fordi migreringen selv udfylder dem. De tælles ikke som overtrædelser —
 * men de er dokumenteret her, så det er synligt hvad migreringen skal sætte.
 */
const KILDER: Kilde[] = [
  {
    navn: "users",
    tabel: "users",
    sti: "users",
    undtagelser: {
      // authId sættes af migreringen = dokument-id. createdAt kan mangle på
      // gamle dokumenter. joinedChannelIds/-referencer er Firestore-id'er,
      // der først bliver Convex-id'er ved migreringen.
      ignorerManglende: ["authId"],
      ignorerType: [
        "activeChannelId",
        "favoriteChannelId",
        "joinedChannelIds",
        "joinedChannelIds[]",
      ],
    },
  },
  {
    navn: "kanaler (Firestore: channels)",
    tabel: "kanaler",
    sti: "channels",
    undtagelser: { ignorerType: ["members", "members[]", "createdBy"] },
  },
  {
    navn: "messages (channels/*/messages)",
    tabel: "messages",
    sti: "messages",
    gruppe: true,
    undtagelser: {
      // channelId findes ikke i beskeddokumentet — det ligger i stien.
      ignorerManglende: ["channelId"],
      ignorerType: ["channelId", "senderId"],
    },
  },
  {
    navn: "checkIns (users/*/checkIns)",
    tabel: "checkIns",
    sti: "checkIns",
    gruppe: true,
    undtagelser: {
      ignorerManglende: ["userId"],
      ignorerType: ["userId", "channelId"],
    },
  },
  {
    navn: "drinkLogs (users/*/drinkLogs)",
    tabel: "drinkLogs",
    sti: "drinkLogs",
    gruppe: true,
    undtagelser: {
      ignorerManglende: ["userId"],
      ignorerType: ["userId", "channelId"],
    },
  },
  {
    navn: "sladeshChallenges",
    tabel: "sladeshChallenges",
    sti: "sladeshChallenges",
    undtagelser: {
      ignorerType: [
        "senderId",
        "recipientId",
        "channelId",
        "proofBeforeImage",
        "proofAfterImage",
      ],
    },
  },
  {
    navn: "beacons (Firestore: stressBeacons)",
    tabel: "beacons",
    sti: "stressBeacons",
    undtagelser: { ignorerType: ["createdBy", "channelId"] },
  },
];

type KildeResultat = {
  navn: string;
  antal: number;
  feltDækning: Tæller;
  feltTyper: Map<string, Tæller>;
  overtrædelser: Tæller;
  dokumenterMedFejl: number;
  ukendteFelter: Tæller;
};

async function trin3(): Promise<KildeResultat[]> {
  const resultater: KildeResultat[] = [];

  for (const kilde of KILDER) {
    console.log(`[Revision] gennemgår ${kilde.navn} …`);

    const validator = (schema.tables[kilde.tabel] as { validator: AnyValidator })
      .validator;
    const kendte = kendteFelter(validator);

    const feltDækning: Tæller = new Map();
    const feltTyper = new Map<string, Tæller>();
    const overtrædelser: Tæller = new Map();
    const ukendteFelter: Tæller = new Map();
    let antal = 0;
    let dokumenterMedFejl = 0;

    const query = kilde.gruppe
      ? db.collectionGroup(kilde.sti)
      : db.collection(kilde.sti);

    // Sideinddelt, så store collections ikke skal ligge i hukommelsen på én gang.
    let sidste: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let side = query.orderBy("__name__").limit(500);
      if (sidste !== undefined) side = side.startAfter(sidste);
      const snap = await side.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        antal++;
        const rå = doc.data() as Record<string, unknown>;

        for (const [felt, værdi] of Object.entries(rå)) {
          tæl(feltDækning, felt);
          if (!feltTyper.has(felt)) feltTyper.set(felt, new Map());
          tæl(feltTyper.get(felt)!, typeAf(værdi));
          if (!kendte.has(felt)) tæl(ukendteFelter, felt);
        }

        const fejl = valider(
          normalisér(rå) as Record<string, unknown>,
          validator,
          kilde.undtagelser ?? {},
        );
        if (fejl.length > 0) dokumenterMedFejl++;
        for (const f of fejl) tæl(overtrædelser, `\`${f.sti}\` — ${f.årsag}`);
      }

      sidste = snap.docs[snap.docs.length - 1];
      if (snap.size < 500) break;
    }

    console.log(`[Revision]   ${antal} dokumenter, ${dokumenterMedFejl} med afvigelser`);
    resultater.push({
      navn: kilde.navn,
      antal,
      feltDækning,
      feltTyper,
      overtrædelser,
      dokumenterMedFejl,
      ukendteFelter,
    });
  }

  ud("## 2. Collections målt mod Convex-schemaet");
  ud();
  ud("| Collection | Dokumenter | Med afvigelser | Ukendte felter |");
  ud("|---|---|---|---|");
  for (const r of resultater) {
    ud(
      `| ${r.navn} | ${r.antal} | ${r.dokumenterMedFejl} | ${r.ukendteFelter.size} |`,
    );
  }
  ud();

  for (const r of resultater) {
    ud(`### ${r.navn}`);
    ud();
    if (r.antal === 0) {
      ud("Ingen dokumenter.");
      ud();
      continue;
    }

    ud(`${r.antal} dokumenter. ${r.dokumenterMedFejl} har mindst én afvigelse.`);
    ud();

    ud("**Feltdækning** — hvor mange dokumenter har feltet, og med hvilke typer:");
    ud();
    ud("| Felt | Til stede | Andel | Typer |");
    ud("|---|---|---|---|");
    for (const [felt, n] of sorteret(r.feltDækning)) {
      const typer = sorteret(r.feltTyper.get(felt)!)
        .map(([t, c]) => `${t} (${c})`)
        .join(", ");
      const andel = Math.round((n / r.antal) * 1000) / 10;
      const ukendt = r.ukendteFelter.has(felt) ? " ⚠️" : "";
      ud(`| \`${felt}\`${ukendt} | ${n} | ${andel}% | ${typer} |`);
    }
    ud();

    if (r.ukendteFelter.size > 0) {
      ud(
        `⚠️ = felt findes i dataene men ikke i Convex-schemaet (${r.ukendteFelter.size} stk.). ` +
          "Enten skal schemaet udvides, eller også er feltet dødt og kan droppes ved migrering.",
      );
      ud();
    }

    if (r.overtrædelser.size === 0) {
      ud("**Ingen dokumenter ville blive afvist af Convex-validatorerne.**");
    } else {
      ud("**Afvigelser der ville få Convex til at afvise dokumentet:**");
      ud();
      ud("| Problem | Antal dokumenter |");
      ud("|---|---|");
      for (const [problem, n] of sorteret(r.overtrædelser)) {
        ud(`| ${problem} | ${n} |`);
      }
    }
    ud();
  }

  return resultater;
}

// ---------------------------------------------------------------------------
// Trin 4 — referentiel integritet
// ---------------------------------------------------------------------------

async function trin4(brugerDokIds: Set<string>): Promise<void> {
  console.log("[Revision] tjekker referentiel integritet …");

  const kanalIds = new Set<string>();
  const kanalMedlemmer = new Map<string, Set<string>>();
  const kanalSnap = await db.collection("channels").get();
  for (const doc of kanalSnap.docs) {
    kanalIds.add(doc.id);
    const data = doc.data() as { members?: unknown };
    const medlemmer = Array.isArray(data.members)
      ? new Set(data.members.filter((m): m is string => typeof m === "string"))
      : new Set<string>();
    kanalMedlemmer.set(doc.id, medlemmer);
  }

  let døddeAktive = 0;
  let døddeFavorit = 0;
  let døddeJoined = 0;
  let uenigBrugerSideJoin = 0;
  let uenigKanalSideMedlem = 0;
  const brugerJoined = new Map<string, Set<string>>();

  const brugerSnap = await db.collection("users").get();
  for (const doc of brugerSnap.docs) {
    const d = doc.data() as {
      activeChannelId?: unknown;
      favoriteChannelId?: unknown;
      joinedChannelIds?: unknown;
    };
    if (typeof d.activeChannelId === "string" && !kanalIds.has(d.activeChannelId)) {
      døddeAktive++;
    }
    if (typeof d.favoriteChannelId === "string" && !kanalIds.has(d.favoriteChannelId)) {
      døddeFavorit++;
    }
    const joined = Array.isArray(d.joinedChannelIds)
      ? d.joinedChannelIds.filter((c): c is string => typeof c === "string")
      : [];
    brugerJoined.set(doc.id, new Set(joined));
    for (const kanalId of joined) {
      if (!kanalIds.has(kanalId)) døddeJoined++;
      else if (!kanalMedlemmer.get(kanalId)!.has(doc.id)) uenigBrugerSideJoin++;
    }
  }

  for (const [kanalId, medlemmer] of kanalMedlemmer) {
    for (const brugerId of medlemmer) {
      if (!brugerJoined.get(brugerId)?.has(kanalId)) uenigKanalSideMedlem++;
    }
  }

  // Subcollection-referencer.
  const døde = { drinkLogs: 0, checkIns: 0 };
  const forældreløse = { drinkLogs: 0, checkIns: 0, messages: 0 };

  for (const gruppe of ["drinkLogs", "checkIns"] as const) {
    const snap = await db.collectionGroup(gruppe).get();
    for (const doc of snap.docs) {
      const d = doc.data() as { channelId?: unknown };
      if (typeof d.channelId === "string" && !kanalIds.has(d.channelId)) {
        døde[gruppe]++;
      }
      // Forælderen er users/{uid}/<gruppe>/{id} → doc.ref.parent.parent
      const ejer = doc.ref.parent.parent?.id;
      if (ejer === undefined || !brugerDokIds.has(ejer)) forældreløse[gruppe]++;
    }
  }

  const beskedSnap = await db.collectionGroup("messages").get();
  for (const doc of beskedSnap.docs) {
    const kanal = doc.ref.parent.parent?.id;
    if (kanal === undefined || !kanalIds.has(kanal)) forældreløse.messages++;
  }

  ud("## 3. Referentiel integritet");
  ud();
  ud(
    "Convex håndhæver `v.id(\"kanaler\")` som en rigtig reference. Peger et " +
      "felt på en kanal der ikke findes, kan rækken ikke indsættes — den skal " +
      "renses eller nulstilles under migreringen.",
  );
  ud();
  ud("| Kontrol | Antal |");
  ud("|---|---|");
  ud(`| Kanaler i alt | ${kanalIds.size} |`);
  ud(`| \`activeChannelId\` peger på en slettet kanal | ${døddeAktive} |`);
  ud(`| \`favoriteChannelId\` peger på en slettet kanal | ${døddeFavorit} |`);
  ud(`| \`joinedChannelIds\`-poster mod slettede kanaler | ${døddeJoined} |`);
  ud(`| \`drinkLogs.channelId\` mod slettede kanaler | ${døde.drinkLogs} |`);
  ud(`| \`checkIns.channelId\` mod slettede kanaler | ${døde.checkIns} |`);
  ud(`| Bruger mener sig medlem, kanal er uenig | ${uenigBrugerSideJoin} |`);
  ud(`| Kanal mener bruger er medlem, bruger er uenig | ${uenigKanalSideMedlem} |`);
  ud(`| Forældreløse \`drinkLogs\` (ejer findes ikke) | ${forældreløse.drinkLogs} |`);
  ud(`| Forældreløse \`checkIns\` | ${forældreløse.checkIns} |`);
  ud(`| Forældreløse \`messages\` (kanal findes ikke) | ${forældreløse.messages} |`);
  ud();

  const totalUenighed = uenigBrugerSideJoin + uenigKanalSideMedlem;
  if (totalUenighed > 0) {
    ud(
      `De to sider af medlemskabet er uenige i ${totalUenighed} tilfælde. ` +
        "I det nye system skrives begge sider i samme transaktion, så det kan " +
        "ikke opstå igen — men migreringen skal vælge en vinder. Forslag: " +
        "foreningen af de to, så ingen mister adgang til en Kanal.",
    );
    ud();
  }
}

// ---------------------------------------------------------------------------
// Trin 5 — konsekvens af fjernede/ændrede felter
// ---------------------------------------------------------------------------

async function trin5(): Promise<void> {
  console.log("[Revision] vurderer fjernede og ændrede felter …");

  // Tællere på brugeren vs. faktiske drinkLogs.
  const logsPerBruger = new Map<string, number>();
  const vægtetPerBruger = new Map<string, number>();
  const logSnap = await db.collectionGroup("drinkLogs").get();
  let logsIAlt = 0;
  for (const doc of logSnap.docs) {
    const ejer = doc.ref.parent.parent?.id;
    if (ejer === undefined) continue;
    const d = doc.data() as { isReset?: unknown; sizeMultiplier?: unknown };
    logsIAlt++;
    if (d.isReset === true) continue;
    logsPerBruger.set(ejer, (logsPerBruger.get(ejer) ?? 0) + 1);
    const vægt = typeof d.sizeMultiplier === "number" ? d.sizeMultiplier : 1;
    vægtetPerBruger.set(ejer, (vægtetPerBruger.get(ejer) ?? 0) + vægt);
  }

  let enige = 0;
  let uenige = 0;
  let størsteAfvigelse = 0;
  let samletAfvigelse = 0;
  let achievementRækker = 0;
  let brugereMedAchievements = 0;
  let currentStreakIkkeNul = 0;
  let totalPointsIkkeNul = 0;
  let brugereIAlt = 0;

  const brugerSnap = await db.collection("users").get();
  for (const doc of brugerSnap.docs) {
    brugereIAlt++;
    const d = doc.data() as {
      totalDrinks?: unknown;
      achievements?: unknown;
      stats?: { currentStreak?: unknown; totalPoints?: unknown };
    };

    const påstået = typeof d.totalDrinks === "number" ? d.totalDrinks : 0;
    const faktisk = vægtetPerBruger.get(doc.id) ?? 0;
    const afvigelse = Math.abs(påstået - faktisk);
    if (afvigelse < 0.01) enige++;
    else {
      uenige++;
      samletAfvigelse += afvigelse;
      størsteAfvigelse = Math.max(størsteAfvigelse, afvigelse);
    }

    if (d.achievements !== null && typeof d.achievements === "object") {
      const antal = Object.keys(d.achievements as object).length;
      if (antal > 0) {
        brugereMedAchievements++;
        achievementRækker += antal;
      }
    }

    if (typeof d.stats?.currentStreak === "number" && d.stats.currentStreak !== 0) {
      currentStreakIkkeNul++;
    }
    if (typeof d.stats?.totalPoints === "number" && d.stats.totalPoints !== 0) {
      totalPointsIkkeNul++;
    }
  }

  // Sladesh-bevisbilleder.
  let medFør = 0;
  let medEfter = 0;
  let base64Bytes = 0;
  const sladeshSnap = await db.collection("sladeshChallenges").get();
  for (const doc of sladeshSnap.docs) {
    const d = doc.data() as { proofBeforeImage?: unknown; proofAfterImage?: unknown };
    if (typeof d.proofBeforeImage === "string") {
      medFør++;
      base64Bytes += d.proofBeforeImage.length;
    }
    if (typeof d.proofAfterImage === "string") {
      medEfter++;
      base64Bytes += d.proofAfterImage.length;
    }
  }

  ud("## 4. Konsekvens af fase 1-3's schemaændringer");
  ud();

  ud("### Fjernede tællere vs. faktiske logrækker");
  ud();
  ud(
    "`totalDrinks`, `currentRunDrinkCount`, `drinkTypes`, `drinkVariations` og " +
      "`allTimeDrinkVariations` er fjernet fra schemaet; de skal genberegnes " +
      "fra `drinkLogs`. Hvis de gamle tællere allerede er drevet fra " +
      "logrækkerne, er det et argument FOR beslutningen — men tallene på " +
      "brugernes profiler vil ændre sig ved migreringen.",
  );
  ud();
  ud("| Måling | Antal |");
  ud("|---|---|");
  ud(`| Brugere i alt | ${brugereIAlt} |`);
  ud(`| \`drinkLogs\` i alt | ${logsIAlt} |`);
  ud(`| Brugere hvor \`totalDrinks\` = summen af logrækker | ${enige} |`);
  ud(`| Brugere hvor de er drevet fra hinanden | ${uenige} |`);
  ud(
    `| Største afvigelse for én bruger | ${Math.round(størsteAfvigelse * 100) / 100} |`,
  );
  ud(
    `| Gennemsnitlig afvigelse blandt de uenige | ${uenige === 0 ? 0 : Math.round((samletAfvigelse / uenige) * 100) / 100} |`,
  );
  ud();

  ud("### Achievements: map → rækker");
  ud();
  ud("| Måling | Antal |");
  ud("|---|---|");
  ud(`| Brugere med mindst ét achievement | ${brugereMedAchievements} |`);
  ud(`| Rækker i den nye \`achievements\`-tabel | ${achievementRækker} |`);
  ud();

  ud("### Sladesh-bevisbilleder: base64 → Convex storage");
  ud();
  ud("| Måling | Antal |");
  ud("|---|---|");
  ud(`| Udfordringer i alt | ${sladeshSnap.size} |`);
  ud(`| Med \`proofBeforeImage\` | ${medFør} |`);
  ud(`| Med \`proofAfterImage\` | ${medEfter} |`);
  ud(
    `| Samlet base64-størrelse | ${(base64Bytes / 1024 / 1024).toFixed(1)} MB |`,
  );
  ud();
  ud(
    "Billederne skal uploades til Convex storage og felterne erstattes med " +
      "storage-id'er. Det er migreringens eneste trin der kræver netværk per " +
      "dokument frem for en ren transformation.",
  );
  ud();

  ud("### `currentStreak` og `totalPoints` var altid 0");
  ud();
  ud("| Måling | Antal |");
  ud("|---|---|");
  ud(`| Brugere med \`stats.currentStreak\` ≠ 0 | ${currentStreakIkkeNul} |`);
  ud(`| Brugere med \`stats.totalPoints\` ≠ 0 | ${totalPointsIkkeNul} |`);
  ud();
  if (currentStreakIkkeNul === 0 && totalPointsIkkeNul === 0) {
    ud(
      "Bekræftet: begge felter er 0 for alle brugere, præcis som kodelæsningen " +
        "sagde. Beslutningen om at fjerne `currentStreak` og indføre et nyt " +
        "pointbegreb kaster ingen data væk.",
    );
  } else {
    ud(
      "**Uventet:** felterne er ikke 0 for alle brugere. Kodelæsningen i fase 2 " +
        "fandt ingen skrivninger til dem — der findes altså en kilde vi ikke " +
        "har set. Undersøg før migreringen.",
    );
  }
  ud();
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[Revision] LÆSE-KUN gennemgang af projektet ${projektId}`);
  console.log("[Revision] der skrives intet til Firestore eller Firebase Auth\n");

  const start = Date.now();

  ud("# Datarevision");
  ud();
  ud(
    `Automatisk genereret af \`npm run datarevision\` — ret ikke i hånden.\n` +
      `Kørt mod Firebase-projektet \`${projektId}\`.`,
  );
  ud();
  ud(
    "Revisionen er læse-kun og svarer på ét spørgsmål: passer " +
      "produktionsdataene til `convex/schema.ts`, og kan de eksisterende " +
      "brugere logge ind efter en migrering?",
  );
  ud();
  ud(
    "Validering sker mod validatorerne i `convex/schema.ts` læst på runtime — " +
      "ikke mod en håndskrevet kopi, som ville kunne drive fra schemaet.",
  );
  ud();
  ud(
    "Rapporten indeholder kun aggregerede tal, feltnavne og typenavne. " +
      "Ingen emails, navne, positioner, beskedtekst eller dokument-id'er.",
  );
  ud();
  ud("---");
  ud();

  const authData = await læsAuthBrugere();
  const brugerDokIds = await trin2(authData);
  await trin3();
  await trin4(brugerDokIds);
  await trin5();

  ud("---");
  ud();
  ud("## 5. Hvad revisionen kalder på");
  ud();
  ud(
    "Udfyldes ud fra tallene ovenfor. Tommelfingerregler: en afvigelse der " +
      "rammer få dokumenter renses i migreringen; en der rammer de fleste, " +
      "peger på at schemaet er forkert.",
  );
  ud();

  writeFileSync("docs/datarevision.md", linjer.join("\n") + "\n", "utf8");

  const sekunder = Math.round((Date.now() - start) / 100) / 10;
  console.log(`\n[Revision] færdig på ${sekunder}s → docs/datarevision.md`);
}

main().catch((fejl) => {
  // Fejlobjektet kan indeholde stien til nøglefilen, men aldrig dens indhold.
  console.error("\n[Revision] fejlede:", fejl instanceof Error ? fejl.message : fejl);
  process.exit(1);
});
