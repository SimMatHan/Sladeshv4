import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { SLADESH_TIME_LIMIT_MS } from "../../convex/sladeshRules";
import { fejltekst, formatUr } from "../lib/visning";
import { Fremdriftsring } from "./Fremdriftsring";
import { slag } from "./haptik";

/**
 * Urets mål.
 *
 * 132px er stort nok til, at ringen kan ses som en ring på tværs af et
 * bord, og lille nok til at der er plads til en knap under den på den
 * korteste telefon. Tykkelsen er sat, så den tomme del stadig er en
 * synlig bane, ikke en streg.
 */
const UR_STOERRELSE = 132;
const UR_TYKKELSE = 10;

/**
 * At modtage en Sladesh.
 *
 * Den ene skærm i appen, der AFBRYDER. Der er 10 minutter, og alt andet kan
 * vente — derfor er den ikke en fane og ikke et ark, men en overtagelse.
 * Lukker man den, bliver en bjælke stående med nedtællingen (se App.tsx);
 * man kan ikke komme til at glemme den.
 *
 * Faserne er serverens, ikke skærmens: `registrerBevis` afviser at gå baglæns
 * eller springe over, så det her kun tegner, hvad `udfordring.phase` siger.
 * Genindlæser man midt i det, står man præcis samme sted.
 *
 * Kameraet er `<input capture>` frem for getUserMedia. Det giver telefonens
 * eget kamera med det samme, uden tilladelsesdialog vi selv skal håndtere —
 * og på en computer bliver det en filvælger, så det kan afprøves uden mobil.
 */

/** Nedtællingen opdateres hvert sekund. */
const TIK_MS = 1000;

