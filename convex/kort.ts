import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  POSITION_FORAELDET_MS,
  erPositionForaeldet,
  laesPosition,
} from "./beaconRules";
import { AVATAR_COLOR_NAMES, getDrinkDayStart } from "./constants";
import { erUdeIDag } from "./drinkRules";
import { requireKanalMedlem } from "./identity";

/**
 * Kortet: hvem i Kanalen er ude, og hvor.
 *
 * Hullet fra `docs/skaermkortlaegning.md` afsnit 4.6. `users.opdaterPosition`
 * skrev ens egen position, men der fandtes ingen vej til at se de andres.
 *
 * ## Reglen: positionen deles KUN mens man er ude
 *
 * Det er den mest personfølsomme funktion i appen, og reglen er håndhævet to
 * steder — ikke ét:
 *
 * 1. **Den gemmes ikke.** `users.opdaterPosition` skriver ingenting, når man
 *    ikke er ude i dag. Der ligger altså ikke en position at lække.
 * 2. **Den udleveres ikke.** Denne query springer alligevel medlemmer over,
 *    der ikke er ude — for gamle rækker og for den, der lige er checket ud.
 *
 * Oven i det gælder samme friskhedsgrænse som beacon-evalueringen bruger: en
 * position ældre end 15 minutter siger ikke længere noget om, hvor nogen er,
 * og udleveres ikke.
 *
 * "Ude" betyder det samme her som på stillingen, og siden trin 1 sætter den
 * første genstand det selv. Man kommer altså på kortet ved at være med i
 * legen — ikke ved at have appen åben.
 */

export type Kortperson = {
  userId: Id<"users">;
  navn: string;
  emoji?: string;
  farve: string;
  lat: number;
  lng: number;
  opdateretAt: number;
  /** Er det den, der spørger? */
  erMig: boolean;
};

export type Kortsvar = {
  personer: Kortperson[];
  /** Deles MIN position lige nu — og hvis ikke, hvorfor. */
  mig: {
    deler: boolean;
    grund?: "ikke_ude" | "ingen_position" | "position_foraeldet";
  };
  /** Hvor gammel en position må være. Så UI'et kan forklare grænsen. */
  friskhedMs: number;
};

export const getKanalPositioner = query({
  args: {
    channelId: v.id("kanaler"),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Kortsvar> => {
    const { user, kanal } = await requireKanalMedlem(ctx, args.channelId);

    const now = args.now ?? Date.now();
    const dayStart = getDrinkDayStart(now);

    const medlemmer = await Promise.all(
      kanal.members.map((userId) => ctx.db.get(userId)),
    );

    const personer: Kortperson[] = [];
    let minGrund: Kortsvar["mig"]["grund"];

    for (const medlem of medlemmer) {
      if (medlem === null) continue;

      const erMig = medlem._id === user._id;
      const ude = erUdeIDag(medlem, dayStart);
      const position = laesPosition(medlem);

      // Grunden gemmes kun for én selv. At fortælle HVORFOR en anden ikke er
      // på kortet ville i sig selv være en oplysning om vedkommende.
      const afvis = (grund: NonNullable<Kortsvar["mig"]["grund"]>) => {
        if (erMig) minGrund = grund;
      };

      if (!ude) {
        afvis("ikke_ude");
        continue;
      }
      if (position === undefined) {
        afvis("ingen_position");
        continue;
      }
      if (erPositionForaeldet(position.opdateretAt, now)) {
        afvis("position_foraeldet");
        continue;
      }

      personer.push({
        userId: medlem._id,
        navn: medlem.displayName || "Anonym",
        emoji: medlem.emoji,
        farve: medlem.avatarColor ?? AVATAR_COLOR_NAMES[0],
        lat: position.lat,
        lng: position.lng,
        opdateretAt: position.opdateretAt,
        erMig,
      });
    }

    console.log("[Kort] positioner", {
      kanal: kanal.name,
      synlige: personer.length,
      medlemmer: kanal.members.length,
    });

    return {
      personer,
      mig: { deler: minGrund === undefined, grund: minGrund },
      friskhedMs: POSITION_FORAELDET_MS,
    };
  },
});
