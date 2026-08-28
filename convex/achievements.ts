import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  ACHIEVEMENTS,
  beregnFremdrift,
  beregnOplaasninger,
  findAchievement,
  naesteMilepael,
  NATTETIMER,
  type EksisterendeRaekke,
  type Fremdrift,
  type Maalinger,
} from "./achievementRules";
import { getDrinkDayStart, localWallClock } from "./constants";
import { beregnRunStart, byggAggregat, type LogLite } from "./drinkRules";
import { requireAdmin, requireCanViewUser, requireCurrentUser } from "./identity";

/**
 * Achievement-motoren.
 *
 * Reglerne bor i convex/achievementRules.ts; her hentes tallene fra
 * `drinkLogs`, og oplåsningerne skrives til tabellen `achievements`.
 *
 * Motoren kører SERVERSIDE i samme transaktion som logningen. I det gamle
 * repo lå den i en React-context, som kørte 300 ms efter at brugerdokumentet
 * havde ændret sig — havde man appen lukket, skete der ingenting, og to faner
 * kunne låse den samme achievement op to gange.
 */

/**
 * De kategorier der skal tælles op over hele livstiden.
 *
 * Udledt af definitionerne, så der kun laves de indeks-opslag der faktisk
 * bruges — i dag `wine` (Like Fine Wine) og `cocktail` (Feinschmecker) — i
 * stedet for at læse hver eneste logning brugeren nogensinde har lavet.
 */
const LIVSTIDS_KATEGORIER: readonly string[] = [
  ...new Set(
    ACHIEVEMENTS.filter(
      (def) => def.type === "total_drinks" || def.type === "specific_drink_count",
    )
      .map((def) => def.categoryId)
      .filter((kategori): kategori is string => kategori !== undefined),
  ),
];

/**
 * Sandt hvis en livstids-definition mangler kategori og derfor kræver ALLE
 * brugerens logninger. Ingen gør det i dag; tjekket står her, så en fremtidig
 * definition ikke stille og roligt får målt 0.
 */
const KRAEVER_FULD_LIVSTID = ACHIEVEMENTS.some(
  (def) =>
    (def.type === "total_drinks" || def.type === "specific_drink_count") &&
    def.categoryId === undefined,
);

/**
 * Henter alt motoren skal måle på.
 *
 * To indekserede opslag: runnets logninger via `by_user_and_timestamp`, og
 * livstidstallene via `by_user_and_category` for de få kategorier der bruges.
 */
export async function hentMaalinger(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  now: number,
): Promise<Maalinger> {
  const dayStart = getDrinkDayStart(now);

  // Hele drikkedagen hentes, fordi runnets start først kan udledes af
  // nulstillings-rækkerne i den.
  const dagensLogs = await ctx.db
    .query("drinkLogs")
    .withIndex("by_user_and_timestamp", (q) =>
      q.eq("userId", user._id).gte("timestamp", dayStart),
    )
    .collect();

  const runStart = beregnRunStart(dayStart, dagensLogs);
  const runLogs = dagensLogs.filter((log) => log.timestamp >= runStart);

  const livstidsLogs: LogLite[] = [];
  if (KRAEVER_FULD_LIVSTID) {
    livstidsLogs.push(
      ...(await ctx.db
        .query("drinkLogs")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()),
    );
  } else {
    for (const kategori of LIVSTIDS_KATEGORIER) {
      livstidsLogs.push(
        ...(await ctx.db
          .query("drinkLogs")
          .withIndex("by_user_and_category", (q) =>
            q.eq("userId", user._id).eq("categoryId", kategori),
          )
          .collect()),
      );
    }
  }

  // Nattetimerne tælles på RUNNETS logninger, ikke på livstiden. Et opslag
  // over hver logning brugeren nogensinde har lavet, for at afgøre om én af
  // dem faldt mellem fire og seks, ville koste hele historikken ved hver
  // eneste genstand — og achievementet er run-baseret netop for at slippe
  // for det.
  //
  // `localWallClock` og ikke `new Date(...).getHours()`: Convex kører i UTC,
  // og kl. 04 dansk tid er kl. 02 eller 03 UTC alt efter årstid. Samme
  // funktion som drikkedagens grænse bruger.
  const natteLogninger = runLogs.filter((log) => {
    if (log.isReset === true) return false;
    const time = localWallClock(log.timestamp).hour;
    return time >= NATTETIMER.fra && time < NATTETIMER.til;
  }).length;

  return {
    totalRunResets: user.totalRunResets ?? 0,
    runStart,
    run: byggAggregat(runLogs),
    livstid: byggAggregat(livstidsLogs),
    sladeshFejlet: user.sladeshFailedCount ?? 0,
    checkIns: user.checkInCount ?? 0,
    laengsteStime: user.longestStreak ?? 0,
    natteLogninger,
  };
}

