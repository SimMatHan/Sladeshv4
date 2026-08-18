import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  DRINK_CATEGORIES,
  DRINK_SIZES,
  categorySupportsSize,
} from "../../convex/constants";
import { fejltekst } from "../lib/visning";
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
  onLogget: (besked: string, logId: Id<"drinkLogs">) => void;
}) {
  const katalog = useQuery(api.drinkVariations.getDrinkVariations, {});
  const mineLogs = useQuery(api.drinkLogs.getDrinkLogsForUser, {
    limit: HISTORIK_DYBDE,
  });
  const logDrink = useMutation(api.drinkLogs.logDrink);

  const [stoerrelse, setStoerrelse] = useState("small");
  const [arbejder, setArbejder] = useState(false);
  const [fejl, setFejl] = useState<string | undefined>();

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

  const log = async (
    categoryId: string,
    variationName: string,
    sizeId: string,
  ) => {
    if (arbejder) return;
    setArbejder(true);
    setFejl(undefined);

    try {
      const svar = await logDrink({
        channelId,
        categoryId,
        variationName,
        sizeId,
      });

      // Arket lukker med det samme. Bekræftelsen — med Fortryd — vises af
      // skallen, så den overlever, at arket forsvinder.
      onLogget(variationName, svar.logId);
      onLuk();
    } catch (error) {
      // Arket bliver stående ved fejl. Lukkede det, ville brugeren ikke vide,
      // om genstanden blev talt med.
      setFejl(fejltekst(error));
      setArbejder(false);
    }
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
                disabled={arbejder}
                onClick={() =>
                  void log(vane.categoryId, vane.variationName, vane.sizeId)
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
        <p className="tom">Henter kataloget …</p>
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
                    disabled={arbejder}
                    onClick={() =>
                      void log(
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

      {fejl !== undefined && <p className="fejl">{fejl}</p>}
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
