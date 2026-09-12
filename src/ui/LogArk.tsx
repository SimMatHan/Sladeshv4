import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { LogDrinkResultat } from "../../convex/drinkLogs";
import { DRINK_CATEGORIES } from "../../convex/constants";
import { useCachetQuery } from "../lib/oejebliksbillede";
import { vaegtForGenstand } from "../lib/optimistisk";
import { useLogDrink } from "../lib/optimistiskeKald";
import { Ark } from "./Ark";
import { tik } from "./haptik";
import { Tilfaeldig } from "./Tilfaeldig";
import { hentPosition, kendtPosition } from "./position";

/**
 * Log en genstand.
 *
 * Appens hyppigste handling, og derfor et ARK frem for en side: man trykker
 * ( + ), vælger, og står præcis hvor man var.
 *
 * ## To ting fjernet, én tilføjet
 *
 * FØR sad der en størrelsesvælger mellem genvejene og kataloget — Lille,
 * Mellem, Stor. Den var en TILSTAND: den huskede sig selv og styrede hvert
 * eneste tryk længere nede, uden at være i nærheden af dem. Man kunne stå og
 * logge store øl i en halv time uden at vide det. Den er væk, og én logning
 * er nu én genstand; se kommentaren, hvor `DRINK_SIZES` stod, i
 * convex/constants.ts.
 *
 * TILFØJET er et søgefelt. Kataloget er admin-styret og vokser; da det kun
 * kunne bladres, betød "jeg vil logge en Fernet", at man scrollede forbi fem
 * kategorier for at finde den. Nu skriver man "fer".
 *
 * Øverst står "dine sædvanlige": de fire, du oftest logger. Det almindelige
 * tilfælde er dermed ÉT tryk.
 */

/** Hvor mange logninger tilbage vi udleder vanerne af. */
const HISTORIK_DYBDE = 120;

/** Antal genveje øverst. Fire fylder to rækker på en telefon. */
const ANTAL_SAEDVANLIGE = 4;

