import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireCurrentUser } from "./identity";

/**
 * Globale indstillinger, som en admin styrer for alle.
 *
 * Afløser Firestores `settings/themes`-dokument. Det voksede ét boolean ad
 * gangen — først `copenhellBallade`, så `odaysBallade` — og hver ny gav et
 * felt mere i et dokument, som klienten skulle kende formen på. Her er hver
 * indstilling en RÆKKE med en nøgle og en tekstværdi, så et nyt tema er en ny
 * værdi i en liste og ikke en schemaændring.
 *
 * ## Ballade-temaet
 *
 * De to gamle booleans var i praksis ét valg med tre tilstande: Copenhell,
 * O Days, eller ingen af dem. Servicen håndhævede det ved at slå det ene fra,
 * når det andet blev slået til — en regel, der levede i to næsten identiske
 * funktioner og kun holdt, så længe begge huskede den. Som ét felt med tre
 * lovlige værdier kan de to ikke være tændt samtidig.
 *
 * Temaet hører til Kanalen "Ballade" — et af de kanoniske danske navne, der
 * bevares ordret.
 */

/** Nøglen for det aktive Ballade-tema. */
export const BALLADE_TEMA = "balladeTema";

/**
 * De lovlige temaer. Tom streng betyder "ingen" — Ballade ser ud som alle
 * andre Kanaler.
 */
export const BALLADE_TEMAER = ["", "copenhell", "odays"] as const;
export type BalladeTema = (typeof BALLADE_TEMAER)[number];

/**
 * Det aktive Ballade-tema.
 *
 * Åben for alle indloggede — det styrer, hvordan appen ser ud for dem, så de
 * skal kunne læse den. Kun skrivningen er admin.
 */
export const getBalladeTema = query({
  args: {},
  handler: async (ctx): Promise<BalladeTema> => {
    await requireCurrentUser(ctx);

    const raekke = await ctx.db
      .query("indstillinger")
      .withIndex("by_noegle", (q) => q.eq("noegle", BALLADE_TEMA))
      .unique();

    // Ingen række betyder "aldrig sat" — altså slået fra, som i det gamle
    // repos `DEFAULT_THEME_SETTINGS`.
    const vaerdi = raekke?.vaerdi ?? "";
    return erBalladeTema(vaerdi) ? vaerdi : "";
  },
});

/**
 * Sætter Ballade-temaet. Kun admins.
 *
 * Ét kald frem for det gamle repos `setCopenhellBallade` og
 * `setOdaysBallade`, som hver især skulle huske at slå den anden fra.
 */
export const setBalladeTema = mutation({
  args: { tema: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const admin = await requireAdmin(ctx);

    if (!erBalladeTema(args.tema)) {
      throw new ConvexError({
        code: "UKENDT_TEMA",
        message:
          `"${args.tema}" er ikke et kendt Ballade-tema. ` +
          `Vælg copenhell, odays — eller ingenting for at slå temaet fra.`,
      });
    }

    const now = Date.now();
    const eksisterende = await ctx.db
      .query("indstillinger")
      .withIndex("by_noegle", (q) => q.eq("noegle", BALLADE_TEMA))
      .unique();

    if (eksisterende === null) {
      await ctx.db.insert("indstillinger", {
        noegle: BALLADE_TEMA,
        vaerdi: args.tema,
        opdateretAf: admin._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(eksisterende._id, {
        vaerdi: args.tema,
        opdateretAf: admin._id,
        updatedAt: now,
      });
    }

    console.log("[Admin] Ballade-tema sat", {
      tema: args.tema === "" ? "ingen" : args.tema,
    });
  },
});

function erBalladeTema(vaerdi: string): vaerdi is BalladeTema {
  return (BALLADE_TEMAER as readonly string[]).includes(vaerdi);
}
