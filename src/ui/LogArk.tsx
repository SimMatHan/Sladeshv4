import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
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
 * plejer. Det almindelige tilfælde er dermed ÉT tryk.
 *
 * DEN LANGE VEJ blev lavet om, da kataloget voksede til over 60 varianter.
 * Før lå alle kategorier under hinanden som chips i ét langt rul: for tre øl
 * og to shots var det fint, men med 63 skal man rulle forbi alt det, man ikke
 * skal bruge, og navnene stod uden den beskrivelse, der gør dem til at kende
 * fra hinanden ("Fisk", "Blanc", "Sour").
 *
 * Nu er der tre veje ind, i den rækkefølge man typisk bruger dem:
 *
 *   1. Dine sædvanlige — ét tryk, dækker det meste.
 *   2. Søgefeltet — ved du hvad du vil have, er det hurtigere end at lede.
 *      Det søger på tværs af ALLE kategorier, også i beskrivelserne.
 *   3. Kategorifanerne — én kategori ad gangen, så listen er til at overskue.
 *      Fanerne bliver stående, mens man ruller.
 *
 * Hver variant står som en fuld række med navn og beskrivelse. Rækken er
 * større at ramme end en chip, og beskrivelsen fjerner tvivlen om, hvad
 * "Fernet" eller "Radler" er, uden at man skal trykke for at finde ud af det.
 */

/** Hvor mange logninger tilbage vi udleder vanerne af. */
const HISTORIK_DYBDE = 120;

/** Antal genveje øverst. Fire fylder to rækker på en telefon. */
const ANTAL_SAEDVANLIGE = 4;

/**
 * Hvor mange varianter der skal til, før søgefeltet er umagen værd.
 *
 * Under den er kategorifanerne nok — et søgefelt over en liste, man kan
 * overskue, er bare en ekstra ting at kigge på.
 */
const SOEG_FRA_ANTAL = 12;

type Saedvanlig = {
  categoryId: string;
  variationName: string;
  sizeId: string;
  antal: number;
};

