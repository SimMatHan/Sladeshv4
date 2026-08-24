import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  DRINK_CATEGORIES,
  DRINK_SIZES,
  categorySupportsSize,
} from "../../convex/constants";
import { useCachetQuery } from "../lib/oejebliksbillede";
import { vaegtForStoerrelse } from "../lib/optimistisk";
import { useLogDrink } from "../lib/optimistiskeKald";
import { Ark } from "./Ark";

/**
 * Log en genstand.
 *
 * Appens hyppigste handling, og derfor et ARK frem for en side: man trykker
 * ( + ), vælger, og står præcis hvor man var. I den gamle app kostede det et
 * sideskift, en swipe gennem kategorier, et variantvalg og et størrelsesvalg
 * — fem tryk, hvis man ramte rigtigt første gang.
 *
 * Øverst står "dine sædvanlige": de fire, du oftest logger, i den størrelse du
 * plejer. Det almindelige tilfælde er dermed ÉT tryk. Resten af kataloget
 * ligger nedenunder for det, man ikke plejer at drikke.
 */

/** Hvor mange logninger tilbage vi udleder vanerne af. */
const HISTORIK_DYBDE = 120;

/** Antal genveje øverst. Fire fylder to rækker på en telefon. */
const ANTAL_SAEDVANLIGE = 4;

type Saedvanlig = {
  categoryId: string;
  variationName: string;
  sizeId: string;
  antal: number;
};

