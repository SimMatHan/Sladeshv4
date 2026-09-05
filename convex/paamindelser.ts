import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getDrinkDayStart } from "./constants";
import { erUdeIDag } from "./drinkRules";
import {
  erPaamindelsestid,
  paamindelsesNoegle,
  paamindelsesVarsling,
} from "./paamindelseRules";

/**
 * Fredags- og lørdagspåmindelsen.
 *
 * "Er du ude i aften? Husk at logge dine genstande." Kl. 20, kun til dem der
 * ikke allerede er i gang.
 *
 * ## Hvorfor jobbet kører HVER time
 *
 * Convex-crons regnes i UTC, og "fredag kl. 20 dansk tid" er 18:00 UTC om
 * sommeren og 19:00 UTC om vinteren. Et fast UTC-klokkeslæt ville derfor
 * ramme en time forkert det halve år — se kommentaren øverst i crons.ts, som
 * er grunden til at alle de andre job er `interval` uden klokkeslæt.
 *
 * I stedet kører jobbet 24 gange i døgnet på minut 0, og `erPaamindelsestid`
 * afgør, om denne time er den rigtige. De 22 kørsler, der ikke er det, koster
 * ét funktionskald og returnerer uden at røre databasen.
 *
 * ## Hvem den IKKE går til
 *
 * `erUdeIDag` er allerede appens ene definition af "med i aften" — den
 * afgør, hvem der står på stillingen, hvem der ses på kortet, og om aftenens
 * første genstand skal checke dig ind. Påmindelsen bruger den samme frem for
 * at spørge om logrækker for sig, netop for ikke at indføre en sjette,
 * lidt-anderledes grænse.
 *
 * Det betyder, at én gruppe også slipper: den, der har checket ind på kortet
 * uden at logge noget endnu. Det er med vilje. Hun sidder allerede i appen,
 * og en påmindelse om at bruge den ville være det stik modsatte af en
 * påmindelse.
 *
 * Brugere uden push-abonnement filtreres ikke fra her — `sendTilBrugere`
 * finder ingen abonnementer og springer dem over af sig selv. At slå det op
 * to gange ville ikke gøre noget bedre.
 */
export const mindOmAtLogge = internalMutation({
  args: {
    /** Kun til test. Uden den er det nu. */
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = args.now ?? Date.now();

    if (!erPaamindelsestid(now)) return;

    const noegle = paamindelsesNoegle(now);
    const dayStart = getDrinkDayStart(now);

    const brugere = await ctx.db.query("users").collect();

    const modtagere: Id<"users">[] = [];
    for (const bruger of brugere) {
      // Allerede varslet for denne drikkedag. Spærren mod at en genkørsel
      // inden for samme time sender påmindelsen igen.
      if (bruger.sidstePaamindelse === noegle) continue;

      // Allerede i gang. Det er hele pointen med påmindelsen, at den ikke
      // går til dem.
      if (erUdeIDag(bruger, dayStart)) continue;

      modtagere.push(bruger._id);
    }

    if (modtagere.length === 0) {
      console.log("[Paamindelse] ingen at minde", { noegle });
      return;
    }

    // Mærket skrives FØR afsendelsen planlægges.
    //
    // Rækkefølgen er ikke ligegyldig: en mutation er transaktionel, så
    // enten står alle mærkerne og beskeden er planlagt, eller ingen af
    // delene skete. Fejler noget efter det her punkt, ruller mærkerne med
    // tilbage, og næste kørsel prøver igen — hvilket er den rigtige vej at
    // fejle for en påmindelse.
    for (const brugerId of modtagere) {
      await ctx.db.patch(brugerId, { sidstePaamindelse: noegle });
    }

    const varsling = paamindelsesVarsling();

    // Planlagt frem for afventet, som alle andre push i appen: en mutation
    // kan ikke vente på en action, og mærkerne står uanset om telefonerne
    // kan nås.
    await ctx.scheduler.runAfter(0, internal.push.sendTilBrugere, {
      userIds: modtagere,
      title: varsling.titel,
      body: varsling.tekst,
      // Ét fælles tag. Der kommer højst én af dem per aften, og skulle to
      // alligevel nå frem, skal den anden erstatte den første frem for at
      // lægge sig oven på.
      tag: "paamindelse",
    });

    console.log("[Paamindelse] sendt", { noegle, antal: modtagere.length });
  },
});
