import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { evaluerAlleBeacons, type Evalueringsresultat } from "./beacons";
import { requireCurrentUser } from "./identity";

/**
 * Understøttelse af smoke-testen.
 *
 * Alt i denne fil deler den samme FIRE-lags spærre:
 * 1. Deploymentet skal udtrykkeligt tillade testfunktioner (se nedenfor).
 * 2. Kræver login — som alt andet.
 * 3. Virker KUN på den kaldende bruger selv; man kan ikke pege noget af det
 *    mod en anden konto.
 * 4. Kræver at brugerens email bærer smoke-test-præfikset.
 *
 * Lag 1 er nyt i fase 9. Indtil da var "kør den aldrig mod produktion" en
 * regel man skulle huske — og med et produktions-deployment ved siden af
 * dev er det for lidt. Nu er det deploymentet selv der bestemmer, og
 * produktion siger nej, uanset hvad man kommer til at pege scriptet mod.
 *
 * Filen bør stadig slettes sammen med convex/migrering.ts, når produktionen
 * er skiftet over.
 */

/** Præfiks som smoke-testens data SKAL bære for at kunne slettes. */
export const SMOKE_PREFIX = "smoke-test+";
export const SMOKE_KANAL_PREFIX = "SMOKE-";

/**
 * Deployment-variablen der åbner for denne fil. Sættes KUN på dev:
 *
 *   npx convex env set TILLAD_TESTFUNKTIONER ja
 *
 * Sættes den aldrig på produktion, er hele filen død kode dér.
 */
export const TESTFUNKTIONER_VARIABEL = "TILLAD_TESTFUNKTIONER";

/**
 * Læser en deployment-variabel uden at kræve node-typer.
 *
 * Samme grund som i convex/migrering.ts: filen indgår i `api`-modulgrafen,
 * som frontenden importerer, så den typechecker også i frontend-programmet —
 * og dér findes `process` ikke.
 */
function deploymentVariabel(navn: string): string | undefined {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return g.process?.env?.[navn];
}

function testfunktionerTilladt(): boolean {
  return deploymentVariabel(TESTFUNKTIONER_VARIABEL) === "ja";
}

/**
 * Kan smoke-testen køre mod dette deployment?
 *
 * Kaster bevidst ikke, og kræver bevidst ikke login: smoke-testen kalder den
 * som allerførste handling for at kunne stoppe med en forståelig besked FØR
 * den opretter noget som helst. Svaret er en enkelt boolean om deploymentet,
 * ikke om data.
 */
export const testmiljoStatus = query({
  args: {},
  handler: async (): Promise<{ tilladt: boolean }> => {
    return { tilladt: testfunktionerTilladt() };
  },
});

export const cleanupSmokeTest = mutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: Record<string, number> }> => {
    const user = await kraeverSmokeTestBruger(ctx);

    const deleted: Record<string, number> = {
      drinkLogs: 0,
      checkIns: 0,
      sladeshChallenges: 0,
      messages: 0,
      beacons: 0,
      achievements: 0,
      kanaler: 0,
      users: 0,
    };

    for (const raekke of await ctx.db
      .query("achievements")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()) {
      await ctx.db.delete(raekke._id);
      deleted.achievements++;
    }

    // Sladesh-udfordringer i begge retninger. Uden dette ville hver kørsel
    // efterlade rækker med referencer til en slettet bruger.
    for (const raekke of await ctx.db
      .query("sladeshChallenges")
      .withIndex("by_sender", (q) => q.eq("senderId", user._id))
      .collect()) {
      await ctx.db.delete(raekke._id);
      deleted.sladeshChallenges++;
    }
    for (const raekke of await ctx.db
      .query("sladeshChallenges")
      .withIndex("by_recipient", (q) => q.eq("recipientId", user._id))
      .collect()) {
      await ctx.db.delete(raekke._id);
      deleted.sladeshChallenges++;
    }

    for (const log of await ctx.db
      .query("drinkLogs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()) {
      await ctx.db.delete(log._id);
      deleted.drinkLogs++;
    }

    for (const row of await ctx.db
      .query("checkIns")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()) {
      await ctx.db.delete(row._id);
      deleted.checkIns++;
    }

    // Egne beskeder — også dem i Kanaler man ikke selv har oprettet.
    for (const besked of await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("senderId", user._id))
      .collect()) {
      await ctx.db.delete(besked._id);
      deleted.messages++;
    }

    // Egne beacons.
    for (const beacon of await ctx.db
      .query("beacons")
      .withIndex("by_user", (q) => q.eq("createdBy", user._id))
      .collect()) {
      await ctx.db.delete(beacon._id);
      deleted.beacons++;
    }

    // Kun Kanaler brugeren selv har oprettet, og kun med test-præfiks.
    for (const channelId of user.joinedChannelIds) {
      const kanal = await ctx.db.get(channelId);
      if (kanal === null) continue;
      if (kanal.createdBy !== user._id) continue;
      // `code` er valgfri i schemaet — en Kanal uden kode kan pr. definition
      // ikke være smoke-test-data, så den røres ikke.
      if (kanal.code === undefined) continue;
      if (!kanal.code.startsWith(SMOKE_KANAL_PREFIX)) continue;

      // Alt hvad der hænger på test-Kanalen ryddes med, uanset hvem der
      // skrev det. Ellers ville beskeder fra den anden testbruger blive
      // efterladt med en reference til en slettet Kanal.
      for (const besked of await ctx.db
        .query("messages")
        .withIndex("by_kanal_and_created_at", (q) => q.eq("channelId", kanal._id))
        .collect()) {
        await ctx.db.delete(besked._id);
        deleted.messages++;
      }
      for (const beacon of await ctx.db
        .query("beacons")
        .withIndex("by_kanal", (q) => q.eq("channelId", kanal._id))
        .collect()) {
        await ctx.db.delete(beacon._id);
        deleted.beacons++;
      }

      await ctx.db.delete(kanal._id);
      deleted.kanaler++;
    }

    await ctx.db.delete(user._id);
    deleted.users++;

    console.log("[Testing] smoke-test-data ryddet op", deleted);
    return { deleted };
  },
});