export function SladeshOvertagelse({
  udfordring,
  onMinimer,
  onAfgjort,
}: {
  udfordring: Doc<"sladeshChallenges">;
  onMinimer: () => void;
  /**
   * Kaldes når udfordringen er afgjort. Uden den ville skærmen bare
   * FORSVINDE i det øjeblik queryen holder op med at returnere udfordringen
   * — og man ville stå tilbage uden at vide, om det gik godt.
   */
  onAfgjort: (besked: string) => void;
}) {
  const genererUploadUrl = useMutation(api.sladesh.genererUploadUrl);
  const registrerBevis = useMutation(api.sladesh.registrerBevis);
  const afslut = useMutation(api.sladesh.afslutSladesh);
  const opgiv = useMutation(api.sladesh.opgivSladesh);

  const tilbage = useNedtaelling(udfordring.deadlineAt);
  const [arbejder, setArbejder] = useState(false);
  const [fejl, setFejl] = useState<string | undefined>();
  const [spoergerOmOpgiv, setSpoergerOmOpgiv] = useState(false);
  const filInput = useRef<HTMLInputElement>(null);
  const ventetFase = useRef<"filled_captured" | "empty_captured">(
    "filled_captured",
  );

  /*
   * Telefonen banker, når skærmen overtages.
   *
   * Tom afhængighedsliste, altså KUN ved montering. Overtagelsen monteres i
   * det øjeblik, udfordringen lander (se `jegErModtager` i App.tsx), og
   * afmonteres når man minimerer — så ét stød per gang, ikke ét per
   * fasetryk. Kun Android; se haptik.ts.
   */
  useEffect(() => {
    slag();
  }, []);

  const koer = async (handling: () => Promise<unknown>) => {
    if (arbejder) return;
    setArbejder(true);
    setFejl(undefined);
    try {
      await handling();
    } catch (error) {
      setFejl(fejltekst(error));
    } finally {
      setArbejder(false);
    }
  };

  /** Åbner kameraet. Selve uploaden sker, når filen kommer tilbage. */
  const tagBillede = (fase: "filled_captured" | "empty_captured") => {
    ventetFase.current = fase;
    filInput.current?.click();
  };

  const modtagBillede = async (fil: File | undefined) => {
    if (fil === undefined) return;

    await koer(async () => {
      // Convex' to-trins upload: engangs-URL, POST bytes, gem id'et.
      const uploadUrl = await genererUploadUrl({});
      const svar = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": fil.type },
        body: fil,
      });
      if (!svar.ok) throw new Error("upload");

      const { storageId } = (await svar.json()) as {
        storageId: Id<"_storage">;
      };

      await registrerBevis({
        challengeId: udfordring._id,
        phase: ventetFase.current,
        storageId,
      });
    });
  };

  const udloebet = tilbage <= 0;

  /*
   * Hvor meget af ringen der er TILBAGE, ikke hvor meget der er gået.
   *
   * En fremdriftsring fyldes normalt op mod et mål. Her tælles der ned, så
   * buen skal krympe: det er den tomme bane, der vokser, og det er dét, man
   * skal blive utilpas af.
   */
  const andelTilbage = Math.min(Math.max(tilbage / SLADESH_TIME_LIMIT_MS, 0), 1);

  return (
    <div className="overtagelse">
      <input
        ref={filInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          void modtagBillede(event.target.files?.[0]);
          // Nulstil, så det samme billede kan vælges igen efter en fejl.
          event.target.value = "";
        }}
      />

      <div className="overtagelsestop">
        <button className="minimer" onClick={onMinimer} aria-label="Minimér">
          ▾
        </button>
        {/* Uret som en RING, der tømmes. Et tal, der tæller ned, læses;
            en ring, der løber tom, mærkes — og det er dét, de ti minutter
            skal føles som. Tallet står stadig inde i den: man skal kunne
            se, at der er halvandet minut tilbage, ikke bare at der er lidt. */}
        <div className={udloebet ? "urring udloebet" : "urring"}>
          <Fremdriftsring
            andel={andelTilbage}
            stoerrelse={UR_STOERRELSE}
            tykkelse={UR_TYKKELSE}
            farve="var(--urfarve)"
            srLabel={`${formatUr(tilbage)} tilbage`}
          >
            <span className="ringtal">{formatUr(tilbage)}</span>
          </Fremdriftsring>
        </div>
      </div>

      <div className="overtagelsesindhold">
        <div className="stortikon">🍺</div>
        <h1>{udfordring.senderName} har sladeshet dig</h1>

        {udloebet ? (
          <p className="under">
            Tiden er løbet ud. Den er talt som fejlet.
          </p>
        ) : (
          <Trin
            fase={udfordring.phase}
            arbejder={arbejder}
            onKlar={() =>
              void koer(() =>
                registrerBevis({
                  challengeId: udfordring._id,
                  phase: "awaiting_filled",
                }),
              )
            }
            onFyldt={() => tagBillede("filled_captured")}
            onDrukket={() =>
              void koer(() =>
                registrerBevis({
                  challengeId: udfordring._id,
                  phase: "awaiting_empty",
                }),
              )
            }
            onTom={() => tagBillede("empty_captured")}
            onGennemfoer={() =>
              void koer(async () => {
                await afslut({ challengeId: udfordring._id });
                onAfgjort("Sladesh gennemført 🍺");
              })
            }
          />
        )}

        {fejl !== undefined && <p className="fejl">{fejl}</p>}
      </div>

      <div className="overtagelsesbund">
        {udloebet ? (
          <button className="knap" onClick={onMinimer}>
            Luk
          </button>
        ) : spoergerOmOpgiv ? (
          <>
            <p className="hjaelp">
              Den tæller som fejlet, og det kan ikke fortrydes.
            </p>
            <button
              className="knap fare"
              disabled={arbejder}
              onClick={() =>
                void koer(async () => {
                  await opgiv({ challengeId: udfordring._id });
                  onAfgjort("Sladesh opgivet");
                })
              }
            >
              Ja, jeg giver op
            </button>
            <button className="knap" onClick={() => setSpoergerOmOpgiv(false)}>
              Nej, jeg fortsætter
            </button>
          </>
        ) : (
          <button className="knap" onClick={() => setSpoergerOmOpgiv(true)}>
            Giv op
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Ét skridt ad gangen.
 *
 * Der står altid præcis én knap. Det er med vilje: man læser den her skærm
 * med en genstand i hånden og et ur, der tæller ned.
 */
function Trin({
  fase,
  arbejder,
  onKlar,
  onFyldt,
  onDrukket,
  onTom,
  onGennemfoer,
}: {
  fase: Doc<"sladeshChallenges">["phase"];
  arbejder: boolean;
  onKlar: () => void;
  onFyldt: () => void;
  onDrukket: () => void;
  onTom: () => void;
  onGennemfoer: () => void;
}) {
  switch (fase) {
    case "intro":
      return (
        <>
          <p className="under">Find en genstand. Du har 10 minutter.</p>
          <button className="knap primaer" disabled={arbejder} onClick={onKlar}>
            Jeg er klar
          </button>
        </>
      );

    case "awaiting_filled":
      return (
        <>
          <p className="under">Tag et billede af den fyldte genstand.</p>
          <button className="knap primaer" disabled={arbejder} onClick={onFyldt}>
            📷 Fyldt
          </button>
        </>
      );

    case "filled_captured":
      return (
        <>
          <p className="under">Så drikker du.</p>
          <button className="knap primaer" disabled={arbejder} onClick={onDrukket}>
            Jeg har drukket
          </button>
        </>
      );

    case "awaiting_empty":
      return (
        <>
          <p className="under">Tag et billede af den tomme.</p>
          <button className="knap primaer" disabled={arbejder} onClick={onTom}>
            📷 Tom
          </button>
        </>
      );

    case "empty_captured":
      return (
        <>
          <p className="under">Begge beviser er der.</p>
          <button
            className="knap primaer"
            disabled={arbejder}
            onClick={onGennemfoer}
          >
            Gennemfør
          </button>
        </>
      );

    default:
      // completed / failed. Serveren har afgjort den; queryen holder op med
      // at returnere den, og overtagelsen forsvinder af sig selv.
      return <p className="under">Afgjort.</p>;
  }
}

/**
 * Millisekunder tilbage, opdateret hvert sekund.
 *
 * Regnes hver gang FRA fristen frem for at tælle en tæller ned. Sover fanen
 * — hvilket den gør i en lomme — er tallet stadig rigtigt, når man kigger
 * igen.
 */
function useNedtaelling(deadlineAt: number): number {
  const [tilbage, setTilbage] = useState(() => deadlineAt - Date.now());

  useEffect(() => {
    const timer = setInterval(
      () => setTilbage(deadlineAt - Date.now()),
      TIK_MS,
    );
    return () => clearInterval(timer);
  }, [deadlineAt]);

  return tilbage;
}
