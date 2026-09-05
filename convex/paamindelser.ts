import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getDrinkDayStart } from "./constants";
import { erUdeIDag } from "./drinkRules";
import {
  aktivitetsVarsling,
  beslutAktivitetsvarsling,
  erAktivitetstid,
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
      if (bruger.sidsteWeekendpaamindelse === noegle) continue;

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
      await ctx.db.patch(brugerId, { sidsteWeekendpaamindelse: noegle });
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

/**
 * Aktivitetspåmindelsen — "Log din næste drink".
 *
 * Spejlbilledet af `mindOmAtLogge`: den går til dem, der ER ude, hver time
 * fra 14 til 02. Den ene henter folk ind, den anden holder dem i gang, og
 * `erUdeIDag` er grænsen mellem dem — så ingen kan få begge på én aften.
 *
 * Fandtes i det gamle repo som `functions/src/scheduled/usageReminder.ts`
 * med `schedule: "0 14,15,…,2 * * *"` og modtagerkredsen
 * `where("checkInStatus", "==", true)`. (Filens egen kommentar dér siger
 * "every 2 hours"; cron-udtrykket ved siden af siger hver time, og det er
 * cron'en, der kører.)
 *
 * ## To spærrer, som den gamle ikke havde
 *
 * Tretten timer med en påmindelse i hver er ikke en påmindelse, det er en
 * alarm. De to spærrer i `beslutAktivitetsvarsling` rammer hver sin slags
 * bruger:
 *
 *   stilhedskravet   fritager den, der ER i gang — hun loggede for lidt
 *                    siden og skal ikke mindes om at gøre det, hun lige
 *                    har gjort
 *   loftet           fritager den, der er holdt op uden at checke ud, så
 *                    aftenen ikke ender med tretten pip
 *
 * Se `AKTIVITET_STILHED_MS` og `AKTIVITET_MAX_PER_AFTEN`.
 */
export const mindOmAktivitet = internalMutation({
  args: {
    /** Kun til test. Uden den er det nu. */
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = args.now ?? Date.now();

    if (!erAktivitetstid(now)) return;

    const dayStart = getDrinkDayStart(now);
    const brugere = await ctx.db.query("users").collect();

    const modtagere: { id: Id<"users">; brugt: number }[] = [];
    for (const bruger of brugere) {
      // Kun dem der er ude. Modsat `mindOmAtLogge`, som netop tager de andre.
      if (!erUdeIDag(bruger, dayStart)) continue;

      const beslutning = beslutAktivitetsvarsling({
        sidsteGenstandAt: bruger.lastDrinkAt,
        taeller: bruger.aktivitetspaamindelser,
        dayStart,
        now,
      });
      if (!beslutning.varsl) continue;

      const taeller = bruger.aktivitetspaamindelser;
      const brugt = taeller !== undefined && taeller.dag === dayStart ? taeller.antal : 0;
      modtagere.push({ id: bruger._id, brugt });
    }

    if (modtagere.length === 0) return;

    // Tælleren skrives FØR afsendelsen planlægges, af samme grund som
    // mærkerne i `mindOmAtLogge`: mutationen er transaktionel, så enten
    // står alle tællerne og beskeden er planlagt, eller ingen af delene
    // skete — og så prøver næste time igen.
    for (const modtager of modtagere) {
      await ctx.db.patch(modtager.id, {
        aktivitetspaamindelser: { dag: dayStart, antal: modtager.brugt + 1 },
      });
    }

    const varsling = aktivitetsVarsling();

    await ctx.scheduler.runAfter(0, internal.push.sendTilBrugere, {
      userIds: modtagere.map((modtager) => modtager.id),
      title: varsling.titel,
      body: varsling.tekst,
      // Ét fælles tag. Aftenens anden påmindelse skal ERSTATTE den første
      // på telefonen — to uåbnede kopier af "log din næste drink" siger
      // ikke mere end én.
      tag: "aktivitetspaamindelse",
    });

    console.log("[Paamindelse] aktivitet sendt", {
      dayStart,
      antal: modtagere.length,
    });
  },
});