/** Brugerens rækker, slået op på achievement-id. */
async function hentEksisterende(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<{
  raekker: Doc<"achievements">[];
  somKort: Record<string, EksisterendeRaekke>;
}> {
  const raekker = await ctx.db
    .query("achievements")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const somKort: Record<string, EksisterendeRaekke> = {};
  for (const raekke of raekker) {
    somKort[raekke.achievementId] = {
      count: raekke.count,
      lastRunStart: raekke.lastRunStart,
    };
  }

  return { raekker, somKort };
}

/**
 * Evaluerer og skriver nye oplåsninger for én bruger.
 *
 * Kaldes fra `logDrink` og `resetRun` i samme transaktion, så en oplåsning
 * enten lander sammen med den handling der udløste den, eller slet ikke.
 *
 * Returnerer id'erne på det der blev låst op — så klienten kan vise en
 * animation uden først at skulle gætte hvad der ændrede sig.
 */
export async function evaluerAchievements(
  ctx: MutationCtx,
  user: Doc<"users">,
  now: number,
): Promise<string[]> {
  const maal = await hentMaalinger(ctx, user, now);
  const { raekker, somKort } = await hentEksisterende(ctx, user._id);

  const oplaasninger = beregnOplaasninger(maal, somKort);
  if (oplaasninger.length === 0) return [];

  const efterId = new Map(raekker.map((r) => [r.achievementId, r]));

  for (const oplaasning of oplaasninger) {
    const eksisterende = efterId.get(oplaasning.achievementId);

    if (eksisterende === undefined) {
      await ctx.db.insert("achievements", {
        userId: user._id,
        achievementId: oplaasning.achievementId,
        count: oplaasning.nyCount,
        unlockedAt: now,
        firstUnlockedAt: now,
        lastUnlockedAt: now,
        lastRunStart: oplaasning.lastRunStart,
      });
      continue;
    }

    await ctx.db.patch(eksisterende._id, {
      count: oplaasning.nyCount,
      unlockedAt: now,
      // `firstUnlockedAt` røres aldrig igen. Migrerede rækker kan mangle den;
      // så sættes den nu, hvilket er det tætteste vi kan komme.
      firstUnlockedAt: eksisterende.firstUnlockedAt ?? now,
      lastUnlockedAt: now,
      ...(oplaasning.lastRunStart !== undefined
        ? { lastRunStart: oplaasning.lastRunStart }
        : {}),
    });
  }

  console.log("[Achievement] laast op", {
    userId: user._id,
    ids: oplaasninger.map((o) => o.achievementId),
  });

  return oplaasninger.map((o) => o.achievementId);
}

/** Alle definitioner. Kræver login, men ikke andet — de er ens for alle. */
export const getDefinitions = query({
  args: {},
  handler: async (ctx) => {
    await requireCurrentUser(ctx);
    return ACHIEVEMENTS;
  },
});

export type AchievementVisning = {
  achievementId: string;
  title: string;
  description: string;
  howToGet: string;
  image: string;
  emoji?: string;
  repeatable: boolean;
  /** Manuelle achievements har ingen automatisk fremdrift. */
  manual: boolean;
  count: number;
  unlocked: boolean;
  firstUnlockedAt?: number;
  lastUnlockedAt?: number;
  current?: number;
  threshold?: number;
  percentage?: number;
};

/**
 * Definitioner + brugerens tilstand + fremdrift i ét svar.
 *
 * Uden `userId` gælder det en selv. Med `userId` kræves det, at man deler
 * mindst én Kanal — samme regel som resten af appen.
 */
export const getAchievementsForUser = query({
  args: { userId: v.optional(v.id("users")), now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<AchievementVisning[]> => {
    const viewer = await requireCurrentUser(ctx);
    const target =
      args.userId === undefined || args.userId === viewer._id
        ? viewer
        : (await requireCanViewUser(ctx, args.userId)).target;

    const now = args.now ?? Date.now();
    const maal = await hentMaalinger(ctx, target, now);
    const { raekker, somKort } = await hentEksisterende(ctx, target._id);

    const fremdriftEfterId = new Map<string, Fremdrift>(
      beregnFremdrift(maal, somKort).map((f) => [f.achievementId, f]),
    );
    const raekkeEfterId = new Map(raekker.map((r) => [r.achievementId, r]));

    return ACHIEVEMENTS.map((def) => {
      const raekke = raekkeEfterId.get(def.id);
      const fremdrift = fremdriftEfterId.get(def.id);

      return {
        achievementId: def.id,
        title: def.title,
        description: def.description,
        howToGet: def.howToGet,
        image: def.image,
        emoji: def.emoji,
        repeatable: def.repeatable === true,
        manual: def.type === "manual",
        count: raekke?.count ?? 0,
        unlocked: (raekke?.count ?? 0) > 0,
        firstUnlockedAt: raekke?.firstUnlockedAt,
        lastUnlockedAt: raekke?.lastUnlockedAt,
        current: fremdrift?.current,
        threshold: fremdrift?.threshold,
        percentage: fremdrift?.percentage,
      };
    });
  },
});

/** Den achievement den indloggede bruger er tættest på. */
export const getNaesteMilepael = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Fremdrift | null> => {
    const user = await requireCurrentUser(ctx);
    const now = args.now ?? Date.now();

    const maal = await hentMaalinger(ctx, user, now);
    const { somKort } = await hentEksisterende(ctx, user._id);

    return naesteMilepael(maal, somKort) ?? null;
  },
});

