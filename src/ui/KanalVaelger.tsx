import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { fejltekst } from "../lib/visning";
import { Ark } from "./Ark";

/**
 * Kanalvælgeren.
 *
 * Åbnes fra kanalnavnet i toppen — altså fra en knap, der står OVER det, den
 * ændrer. I den gamle app lå det samme valg under More → Channels, tre tryk
 * væk fra den stilling, det bestemmer indholdet af. Det er formentlig den
 * største enkeltkilde til "hvorfor kan jeg ikke se nogen".
 *
 * ## Hvorfor arket ser anderledes ud end før
 *
 * Det viste tre afsnit på én gang: dine Kanaler, "Meld dig ind" med et felt
 * og en knap, og "Opret en ny" med endnu et felt og endnu en knap. To
 * tekstfelter og tre knapper — for noget, der ni gange ud af ti er "tryk på
 * den Kanal, jeg vil se".
 *
 * Værre: Kanalerne var tegnet som `.knap`, altså den samme grå omridsknap som
 * "Log ud" og "Opret Kanal". Der var ingen forskel at se på et STED, man kan
 * gå hen, og en HANDLING, der gør noget.
 *
 * Nu er listen listen. De to andre ting deler ét felt og én knap bag en
 * segmentvælger, og de fylder dermed en tredjedel af, hvad de gjorde.
 *
 * ## Koden står nu på hver Kanal
 *
 * Den var kun synlig i Admin. Oprettede en almindelig bruger en Kanal, blev
 * der genereret en invitationskode, som brugeren ALDRIG fik at se — man
 * havde altså en Kanal, man ikke kunne invitere nogen til. Den står nu på
 * hver række, hvor den kan læses højt.
 */
export function KanalVaelger({
  aktivId,
  onLuk,
}: {
  aktivId: Id<"kanaler"> | undefined;
  onLuk: () => void;
}) {
  const kanaler = useQuery(api.kanaler.getMineKanaler, {});
  const setActive = useMutation(api.users.setActiveChannel);
  const joinKanal = useMutation(api.kanaler.joinKanal);
  const createKanal = useMutation(api.kanaler.createKanal);

  const [tilstand, setTilstand] = useState<"meld" | "opret">("meld");
  const [tekst, setTekst] = useState("");
  const [arbejder, setArbejder] = useState(false);
  const [fejl, setFejl] = useState<string | undefined>();

  const koer = async (handling: () => Promise<unknown>) => {
    if (arbejder) return;
    setArbejder(true);
    setFejl(undefined);
    try {
      await handling();
      onLuk();
    } catch (error) {
      setFejl(fejltekst(error));
      setArbejder(false);
    }
  };

  const skiftTilstand = (ny: "meld" | "opret") => {
    setTilstand(ny);
    // Feltet deles af de to. En invitationskode, der bliver stående som
    // forslag til et kanalnavn, er værre end et tomt felt.
    setTekst("");
    setFejl(undefined);
  };

  const klar = tekst.trim().length > 0 && !arbejder;

  const udfoer = () => {
    if (!klar) return;
    if (tilstand === "meld") {
      void koer(() => joinKanal({ code: tekst.trim() }));
      return;
    }
    void koer(async () => {
      // Koden er invitationen. Den skal kunne siges højt i en bar, så
      // den er kort og uden tegn, der kan forveksles.
      const channelId = await createKanal({
        name: tekst.trim(),
        code: nyKode(),
      });
      await setActive({ channelId });
    });
  };

  return (
    <Ark titel="Kanal" onLuk={onLuk}>
      {kanaler === undefined ? (
        <p className="midtstillet">Henter …</p>
      ) : (
        <div className="kanalliste">
          {kanaler.map((kanal) => {
            const aktiv = kanal._id === aktivId;
            return (
              <button
                key={kanal._id}
                className={aktiv ? "kanalrk aktiv" : "kanalrk"}
                // Den aktive er ikke en knap, der gør noget — den er dér,
                // man allerede er. `aria-current` siger det, uden at
                // skærmlæseren skal gætte det ud fra fluebenet.
                aria-current={aktiv ? "true" : undefined}
                disabled={arbejder}
                onClick={() => {
                  if (aktiv) onLuk();
                  else void koer(() => setActive({ channelId: kanal._id }));
                }}
              >
                <span className="kanalmidt">
                  <span className="titel">{kanal.name}</span>
                  <span className="hjaelp">
                    {kanal.members.length}{" "}
                    {kanal.members.length === 1 ? "medlem" : "medlemmer"}
                    {kanal.code !== undefined && ` · ${kanal.code}`}
                  </span>
                </span>
                {aktiv && (
                  <span className="kanalflueben" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Ét felt og én knap til begge ting. De to afsnit havde hver sit felt
          og sin knap, og de stod åbne samtidig — dobbelt så meget at læse
          forbi for at komme til listen ovenfor. */}
      <div className="arkgruppe kanaltilfoej">
        <div className="segmenter">
          <button
            className="segment"
            aria-selected={tilstand === "meld"}
            onClick={() => skiftTilstand("meld")}
          >
            Meld dig ind
          </button>
          <button
            className="segment"
            aria-selected={tilstand === "opret"}
            onClick={() => skiftTilstand("opret")}
          >
            Opret ny
          </button>
        </div>

        <div className="kanalfelt">
          <input
            className="felt"
            value={tekst}
            placeholder={tilstand === "meld" ? "Invitationskode" : "Navn på Kanalen"}
            autoCapitalize={tilstand === "meld" ? "characters" : "sentences"}
            aria-label={tilstand === "meld" ? "Invitationskode" : "Navn på Kanalen"}
            onChange={(event) => setTekst(event.target.value)}
            // Enter gør det samme som knappen. Man skriver en kode af med
            // tommelfingeren og skal ikke skulle finde en knap bagefter.
            onKeyDown={(event) => {
              if (event.key === "Enter") udfoer();
            }}
          />
          <button className="knap primaer" disabled={!klar} onClick={udfoer}>
            {tilstand === "meld" ? "Meld mig ind" : "Opret"}
          </button>
        </div>
      </div>

      {fejl !== undefined && <p className="fejl">{fejl}</p>}
    </Ark>
  );
}

/**
 * En invitationskode på formen `SLA-4821`.
 *
 * Kun cifre efter bindestregen: bogstaver som O og 0, eller I og 1, bliver
 * hørt forkert, når koden siges videre til den næste ved bordet.
 */
function nyKode(): string {
  const tal = Math.floor(1000 + Math.random() * 9000);
  return `SLA-${tal}`;
}
