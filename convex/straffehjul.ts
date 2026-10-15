import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireCurrentUser } from "./identity";
import {
  MAX_AKTIVE_FELTER,
  STANDARDFELTER,
  harPladsTilAktivt,
  rensEmoji,
  rensTekst,
  type Afslag,
} from "./straffehjulRules";

/**
 * Straffehjulet — felterne, hjulet kan lande på.
 *
 * Felterne er globale og ejes af admins, præcis som drikkekataloget i
 * drinkVariations.ts. Alle, der er logget ind, kan LÆSE de aktive; kun
 * admins kan se de inaktive og ændre noget.
 *
 * ## Hjulet drejes i klienten
 *
 * Der er ingen mutation for selve drejet. Resultatet gemmes ikke, tæller
 * ikke på stillingen og låser intet op — det er en leg ved bordet, og en
 * server-rundtur ville kun gøre den langsommere på dårligt net. Skal
 * resultatet en dag i chatten eller historikken, er det her, en `drej`
 * kommer til at bo.
 */

/** Felterne på hjulet, i den rækkefølge de blev oprettet. */
export const getFelter = query({
  args: {},
  handler: async (ctx): Promise<Doc<"hjulfelter">[]> => {
    await requireCurrentUser(ctx);

    // Rækkefølgen er `_creationTime`, som indexet slutter på — så et nyt felt
    // lander sidst på hjulet frem for at skubbe de andre rundt.
    return await ctx.db
      .query("hjulfelter")
      .withIndex("by_aktiv", (q) => q.eq("aktiv", true))
      .take(MAX_AKTIVE_FELTER);
  },
});

/** Alle felter, også de slukkede. Kun til Admin. */
export const getAlleFelter = query({
  args: {},
  handler: async (ctx): Promise<Doc<"hjulfelter">[]> => {
    await requireAdmin(ctx);
    return await ctx.db.query("hjulfelter").collect();
  },
});

export const opretFelt = mutation({
  args: {
    tekst: v.string(),
    emoji: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"hjulfelter">> => {
    const admin = await requireAdmin(ctx);

    const tekst = kraever(rensTekst(args.tekst)).tekst;
    const emoji = kraever(rensEmoji(args.emoji)).emoji;
    await kraeverPladsTilAktivt(ctx);

    const now = Date.now();
    const feltId = await ctx.db.insert("hjulfelter", {
      tekst,
      emoji,
      aktiv: true,
      oprettetAf: admin._id,
      createdAt: now,
      updatedAt: now,
    });

    console.log("[Straffehjul] felt oprettet", { feltId });
    return feltId;
  },
});

/**
 * Retter et felt. Udeladte felter røres ikke; `emoji: null` rydder emojien.
 */
export const opdaterFelt = mutation({
  args: {
    feltId: v.id("hjulfelter"),
    tekst: v.optional(v.string()),
    emoji: v.optional(v.union(v.string(), v.null())),
    aktiv: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx);

    const felt = await ctx.db.get(args.feltId);
    if (felt === null) {
      throw new ConvexError({
        code: "FIELD_NOT_FOUND",
        message: "Feltet findes ikke.",
      });
    }

    const tekst =
      args.tekst === undefined ? felt.tekst : kraever(rensTekst(args.tekst)).tekst;
    const emoji =
      args.emoji === undefined
        ? felt.emoji
        : kraever(rensEmoji(args.emoji ?? undefined)).emoji;

    // Kun et felt, der GÅR fra slukket til tændt, kan sprænge loftet.
    if (args.aktiv === true && !felt.aktiv) await kraeverPladsTilAktivt(ctx);

    await ctx.db.patch(args.feltId, {
      tekst,
      emoji,
      aktiv: args.aktiv ?? felt.aktiv,
      updatedAt: Date.now(),
    });

    console.log("[Straffehjul] felt rettet", { feltId: args.feltId });
  },
});

/** Sletter et felt for altid. Skal det bare holde pause, så sluk det. */
export const sletFelt = mutation({
  args: { feltId: v.id("hjulfelter") },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx);

    // Idempotent: et allerede slettet felt er ikke en fejl.
    if ((await ctx.db.get(args.feltId)) === null) return;

    await ctx.db.delete(args.feltId);
    console.log("[Straffehjul] felt slettet", { feltId: args.feltId });
  },
});

/**
 * Fylder et TOMT hjul med pladsholderne fra straffehjulRules.ts.
 *
 * Kun når der ingen felter er overhovedet — heller ikke slukkede. Ellers
 * ville et dobbelttryk, eller en admin der havde glemt dem, give hver straf
 * to gange.
 */
export const indsaetStandardfelter = mutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const admin = await requireAdmin(ctx);

    const findes = await ctx.db.query("hjulfelter").first();
    if (findes !== null) {
      throw new ConvexError({
        code: "WHEEL_NOT_EMPTY",
        message: "Hjulet har allerede felter. Eksemplerne sættes kun ind i et tomt hjul.",
      });
    }

    const now = Date.now();
    for (const felt of STANDARDFELTER) {
      await ctx.db.insert("hjulfelter", {
        tekst: felt.tekst,
        emoji: felt.emoji,
        aktiv: true,
        oprettetAf: admin._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    console.log("[Straffehjul] standardfelter indsat", { antal: STANDARDFELTER.length });
    return STANDARDFELTER.length;
  },
});

async function kraeverPladsTilAktivt(ctx: MutationCtx): Promise<void> {
  const aktive = await ctx.db
    .query("hjulfelter")
    .withIndex("by_aktiv", (q) => q.eq("aktiv", true))
    .take(MAX_AKTIVE_FELTER);

  if (!harPladsTilAktivt(aktive.length)) {
    throw new ConvexError({
      code: "WHEEL_FULL",
      message: `Hjulet kan højst have ${MAX_AKTIVE_FELTER} aktive felter. Sluk eller slet et først.`,
    });
  }
}

function kraever<T extends object>(svar: T | { afslag: Afslag }): T {
  if ("afslag" in svar) throw new ConvexError(svar.afslag);
  return svar;
}