/**
 * Tildeler en manuel achievement, fx "Top Donor".
 *
 * Kun admins. Manuelle achievements har pr. definition ingen målbar
 * betingelse — det er netop derfor de skal tildeles af et menneske.
 */
export const tildelManuelt = mutation({
  args: {
    userId: v.id("users"),
    achievementId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx);

    const def = findAchievement(args.achievementId);
    if (def === undefined) {
      throw new ConvexError({
        code: "UNKNOWN_ACHIEVEMENT",
        message: `Der findes ingen achievement med id'et "${args.achievementId}".`,
      });
    }

    if (def.type !== "manual") {
      throw new ConvexError({
        code: "NOT_MANUAL",
        message:
          `"${def.title}" låses op af motoren, ikke i hånden. ` +
          `Kun manuelle achievements kan tildeles.`,
      });
    }

    const modtager = await ctx.db.get(args.userId);
    if (modtager === null) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Brugeren findes ikke.",
      });
    }

    const now = Date.now();
    const eksisterende = await ctx.db
      .query("achievements")
      .withIndex("by_user_and_achievement", (q) =>
        q.eq("userId", args.userId).eq("achievementId", args.achievementId),
      )
      .unique();

    if (eksisterende === null) {
      await ctx.db.insert("achievements", {
        userId: args.userId,
        achievementId: args.achievementId,
        count: 1,
        unlockedAt: now,
        firstUnlockedAt: now,
        lastUnlockedAt: now,
      });
    } else if (def.repeatable === true) {
      await ctx.db.patch(eksisterende._id, {
        count: eksisterende.count + 1,
        unlockedAt: now,
        firstUnlockedAt: eksisterende.firstUnlockedAt ?? now,
        lastUnlockedAt: now,
      });
    } else {
      // Ikke-gentagelig og allerede tildelt — kaldet er et no-op frem for en
      // fejl, så en admin kan trykke to gange uden konsekvens.
      return;
    }

    console.log("[Achievement] tildelt manuelt", {
      userId: args.userId,
      achievementId: args.achievementId,
    });
  },
});