type Variant = Doc<"drinkVariations">;

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
  // Bredden er sat udtrykkeligt: DRINK_CATEGORIES er `as const`, saa uden
  // den ville tilstanden blive laast til literalen "beer".
  const [kategori, setKategori] = useState<string>(DRINK_CATEGORIES[0].id);
  const [soeg, setSoeg] = useState("");

  const saedvanlige = useMemo(() => udledSaedvanlige(mineLogs), [mineLogs]);

  const efterKategori = useMemo(() => {
    const kort = new Map<string, Variant[]>();
    for (const variant of katalog ?? []) {
      const liste = kort.get(variant.categoryId);
      if (liste === undefined) kort.set(variant.categoryId, [variant]);
      else liste.push(variant);
    }
    return kort;
  }, [katalog]);

  const soegning = soeg.trim();
  const soeger = soegning !== "";

  const traef = useMemo(() => {
    if (!soeger) return [];
    const noegle = fold(soegning);
    return (katalog ?? []).filter(
      (variant) =>
        fold(variant.name).includes(noegle) ||
        fold(variant.description ?? "").includes(noegle),
    );
  }, [katalog, soeger, soegning]);

  /** Listen der vises lige nu: enten søgetræffene eller den valgte kategori. */
  const viste = soeger ? traef : (efterKategori.get(kategori) ?? []);

  // "Andet" har ingen størrelse — en cigaret er hverken stor eller lille.
  // Vælgeren forsvinder derfor, frem for at stå og se ud som om den betyder
  // noget. Under en søgning afhænger det af, om træffene overhovedet kan have
  // en størrelse.
  const visStoerrelse = soeger
    ? viste.some((variant) => categorySupportsSize(variant.categoryId))
    : categorySupportsSize(kategori);

  const antalIKatalog = katalog?.length ?? 0;

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

  const logVariant = (variant: Variant) =>
    log(
      variant.categoryId,
      variant.name,
      // Kategorier uden størrelse får den lille med. Serveren udelader den
      // alligevel, men vi sender ikke noget misvisende afsted.
      categorySupportsSize(variant.categoryId) ? stoerrelse : "small",
    );

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

      {katalog === undefined ? (
        <p className="tom">Henter kataloget …</p>
      ) : antalIKatalog === 0 ? (
        <div className="tom">
          <p>Kataloget er tomt.</p>
          <p className="hjaelp">
            En admin skal tilføje drikkevarer, før der er noget at vælge.
          </p>
        </div>
      ) : (
        <>
          {antalIKatalog >= SOEG_FRA_ANTAL && (
            <div className="arkgruppe">
              <h3>Find en drikkevare</h3>
              <input
                className="felt"
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                value={soeg}
                onChange={(event) => setSoeg(event.target.value)}
                placeholder={`Søg blandt ${antalIKatalog} — fx øl, gin, jule …`}
                aria-label="Søg i kataloget"
              />
            </div>
          )}

          {/* Fanerne klæber til toppen: ruller man langt ned i shots og vil
              videre til vin, skal man ikke først rulle hele vejen op igen.
              De skjules under en søgning, hvor træffene går på tværs af
              kategorier og en markeret fane derfor ville lyve. */}
          {!soeger && (
            <div className="arkgruppe klaebende">
              <div className="faner" role="group" aria-label="Kategori">
                {DRINK_CATEGORIES.map((valg) => {
                  const antal = efterKategori.get(valg.id)?.length ?? 0;
                  return (
                    <button
                      key={valg.id}
                      className="chip fane"
                      aria-pressed={kategori === valg.id}
                      onClick={() => setKategori(valg.id)}
                    >
                      <span className="emoji">{valg.emoji}</span>
                      {valg.label}
                      <span className="enhed">{antal}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {visStoerrelse && (
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
          )}

          <div className="arkgruppe">
            <h3>
              {soeger
                ? `${traef.length} ${traef.length === 1 ? "træffer" : "træffere"}`
                : `${etiketFor(kategori)} · ${viste.length}`}
            </h3>

            {viste.length === 0 ? (
              <p className="tom">
                {soeger
                  ? `Ingen drikkevarer matcher "${soegning}".`
                  : "Der er ikke lagt noget i denne kategori endnu."}
              </p>
            ) : (
              <div className="varianter">
                {viste.map((variant) => (
                  <button
                    key={variant._id}
                    className="variant"
                    onClick={() => logVariant(variant)}
                  >
                    <span className="emoji" aria-hidden="true">
                      {emojiFor(variant.categoryId)}
                    </span>
                    <span className="midt">
                      <span className="navn">{variant.name}</span>
                      {/* Under en søgning står kategorien med, så man kan se
                          om "Mimosa" er den fra vin eller den fra cocktails. */}
                      <span className="under">
                        {soeger && (
                          <span className="maerke">
                            {etiketFor(variant.categoryId)}
                          </span>
                        )}
                        {variant.description ??
                          (soeger ? "" : "Ingen beskrivelse")}
                      </span>
                    </span>
                    <span className="plus" aria-hidden="true">
                      +
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
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

/**
 * Gør en tekst søgbar: små bogstaver, uden accenter, og med de danske
 * bogstaver skrevet som det, folk taster på vej efter dem.
 *
 * Uden det ville "rose" ikke finde "Rosé", "jager" ikke "Jägermeister" og
 * "glogg" ikke "Gløgg" — og man ville tro, at drikkevaren ikke fandtes.
 */
function fold(tekst: string): string {
  return tekst
    .toLowerCase()
    .normalize("NFD")
    // Kombinerende accenter (é, ä, ü). Æ, Ø og Å dækkes ikke af NFD.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a");
}

function emojiFor(categoryId: string): string {
  return DRINK_CATEGORIES.find((k) => k.id === categoryId)?.emoji ?? "🥤";
}

function etiketFor(categoryId: string): string {
  return DRINK_CATEGORIES.find((k) => k.id === categoryId)?.label ?? categoryId;
}

function navnPaaStoerrelse(sizeId: string): string {
  return DRINK_SIZES.find((s) => s.id === sizeId)?.label ?? "";
}