/**
 * Gør den kaldende smoke-test-bruger til admin.
 *
 * Beacons kan kun oprettes af admins, og en testkonto er ikke admin. Uden
 * dette kunne smoke-testen kun afprøve, at oprettelse bliver AFVIST — aldrig
 * at den virker, og aldrig hele evalueringen bagefter.
 *
 * Rettigheden er ufarlig i praksis: den kan kun gives til en konto hvis email
 * starter med "smoke-test+", kun til den kaldende bruger selv, og
 * `cleanupSmokeTest` sletter kontoen igen ved testens afslutning. Den samme
 * spærre lader i forvejen den samme bruger slette sig selv.
 */
export const setSmokeTestAdmin = mutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const user = await kraeverSmokeTestBruger(ctx);
    await ctx.db.patch(user._id, { isAdmin: true, updatedAt: Date.now() });
    console.log("[Testing] smoke-test-bruger gjort til admin", { userId: user._id });
  },
});

/**
 * Kører beacon-evalueringen med det samme, med et valgfrit `now`.
 *
 * Cron-jobbet kalder `internal.beacons.evaluerBeacons`, som pr. definition
 * ikke kan nås fra en klient — og at vente på næste 5-minutters kørsel ville
 * gøre smoke-testen både langsom og upålidelig. Denne indpakning kalder
 * nøjagtig den samme funktion, så det der afprøves ER produktionsstien.
 */
export const koerBeaconEvaluering = mutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Evalueringsresultat> => {
    await kraeverSmokeTestBruger(ctx);
    return await evaluerAlleBeacons(ctx, args.now ?? Date.now());
  },
});

/**
 * Den fælles spærre: rigtigt deployment, logget ind, sig selv, og en
 * smoke-test-email.
 */
async function kraeverSmokeTestBruger(ctx: MutationCtx): Promise<Doc<"users">> {
  // Deploymentet spørges FØRST. Er det ikke et testdeployment, skal svaret
  // være det samme uanset hvem der kalder — og uden at røre databasen.
  if (!testfunktionerTilladt()) {
    throw new ConvexError({
      code: "TESTFUNKTIONER_SLAAET_FRA",
      message:
        `Testfunktionerne er slået fra på dette deployment. De kræver ` +
        `${TESTFUNKTIONER_VARIABEL}=ja, som kun sættes på dev. ` +
        `Kører du mod produktion ved et uheld?`,
    });
  }

  const user = await requireCurrentUser(ctx);

  if (!user.email.startsWith(SMOKE_PREFIX)) {
    throw new ConvexError({
      code: "NOT_TEST_DATA",
      message:
        `Nægter at køre testfunktion for "${user.email}" — kun brugere med ` +
        `præfikset "${SMOKE_PREFIX}" må bruge convex/testing.ts.`,
    });
  }

  return user;
}
