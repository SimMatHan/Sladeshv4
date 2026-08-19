import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { drikkedageBagud, getDrinkDayStart, isDrinkCategory } from "./constants";
import { requireKanalMedlem } from "./identity";

/**
 * Kanalens aktivitet, dag for dag.
 *
 * Hullet fra `docs/skaermkortlaegning.md` afsnit 4.3: `/channel-log` var den
 * ene skærm i den gamle app, backenden ikke havde en modpart til.
 *
 * Dagene er DRIKKEDAGE (kl. 10:00 → kl. 10:00), som alt andet i appen. En
 * aften der fortsætter til klokken tre hører til aftenen før, hvilket er
 * hele grunden til, at grænsen ikke ligger ved midnat.
 *
 * VIGTIGT om nulstillinger: historikken viser hele drikkedagen, ikke det
 * igangværende run. Nulstiller man sit run, forsvinder man fra stillingen —
 * men aftenen står stadig i historikken. Det er to forskellige spørgsmål:
 * "hvem fører lige nu" og "hvad skete der i tirsdags".
 */

/** Default og loft på hvor langt tilbage der kigges. */
const DAGE_STANDARD = 14;
const DAGE_MAKS = 60;

export type Historikdag = {
  /** Drikkedagens start i epoch ms — nøglen til `getKanalDag`. */
  dayStart: number;
  /** Vægtet antal genstande i Kanalen den dag. */
  genstande: number;
  /** Antal forskellige personer der loggede noget. */
  deltagere: number;
  /** Den der drak mest. `undefined` på en dag uden logninger. */
  topNavn?: string;
  topGenstande: number;
};

export const getKanalHistorik = query({
  args: {
    channelId: v.id("kanaler"),
    dage: v.optional(v.number()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Historikdag[]> => {
    const { kanal } = await requireKanalMedlem(ctx, args.channelId);

    const now = args.now ?? Date.now();
    const antal = Math.min(Math.max(args.dage ?? DAGE_STANDARD, 1), DAGE_MAKS);
    const dagsStarter = drikkedageBagud(now, antal);

    // Ét indekseret range-scan fra den ældste dags grænse og frem.
    const logs = await ctx.db
      .query("drinkLogs")
      .withIndex("by_kanal_and_timestamp", (q) =>
        q.eq("channelId", args.channelId).gte("timestamp", dagsStarter[0]),
      )
      .collect();

    // Tom ramme først, så dage uden aktivitet står med nul frem for at
    // mangle. En stille tirsdag er også information.
    const efterDag = new Map<
      number,
      { genstande: number; perBruger: Map<Id<"users">, { navn: string; antal: number }> }
    >();
    for (const dayStart of dagsStarter) {
      efterDag.set(dayStart, { genstande: 0, perBruger: new Map() });
    }

    for (const log of logs) {
      if (log.isReset === true) continue;
      if (!isDrinkCategory(log.categoryId)) continue;

      const dag = efterDag.get(getDrinkDayStart(log.timestamp));
      // Kan mangle for en logning, der ligger efter den nyeste grænse — det
      // sker kun, hvis `now` er sat kunstigt tilbage i en test.
      if (dag === undefined) continue;

      const vaegt = log.sizeMultiplier ?? 1;
      dag.genstande += vaegt;

      const kendt = dag.perBruger.get(log.userId);
      if (kendt === undefined) {
        dag.perBruger.set(log.userId, {
          // Navnet er snapshottet på logrækken, så historikken viser det navn
          // personen HAVDE den aften — ikke det, hun hedder i dag.
          navn: log.userDisplayName ?? "Ukendt",
          antal: vaegt,
        });
      } else {
        kendt.antal += vaegt;
      }
    }

    console.log("[Historik] beregnet", {
      kanal: kanal.name,
      dage: antal,
      logninger: logs.length,
    });

    return dagsStarter.map((dayStart) => {
      const dag = efterDag.get(dayStart)!;

      let topNavn: string | undefined;
      let topGenstande = 0;
      for (const bruger of dag.perBruger.values()) {
        if (bruger.antal > topGenstande) {
          topGenstande = bruger.antal;
          topNavn = bruger.navn;
        }
      }

      return {
        dayStart,
        genstande: rund(dag.genstande),
        deltagere: dag.perBruger.size,
        topNavn,
        topGenstande: rund(topGenstande),
      };
    });
  },
});

export type Historiklogning = {
  logId: Id<"drinkLogs">;
  userId: Id<"users">;
  navn: string;
  emoji?: string;
  categoryId: string;
  variationName: string;
  sizeLabel?: string;
  /** Negativ på en fortrydelse — samme regnestykke som alle andre steder. */
  vaegt: number;
  fortrudt: boolean;
  timestamp: number;
};

/**
 * Én dags logninger, nyeste først.
 *
 * Hentes først når man folder en dag ud. Havde `getKanalHistorik` returneret
 * alle rækker for alle dage, ville forsiden af historikken koste hele
 * månedens data at åbne.
 */
export const getKanalDag = query({
  args: {
    channelId: v.id("kanaler"),
    dayStart: v.number(),
  },
  handler: async (ctx, args): Promise<Historiklogning[]> => {
    await requireKanalMedlem(ctx, args.channelId);

    // Slutgrænsen udledes af starten, så kalderen ikke kan bede om et
    // vilkårligt stort vindue ved at sende to løse tidspunkter.
    const dagSlut = naesteDrikkedag(args.dayStart);

    const logs = await ctx.db
      .query("drinkLogs")
      .withIndex("by_kanal_and_timestamp", (q) =>
        q
          .eq("channelId", args.channelId)
          .gte("timestamp", args.dayStart)
          .lt("timestamp", dagSlut),
      )
      .collect();

    return logs
      .filter((log) => log.isReset !== true)
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((log) => ({
        logId: log._id,
        userId: log.userId,
        navn: log.userDisplayName ?? "Ukendt",
        emoji: log.userEmoji,
        categoryId: log.categoryId,
        variationName: log.variationName,
        sizeLabel: log.sizeLabel,
        vaegt: log.sizeMultiplier ?? 1,
        fortrudt: log.action === "remove",
        timestamp: log.timestamp,
      }));
  },
});

/**
 * Drikkedagen efter denne.
 *
 * Som `forrigeDrikkedag`, men fremad: 25 timer frem og tilbage til grænsen
 * rammer den næste dag uanset sommertid, hvor et fast døgn ville ramme
 * samme dag igen ved efterårsskiftet.
 */
function naesteDrikkedag(dayStart: number): number {
  return getDrinkDayStart(dayStart + 25 * 60 * 60 * 1000);
}

/** Undgår flydende-komma-støj som 3.0000000000000004. */
function rund(vaerdi: number): number {
  return Number(vaerdi.toFixed(2));
}