type Saedvanlig = {
  categoryId: string;
  variationName: string;
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
    /**
     * Hele serverens svar, ikke kun logId'et. `nyeAchievements` fortæller
     * hvad præcis DENNE logning låste op, og skallen fejrer det.
     */
    svar: Promise<LogDrinkResultat>,
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
  const opdaterPosition = useMutation(api.users.opdaterPosition);

  const [soegning, setSoegning] = useState("");
  const [hjulAabent, setHjulAabent] = useState(false);

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

  const traeffere = useMemo(() => {
    const noegle = sammenlignbar(soegning);
    if (noegle.length === 0) return undefined;
    return (katalog ?? []).filter((variant) =>
      sammenlignbar(variant.name).includes(noegle),
    );
  }, [katalog, soegning]);

  /**
   * Sender positionen med — eller bagefter, hvis vi ikke har den endnu.
   *
   * ALDRIG afventet. GPS tager sekunder, og arket lukker på trykket; ventede
   * vi, ville appens hurtigste handling blive dens langsomste. Se
   * position.ts for hvorfor tilstanden ligger på modulet.
   *
   * Rækkefølgen er ikke tilfældig. `logDrink` checker dig ind ved aftenens
   * første genstand, og `opdaterPosition` skriver kun, når du ER ude. Kom
   * positionen først, ville serveren svare `{ delt: false }` og kaste den
   * væk — derfor efter logningen, ikke før.
   */
  const delPosition = (logningen: Promise<unknown>) => {
    void hentPosition().then((position) => {
      if (position === undefined) return;
      // Afventer logningen, saa check-in'et er landet. Fejler den, er der
      // heller ingen position at dele — man er ikke ude.
      void logningen.then(
        () => void opdaterPosition(position).catch(() => {}),
        () => {},
      );
    });
  };

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
  const log = (categoryId: string, variationName: string) => {
    // Telefonen kvitterer, INDEN serveren gør. Arket lukker på trykket, og
    // et lille stød er den eneste bekræftelse, man får med telefonen løftet
    // halvvejs ned i lommen igen. Kun Android — se haptik.ts.
    tik();

    // Har vi ALLEREDE et friskt fix, kommer det med i samme kald og skrives
    // i samme transaktion som check-in'et. Det er ét kald i stedet for to,
    // og det er det almindelige tilfælde efter aftenens første logning.
    const position = kendtPosition();
    const svar = logDrink({
      channelId,
      categoryId,
      variationName,
      ...(position !== undefined ? { location: position } : {}),
    });

    if (position === undefined) delPosition(svar);

    onLogget(variationName, vaegtForGenstand(categoryId), svar);
    onLuk();
  };

  /**
   * Hjulet har landet: log, men LUK IKKE.
   *
   * `log()` ovenfor lukker arket på trykket, fordi man dér selv har valgt
   * og ved, hvad man valgte. Her er hele pointen den modsatte: man skal se
   * hvad skæbnen fandt, og at man nu skal skaffe det. Lukningen sker, når
   * man selv trykker sig videre.
   */
  const logFraHjul = (kandidat: { categoryId: string; name: string }) => {
    const position = kendtPosition();
    const svar = logDrink({
      channelId,
      categoryId: kandidat.categoryId,
      variationName: kandidat.name,
      ...(position !== undefined ? { location: position } : {}),
    });
    if (position === undefined) delPosition(svar);
    onLogget(kandidat.name, vaegtForGenstand(kandidat.categoryId), svar);
  };

  return (
    <>
      {/*
        UDEN FOR arket med vilje.
        
        `.ark` bærer en `transform` under både indkørsel og træk, og et
        `position: fixed` barn regner fra nærmeste transformerede forfar —
        altså fra arket i stedet for fra skærmen. Hjulets dug ville da kun
        dække arket, og kortet ville hoppe med, hvis nogen trak i arket
        bagved. Her ude er der ingen transform mellem hjulet og skærmen.
      */}
      {hjulAabent && (
        <Tilfaeldig
          katalog={katalog ?? []}
          onValgt={logFraHjul}
          onLuk={() => {
            setHjulAabent(false);
            onLuk();
          }}
        />
      )}

      <Ark
        titel="Log en genstand"
        onLuk={onLuk}
        handling={
          /* Terningen alene var for stille. Den sad som en glyf i et hjørne
             og lignede lige så meget pynt som en knap — og en funktion,
             ingen opdager, er ikke en funktion. Nu er den en pille med ord
             på, og `aria-label` er væk, fordi teksten siger det selv. */
          <button
            className="hjulknap"
            disabled={(katalog ?? []).length === 0}
            onClick={() => {
              tik();
              setHjulAabent(true);
            }}
          >
            <span aria-hidden="true">🎲</span>
            Tilfældig
          </button>
        }
      >

        <input
          className="felt soegefelt"
          type="search"
          value={soegning}
          placeholder="Søg …"
          // Ingen autofokus. Tastaturet ville springe op og dække de genveje,
          // der dækker det almindelige tilfælde med ét tryk.
          aria-label="Søg i kataloget"
          onChange={(event) => setSoegning(event.target.value)}
        />

        {/* Søger man, ER resultatet skærmen. Genveje og kategorier ville stå
            som støj under noget, man netop har bedt om at få skåret ned. */}
        {traeffere !== undefined ? (
          traeffere.length === 0 ? (
            <div className="tom">
              <p>Ingen træffere på "{soegning.trim()}".</p>
              <p className="hjaelp">
                Kataloget styres af en admin — mangler der noget, kan det
                tilføjes dér.
              </p>
            </div>
          ) : (
            <div className="arkgruppe">
              <h3>{traeffere.length === 1 ? "1 træffer" : `${traeffere.length} træffere`}</h3>
              <div className="chips">
                {traeffere.map((variant) => (
                  <button
                    key={`${variant.categoryId}::${variant.name}`}
                    className="chip"
                    onClick={() => log(variant.categoryId, variant.name)}
                  >
                    {/* Kategorien står med, fordi listen er flad: uden den
                        kan to varianter med samme navn ikke skelnes. */}
                    <span className="emoji">{emojiFor(variant.categoryId)}</span>
                    {variant.name}
                  </button>
                ))}
              </div>
            </div>
          )
        ) : (
          <>
            {saedvanlige.length > 0 && (
              <div className="arkgruppe">
                <h3>Dine sædvanlige</h3>
                <div className="chips">
                  {saedvanlige.map((vane) => (
                    <button
                      key={`${vane.categoryId}::${vane.variationName}`}
                      className="chip stor fyldt"
                      onClick={() => log(vane.categoryId, vane.variationName)}
                    >
                      <span className="emoji">{emojiFor(vane.categoryId)}</span>
                      {vane.variationName}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                          onClick={() => log(kategori.id, navn)}
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
          </>
        )}
      </Ark>
    </>
  );
}

/**
 * Gør to navne sammenlignelige for en søgning.
 *
 * Æ, Ø og Å foldes til a, o og a — IKKE for at være sprogligt korrekt, men
 * fordi man skriver "rodvin" og "øl" lige hurtigt på en telefon, man holder i
 * én hånd. Foldningen sker på begge sider, så begge stavemåder rammer.
 */
function sammenlignbar(tekst: string): string {
  return tekst
    .trim()
    .toLowerCase()
    .replaceAll("æ", "a")
    .replaceAll("ø", "o")
    .replaceAll("å", "a");
}

/**
 * Udleder vanerne af egen historik.
 *
 * Ingen ny backend: "dine sædvanlige" er bare de hyppigste (kategori, variant)
 * i de seneste logninger. Fortrydelser og nulstillinger tæller ikke med — en
 * genstand man fortrød, er ikke en vane.
 *
 * Størrelsen fulgte før med, så genvejen gav en stor, hvis man plejede at
 * tage en stor. Der er ikke længere en størrelse at følge.
 */
function udledSaedvanlige(
  logs:
    | Array<{
        categoryId: string;
        variationName: string;
        isReset?: boolean;
        action?: string;
      }>
    | undefined,
): Saedvanlig[] {
  if (logs === undefined) return [];

  const talt = new Map<string, Saedvanlig>();

  for (const log of logs) {
    if (log.isReset === true) continue;
    if (log.action === "remove") continue;

    const noegle = `${log.categoryId}::${log.variationName}`;

    const kendt = talt.get(noegle);
    if (kendt === undefined) {
      talt.set(noegle, {
        categoryId: log.categoryId,
        variationName: log.variationName,
        antal: 1,
      });
      continue;
    }

    kendt.antal++;
  }

  return [...talt.values()]
    .sort((a, b) => b.antal - a.antal)
    .slice(0, ANTAL_SAEDVANLIGE);
}

function emojiFor(categoryId: string): string {
  return DRINK_CATEGORIES.find((k) => k.id === categoryId)?.emoji ?? "🥤";
}