/**
 * Genberegner én brugers achievements fra bunden.
 *
 * Nyttig efter migreringen og efter ændringer i definitionerne. Kun admins,
 * og den kan kun tilføje — den fjerner aldrig noget en bruger allerede har
 * fået.
 */
export const genberegnForBruger = mutation({
  args: { userId: v.id("users"), now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<string[]> => {
    await requireAdmin(ctx);

    const bruger = await ctx.db.get(args.userId);
    if (bruger === null) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Brugeren findes ikke.",
      });
    }

    return await evaluerAchievements(ctx, bruger, args.now ?? Date.now());
  },
});

/**
 * Loftet for `genberegnForAlle`.
 *
 * Det er en PROXY, ikke den rigtige grænse. Den rigtige er Convex' budget
 * for én transaktion (16.384 læste dokumenter), og forbruget her afhænger af
 * hvor mange logninger brugerne har, ikke af hvor mange brugere der er: hver
 * bruger koster dagens logninger + livstidslogningerne i `wine` og
 * `cocktail` + sine achievement-rækker. I dag er det omkring hundrede
 * dokumenter per bruger, og med 32 brugere er der rigelig plads.
 *
 * Tallet står her, så kaldet fejler med en besked man kan handle på, frem
 * for med Convex' egen "too many reads" — den siger ikke hvad man skal gøre
 * i stedet. Vokser appen forbi det, er svaret ikke at hæve tallet, men at
 * lade kaldet tage en portion brugere ad gangen, som
 * `migrering.genberegnStats` gør med sin `userIds`.
 */
const GENBEREGN_ALLE_LOFT = 100;

/**
 * Genberegner ALLE brugeres achievements.
 *
 * Findes for at afvikle en pukkel i ét tryk. Den opstår, hver gang en regel
 * ændrer sig — og opstod for alvor ved migreringen, hvor den gamle app aldrig
 * havde kunnet tælle vin: alle bar rundt på oplåsninger, de havde optjent
 * uden at få. Uden den her ville hver af dem få puklen i hovedet som en
 * tilfældig popup, næste gang de loggede en øl.
 *
 * Den TILFØJER kun, præcis som `genberegnForBruger`: en achievement, en
 * bruger allerede har, mister de aldrig her. Derfor er den heller ikke
 * destruktiv og spørger ikke en ekstra gang.
 *
 * At den kører alle i ÉN transaktion er med vilje: enten er alle
 * genberegnet, eller også er ingen, og så kan man trykke igen uden at gætte
 * på hvor langt den nåede.
 */
export const genberegnForAlle = mutation({
  args: { now: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ brugere: number; opdaterede: number; oplaasninger: number }> => {
    await requireAdmin(ctx);

    const alle = await ctx.db.query("users").collect();

    if (alle.length > GENBEREGN_ALLE_LOFT) {
      throw new ConvexError({
        code: "FOR_MANGE_BRUGERE",
        message:
          `Der er ${alle.length} brugere, og genberegningen kører dem alle i ` +
          `én transaktion. Over ${GENBEREGN_ALLE_LOFT} er der risiko for at ` +
          `ramme Convex' læsegrænse midt i. Brug Genberegn på den enkelte ` +
          `bruger, eller del kaldet op.`,
      });
    }

    const now = args.now ?? Date.now();
    let opdaterede = 0;
    let oplaasninger = 0;

    for (const bruger of alle) {
      const nye = await evaluerAchievements(ctx, bruger, now);
      if (nye.length === 0) continue;
      opdaterede += 1;
      oplaasninger += nye.length;
    }

    console.log("[Achievement] genberegnet for alle", {
      brugere: alle.length,
      opdaterede,
      oplaasninger,
    });

    return { brugere: alle.length, opdaterede, oplaasninger };
  },
});
