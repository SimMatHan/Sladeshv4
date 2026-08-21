import { v } from "convex/values";
import { query } from "./_generated/server";
import { getDrinkDayStart } from "./constants";
import { byggAggregat } from "./drinkRules";
import { requireAdmin } from "./identity";

/**
 * Aggregeret statistik til Admin → Oversigt.
 *
 * ## Der var intet at migrere
 *
 * Den gamle `AdminOverview.tsx` viste "24 brugere online", "156 drinks logget
 * i dag", "8 aktive kanaler" og "2.450 kr. i donationer". Alle fire tal stod
 * hårdkodet i klientkoden under kommentaren "Mock data - would come from
 * Firestore in production", sammen med tre opdigtede aktivitetslinjer. Der
 * findes altså ingen gammel forespørgsel at oversætte — kun fire etiketter,
 * der aldrig fik rigtige tal bag sig.
 *
 * Tallene her er de rigtige, og de er valgt, så de kan hentes billigt.
 *
 * ## Om omkostningen
 *
 * `users` og `kanaler` tælles med et fuldt scan. Det er få hundrede rækker,
 * og queryen kaldes kun, når en admin åbner fanen. `drinkLogs` er derimod
 * appens største tabel og scannes ALDRIG i fuld længde her — dagens logninger
 * hentes gennem `by_timestamp`, så vi kun rører den aktuelle drikkedag.
 */
export const getAdminStats = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const now = args.now ?? Date.now();
    const dayStart = getDrinkDayStart(now);

    const brugere = await ctx.db.query("users").collect();
    const kanaler = await ctx.db.query("kanaler").collect();

    // Kun den aktuelle drikkedag — indekseret, ikke et scan over hele
    // tabellen.
    const dagensLogs = await ctx.db
      .query("drinkLogs")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", dayStart))
      .collect();

    const donationer = await ctx.db.query("donations").collect();

    // Nulstillinger er markører, ikke genstande, og fortrydelser er negative
    // rækker. `byggAggregat` er den kanoniske sammentælling — scoreboardet og
    // achievement-motoren bruger den samme, så Oversigten ikke kan komme til
    // at vise et andet tal for "i dag", end stillingen gør.
    const rigtigeLogs = dagensLogs.filter((log) => log.isReset !== true);
    const aggregat = byggAggregat(dagensLogs);

    return {
      /** Brugere i alt. */
      brugere: brugere.length,
      /** Dem der er checket ind lige nu — det tætteste på "online". */
      checketInd: brugere.filter((bruger) => bruger.checkInStatus === true).length,
      /** Kanaler der ikke er arkiverede. */
      aktiveKanaler: kanaler.filter((kanal) => kanal.archived !== true).length,
      arkiveredeKanaler: kanaler.filter((kanal) => kanal.archived === true).length,
      /** Logninger i den aktuelle drikkedag, nulstillinger ikke medregnet. */
      logningerIDag: rigtigeLogs.length,
      /** Vægtede genstande i dag — samme tal som stillingen bruger. */
      genstandeIDag: aggregat.genstande,
      /** Hvor mange forskellige personer der har logget i dag. */
      aktiveBrugereIDag: new Set(rigtigeLogs.map((log) => log.userId)).size,
      /** Donationer i alt, i kroner. */
      donationerIAlt: donationer.reduce((sum, donation) => sum + donation.amount, 0),
      antalDonationer: donationer.length,
      /** Drikkedagens start, så visningen kan skrive hvad "i dag" betyder. */
      dayStart,
    };
  },
});