export function LogArk({
  channelId,
  onLuk,
  onLogget,
}: {
  channelId: Id<"kanaler"> | undefined;
  onLuk: () => void;
  onLogget: (
    navn: string,
    vaegt: number,
    svar: Promise<Id<"drinkLogs">>,
  ) => void;
}) {
  // Kataloget skifter næsten aldrig og er det, arket ikke kan vise noget uden.
  // Gemt lokalt er ( + ) fyldt ud i det øjeblik, det åbner — også på et net,
  // der ikke er kommet op endnu.
  const katalog = useCachetQuery(
    "katalog",
    api.drinkVariations.getDrinkVariations,
    {},
  );
  const mineLogs = useQuery(api.drinkLogs.getDrinkLogsForUser, {
    limit: HISTORIK_DYBDE,
  });
  const logDrink = useLogDrink();

  const [stoerrelse, setStoerrelse] = useState("small");

  const saedvanlige = useMemo(() => udledSaedvanlige(mineLogs), [mineLogs]);

  const efterKategori = useMemo(() => {
    const kort = new Map<string, string[]>();
    for (const variant of katalog ?? []) {
      const liste = kort.get(variant.categoryId);
      if (liste === undefined) kort.set(variant.categoryId, [variant.name]);
      else liste.push(variant.name);
    }
    return kort;
  }, [katalog]);

  /**
   * Logger uden at vente.
   *
   * FØR ventede arket på serverens svar, før det lukkede. På fuld dækning var
   * det umærkeligt; på to bjælker i en kælder betød det, at man trykkede på en
   * knap, der ikke gjorde noget, i flere sekunder — og så trykkede igen.
   *
   * Nu lukker arket på trykket, og stillingen flytter sig med det samme via
   * den optimistiske opdatering i useLogDrink. Serverens svar bruges kun til
   * to ting: at give kvitteringen sit logId, så Fortryd kan komme frem, og at
   * sige til, hvis det gik galt. Begge dele håndteres af skallen, som stadig
   * står, når arket er væk.
   *
   * Uden dækning fejler kaldet ikke — Convex lægger mutationen i kø og sender
   * den, når der er hul igennem. Den optimistiske +1 bliver stående så længe.
   */
  const log = (categoryId: string, variationName: string, sizeId: string) => {
    const svar = logDrink({ channelId, categoryId, variationName, sizeId }).then(
      (resultat) => resultat.logId,
    );

    onLogget(variationName, vaegtForStoerrelse(categoryId, sizeId), svar);
    onLuk();
  };

  return (
    <Ark titel="Log en genstand" onLuk={onLuk}>
      {saedvanlige.length > 0 && (
        <div className="arkgruppe">
          <h3>Dine sædvanlige</h3>
          <div className="chips">
            {saedvanlige.map((vane) => (
              <button
                key={`${vane.categoryId}::${vane.variationName}`}
                className="chip stor"
                onClick={() =>
                  log(vane.categoryId, vane.variationName, vane.sizeId)
                }
              >
                <span className="emoji">{emojiFor(vane.categoryId)}</span>
                {vane.variationName}
                {/* Størrelsen står kun, når den afviger fra den lille —
                    ellers er den støj på hver eneste genvej. */}
                {vane.sizeId !== "small" && (
                  <span className="enhed"> {navnPaaStoerrelse(vane.sizeId)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="arkgruppe">
        <h3>Størrelse</h3>
        <div className="segmenter">
          {DRINK_SIZES.map((size) => (
            <button
              key={size.id}
              className="segment"
              aria-selected={stoerrelse === size.id}
              onClick={() => setStoerrelse(size.id)}
            >
              {size.label}
              <br />
              <span className="enhed">{size.volumeLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {katalog === undefined ? (
        // `.midtstillet`, ikke `.tom`: det ene er appens hentetilstand — se
        // Achievements.tsx for samme mønster i et andet ark — det andet er
        // reserveret til et ÆGTE tomt resultat, som kataloget nedenfor.
        <p className="midtstillet">Henter kataloget …</p>
      ) : (
        DRINK_CATEGORIES.map((kategori) => {
          const varianter = efterKategori.get(kategori.id) ?? [];
          if (varianter.length === 0) return null;

          return (
            <div className="arkgruppe" key={kategori.id}>
              <h3>
                {kategori.emoji} {kategori.label}
              </h3>
              <div className="chips">
                {varianter.map((navn) => (
                  <button
                    key={navn}
                    className="chip"
                    onClick={() =>
                      log(
                        kategori.id,
                        navn,
                        // "Andet" har ingen størrelse — en cigaret er ikke
                        // stor eller lille. Serveren udelader den alligevel,
                        // men vi sender ikke noget misvisende afsted.
                        categorySupportsSize(kategori.id) ? stoerrelse : "small",
                      )
                    }
                  >
                    {navn}
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}

      {katalog !== undefined && katalog.length === 0 && (
        <div className="tom">
          <p>Kataloget er tomt.</p>
          <p className="hjaelp">
            En admin skal tilføje drikkevarer, før der er noget at vælge.
          </p>
        </div>
      )}
    </Ark>
  );
}

/**
 * Udleder vanerne af egen historik.
 *
 * Ingen ny backend: "dine sædvanlige" er bare de hyppigste (kategori, variant)
 * i de seneste logninger. Fortrydelser og nulstillinger tæller ikke med — en
 * genstand man fortrød, er ikke en vane.
 *
 * Størrelsen følger med: har man altid taget en stor, skal genvejen give en
 * stor. Ellers ville det ene tryk stadig være forkert.
 */
function udledSaedvanlige(
  logs:
    | Array<{
        categoryId: string;
        variationName: string;
        sizeId?: string;
        isReset?: boolean;
        action?: string;
      }>
    | undefined,
): Saedvanlig[] {
  if (logs === undefined) return [];

  const talt = new Map<string, Saedvanlig & { stoerrelser: Map<string, number> }>();

  for (const log of logs) {
    if (log.isReset === true) continue;
    if (log.action === "remove") continue;

    const noegle = `${log.categoryId}::${log.variationName}`;
    const sizeId = log.sizeId ?? "small";

    const kendt = talt.get(noegle);
    if (kendt === undefined) {
      talt.set(noegle, {
        categoryId: log.categoryId,
        variationName: log.variationName,
        sizeId,
        antal: 1,
        stoerrelser: new Map([[sizeId, 1]]),
      });
      continue;
    }

    kendt.antal++;
    kendt.stoerrelser.set(sizeId, (kendt.stoerrelser.get(sizeId) ?? 0) + 1);
  }

  return [...talt.values()]
    .sort((a, b) => b.antal - a.antal)
    .slice(0, ANTAL_SAEDVANLIGE)
    .map((vane) => {
      let hyppigste = "small";
      let flest = 0;
      for (const [sizeId, antal] of vane.stoerrelser) {
        if (antal > flest) {
          flest = antal;
          hyppigste = sizeId;
        }
      }
      return {
        categoryId: vane.categoryId,
        variationName: vane.variationName,
        sizeId: hyppigste,
        antal: vane.antal,
      };
    });
}

function emojiFor(categoryId: string): string {
  return DRINK_CATEGORIES.find((k) => k.id === categoryId)?.emoji ?? "🥤";
}

function navnPaaStoerrelse(sizeId: string): string {
  return DRINK_SIZES.find((s) => s.id === sizeId)?.label ?? "";
}
