import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DRINK_CATEGORIES } from "./constants";
import { STANDARD_KATALOG } from "./drikkekatalog";
import { requireAdmin, requireCurrentUser } from "./identity";

/**
 * Kataloget over drikkevarianter.
 *
 * Afløser rod-collectionen `/drinkVariations` og
 * src/services/drinkVariationService.ts i det gamle repo.
 *
 * Varianterne er GLOBALE — de samme for alle brugere og alle Kanaler — og
 * kun admins kan ændre dem. Sådan var det også før; spærren lå bare i
 * admin-portalens UI frem for på serveren.
 *
 * Det gamle repos `useDrinkVariations` byggede et lag af cache og
 * stale-while-revalidate omkring Firestore-lytteren. Det behøves ikke her:
 * `useQuery(api.drinkVariations.getDrinkVariations)` er reaktiv af sig selv
 * og deduplikeres på tværs af komponenter af Convex-klienten.
 */

/** Længdegrænser. Nye — det gamle repo havde ingen. */
export const VARIANT_NAVN_MAX = 60;
export const VARIANT_BESKRIVELSE_MAX = 200;

/**
 * Kataloget, sorteret efter kategori og derefter navn.
 *
 * Uden `categoryId` returneres alt. Kræver login, men ikke mere end det —
 * kataloget er ens for alle.
 */
export const getDrinkVariations = query({
  args: { categoryId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Doc<"drinkVariations">[]> => {
    await requireCurrentUser(ctx);

    const raekker =
      args.categoryId === undefined
        ? await ctx.db.query("drinkVariations").collect()
        : await ctx.db
            .query("drinkVariations")
            .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!))
            .collect();

    // Sorteringen sker her frem for i et index, fordi kataloget er lille og
    // dansk sortering ("Ø" efter "Z") ikke kan udtrykkes i et Convex-index.
    return raekker.sort((a, b) => {
      if (a.categoryId !== b.categoryId) {
        return a.categoryId.localeCompare(b.categoryId, "da");
      }
      return a.name.localeCompare(b.name, "da");
    });
  },
});

/** Opretter en variant. Kun admins. */
export const opretVariant = mutation({
  args: {
    name: v.string(),
    categoryId: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"drinkVariations">> => {
    await requireAdmin(ctx);

    const name = kraeverGyldigtNavn(args.name);
    const description = kraeverGyldigBeskrivelse(args.description);
    kraeverKendtKategori(args.categoryId);

    // Convex håndhæver ikke unikke indexes — tjek eksplicit, som i
    // convex/kanaler.ts. Uden dette ville to admins kunne oprette "Tuborg"
    // to gange, og listen ville vise dubletter.
    const eksisterende = await ctx.db
      .query("drinkVariations")
      .withIndex("by_category_and_name", (q) =>
        q.eq("categoryId", args.categoryId).eq("name", name),
      )
      .unique();

    if (eksisterende !== null) {
      throw new ConvexError({
        code: "VARIATION_ALREADY_EXISTS",
        message: `"${name}" findes allerede i kategorien.`,
      });
    }

    const now = Date.now();
    const variationId = await ctx.db.insert("drinkVariations", {
      name,
      description,
      categoryId: args.categoryId,
      createdAt: now,
      updatedAt: now,
    });

    console.log("[DrinkVariation] oprettet", {
      variationId,
      kategori: args.categoryId,
    });
    return variationId;
  },
});

/**
 * Lægger standardkataloget ind. Kun admins.
 *
 * Den findes, fordi et deployment uden varianter er en app, man ikke kan
 * logge noget i: ( + )-arket har bogstavelig talt ingenting at vise. Før
 * skulle de 63 varianter tastes ind én ad gangen eller køres ind med
 * scripts/katalog.ts, som kræver en terminal og et Firebase-kodeord.
 *
 * IDEMPOTENT: en variant, der allerede findes i samme kategori, springes
 * over. Beskrivelser på eksisterende varianter røres ikke — har nogen rettet
 * en i appen, skal et tryk her ikke skrive den tilbage. Og der SLETTES
 * aldrig noget.
 */
export const indlaesStandardkatalog = mutation({
  args: {},
  handler: async (ctx): Promise<{ oprettet: number; sprunget: number }> => {
    await requireAdmin(ctx);

    const now = Date.now();
    let oprettet = 0;
    let sprunget = 0;

    for (const variant of STANDARD_KATALOG) {
      const findes = await ctx.db
        .query("drinkVariations")
        .withIndex("by_category_and_name", (q) =>
          q.eq("categoryId", variant.categoryId).eq("name", variant.name),
        )
        .unique();

      if (findes !== null) {
        sprunget++;
        continue;
      }

      await ctx.db.insert("drinkVariations", {
        name: variant.name,
        description: variant.description,
        categoryId: variant.categoryId,
        createdAt: now,
        updatedAt: now,
      });
      oprettet++;
    }

    console.log("[DrinkVariation] standardkatalog indlaest", {
      oprettet,
      sprunget,
    });
    return { oprettet, sprunget };
  },
});

/**
 * Retter en variant. Kun admins.
 *
 * Udeladte felter røres ikke. Omdøbes en variant, ændrer det IKKE historikken:
 * `drinkLogs.variationName` er et snapshot fra logtidspunktet.
 */
export const opdaterVariant = mutation({
  args: {
    variationId: v.id("drinkVariations"),
    name: v.optional(v.string()),
    categoryId: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx);

    const variant = await ctx.db.get(args.variationId);
    if (variant === null) {
      throw new ConvexError({
        code: "VARIATION_NOT_FOUND",
        message: "Varianten findes ikke.",
      });
    }

    const name = args.name === undefined ? variant.name : kraeverGyldigtNavn(args.name);
    const categoryId = args.categoryId ?? variant.categoryId;

    if (args.categoryId !== undefined) kraeverKendtKategori(args.categoryId);

    // Flyttes eller omdøbes den, skal den nye kombination stadig være ledig.
    if (name !== variant.name || categoryId !== variant.categoryId) {
      const optaget = await ctx.db
        .query("drinkVariations")
        .withIndex("by_category_and_name", (q) =>
          q.eq("categoryId", categoryId).eq("name", name),
        )
        .unique();

      if (optaget !== null && optaget._id !== args.variationId) {
        throw new ConvexError({
          code: "VARIATION_ALREADY_EXISTS",
          message: `"${name}" findes allerede i kategorien.`,
        });
      }
    }

    // `undefined` = rør ikke feltet. `null` = ryd det.
    const description =
      args.description === undefined
        ? variant.description
        : (kraeverGyldigBeskrivelse(args.description ?? undefined) ?? undefined);

    await ctx.db.patch(args.variationId, {
      name,
      categoryId,
      description,
      updatedAt: Date.now(),
    });

    console.log("[DrinkVariation] rettet", { variationId: args.variationId });
  },
});

