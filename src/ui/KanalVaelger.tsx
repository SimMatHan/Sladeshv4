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
 * Samme sted findes de to andre ting, man gør ved Kanaler: melde sig ind med
 * en kode, og oprette en ny.
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

  const [kode, setKode] = useState("");
  const [nytNavn, setNytNavn] = useState("");
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

  return (
    <Ark titel="Kanal" onLuk={onLuk}>
      <div className="arkgruppe">
        <h3>Dine kanaler</h3>
        {kanaler === undefined ? (
          <p className="hjaelp">Henter …</p>
        ) : (
          kanaler.map((kanal) => (
            <button
              key={kanal._id}
              className="knap"
              disabled={arbejder}
              onClick={() => void koer(() => setActive({ channelId: kanal._id }))}
            >
              {kanal._id === aktivId ? "✓ " : ""}
              {kanal.name}
              <span className="enhed">
                {" "}
                · {kanal.members.length}{" "}
                {kanal.members.length === 1 ? "medlem" : "medlemmer"}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="arkgruppe">
        <h3>Meld dig ind</h3>
        <input
          className="felt"
          value={kode}
          placeholder="Invitationskode"
          autoCapitalize="characters"
          onChange={(event) => setKode(event.target.value)}
        />
        <button
          className="knap primaer"
          style={{ marginTop: 9 }}
          disabled={arbejder || kode.trim().length === 0}
          onClick={() => void koer(() => joinKanal({ code: kode }))}
        >
          Meld mig ind
        </button>
      </div>

      <div className="arkgruppe">
        <h3>Opret en ny</h3>
        <input
          className="felt"
          value={nytNavn}
          placeholder="Navn på Kanalen"
          onChange={(event) => setNytNavn(event.target.value)}
        />
        <button
          className="knap"
          style={{ marginTop: 9 }}
          disabled={arbejder || nytNavn.trim().length === 0}
          onClick={() =>
            void koer(async () => {
              // Koden er invitationen. Den skal kunne siges højt i en bar, så
              // den er kort og uden tegn, der kan forveksles.
              const channelId = await createKanal({
                name: nytNavn.trim(),
                code: nyKode(),
              });
              await setActive({ channelId });
            })
          }
        >
          Opret Kanal
        </button>
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
