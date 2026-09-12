import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { fejltekst } from "../lib/visning";
import { Ark } from "./Ark";

/**
 * Kanalvælgeren.
 *
 * Åbnes fra `.kanalskift` i toppen — knappen ved siden af kanalnavnet,
 * altså lige ved det, den ændrer. I den gamle app lå det samme valg under
 * More → Channels, tre tryk væk fra den stilling, det bestemmer indholdet
 * af. Det er formentlig den største enkeltkilde til "hvorfor kan jeg ikke
 * se nogen".
 *
 * ## Arket gør nu ÉN ting
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
 * ## At oprette en Kanal hører ikke til her
 *
 * "Opret ny" er FJERNET efter ønske. Det var den sjældneste handling i
 * appen placeret ved siden af den hyppigste, og de to ligner hinanden på
 * en telefon: et felt og en knap. Skrev man en invitationskode i det
 * forkerte af de to, oprettede man en Kanal, der hed "SLA-4821".
 *
 * Kanaler oprettes nu to steder, og begge er rigtige: i førstegangsforløbet
 * (Onboarding.tsx), hvor den første Kanal skal opstå et sted, og i Admin
 * for dem, der bestyrer dem. En almindelig bruger, der ALLEREDE er med i
 * noget, melder sig ind med en kode.
 *
 * ## Koden står på hver Kanal
 *
 * Den var kun synlig i Admin. Oprettede en bruger en Kanal i
 * førstegangsforløbet, blev der genereret en invitationskode, som brugeren
 * ALDRIG fik at se — man havde altså en Kanal, man ikke kunne invitere
 * nogen til. Den står nu på hver række, hvor den kan læses højt.
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

  const [kode, setKode] = useState("");
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

  const klar = kode.trim().length > 0 && !arbejder;

  const udfoer = () => {
    if (!klar) return;
    void koer(() => joinKanal({ code: kode.trim() }));
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

      <div className="arkgruppe">
        <h3>Meld dig ind i en Kanal</h3>
        <div className="kanalfelt">
          <input
            className="felt"
            value={kode}
            placeholder="Invitationskode"
            autoCapitalize="characters"
            aria-label="Invitationskode"
            onChange={(event) => setKode(event.target.value)}
            // Enter gør det samme som knappen. Man skriver en kode af med
            // tommelfingeren og skal ikke skulle finde en knap bagefter.
            onKeyDown={(event) => {
              if (event.key === "Enter") udfoer();
            }}
          />
          <button className="knap primaer" disabled={!klar} onClick={udfoer}>
            Meld mig ind
          </button>
          <p className="hjaelp">
            Koden får du af en, der allerede er med — den står på hver Kanal
            herover.
          </p>
        </div>
      </div>

      {fejl !== undefined && <p className="fejl">{fejl}</p>}
    </Ark>
  );
}