/**
 * Sletter en variant. Kun admins.
 *
 * Historikken påvirkes ikke — se kommentaren i convex/schema.ts. Man kan
 * altså roligt rydde op i kataloget uden at nogens logbog ændrer sig.
 */
export const sletVariant = mutation({
  args: { variationId: v.id("drinkVariations") },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx);

    const variant = await ctx.db.get(args.variationId);
    // Idempotent: en allerede slettet variant er ikke en fejl.
    if (variant === null) return;

    await ctx.db.delete(args.variationId);
    console.log("[DrinkVariation] slettet", { variationId: args.variationId });
  },
});

function kraeverGyldigtNavn(raa: string): string {
  const name = raa.trim();

  if (name.length === 0) {
    throw new ConvexError({
      code: "EMPTY_NAME",
      message: "Varianten skal have et navn.",
    });
  }
  if (name.length > VARIANT_NAVN_MAX) {
    throw new ConvexError({
      code: "NAME_TOO_LONG",
      message: `Navnet må højst fylde ${VARIANT_NAVN_MAX} tegn.`,
    });
  }

  return name;
}

function kraeverGyldigBeskrivelse(raa: string | undefined): string | undefined {
  if (raa === undefined) return undefined;

  const description = raa.trim();
  if (description.length === 0) return undefined;

  if (description.length > VARIANT_BESKRIVELSE_MAX) {
    throw new ConvexError({
      code: "DESCRIPTION_TOO_LONG",
      message: `Beskrivelsen må højst fylde ${VARIANT_BESKRIVELSE_MAX} tegn.`,
    });
  }

  return description;
}

/**
 * Kategorien skal være en af de kendte. Ellers kunne der oprettes varianter
 * i en kategori, der ikke findes i UI'et — og som ingen nogensinde ville se.
 */
function kraeverKendtKategori(categoryId: string): void {
  const kendt = DRINK_CATEGORIES.some((kategori) => kategori.id === categoryId);
  if (!kendt) {
    throw new ConvexError({
      code: "UNKNOWN_CATEGORY",
      message:
        `"${categoryId}" er ikke en kendt kategori. Gyldige: ` +
        DRINK_CATEGORIES.map((k) => k.id).join(", "),
    });
  }
}
