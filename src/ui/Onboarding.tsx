import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AVATAR_COLORS } from "../../convex/constants";
import { fejltekst } from "../lib/visning";
import { ProfilFelter, type Profilvaerdier } from "./ProfilFelter";

/**
 * Første gang.
 *
 * R5 i docs/brugerrejser.md. To trin, og kun to:
 *
 *   1. Find din Kanal — uden en er der ingenting at se.
 *   2. Hvem er du — kan springes over.
 *
 * Kanalen kommer først, fordi den er det eneste, der ER nødvendigt. Navn og
 * avatar kan man rette bagefter i indstillingerne, og at spærre en ny bruger
 * ude af appen, indtil hun har valgt en emoji, er ikke en god handel.
 *
 * Vises KUN til nye brugere: `onboardingCompleted !== true` OG ingen Kanaler.
 * De 32 migrerede brugere har begge dele på plads og ser aldrig det her —
 * de skal ikke igennem et velkomstforløb til en app, de har brugt i årevis.
 */
export function Onboarding({ mig }: { mig: Doc<"users"> }) {
  const kanaler = useQuery(api.kanaler.getMineKanaler, {});
  const joinKanal = useMutation(api.kanaler.joinKanal);
  const createKanal = useMutation(api.kanaler.createKanal);
  const setActiveChannel = useMutation(api.users.setActiveChannel);
  const opdaterProfil = useMutation(api.users.opdaterProfil);

  const [trin, setTrin] = useState<1 | 2>(1);
  const [kode, setKode] = useState("");
  const [nytNavn, setNytNavn] = useState("");
  const [profil, setProfil] = useState<Profilvaerdier>({
    displayName: mig.displayName,
    emoji: mig.emoji,
    avatarColor: mig.avatarColor ?? AVATAR_COLORS[0].name,
  });
  const [arbejder, setArbejder] = useState(false);
  const [fejl, setFejl] = useState<string | undefined>();

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

  const faerdig = (medProfil: boolean) =>
    void koer(async () => {
      if (medProfil) {
        await opdaterProfil({
          displayName: profil.displayName,
          emoji: profil.emoji ?? null,
          avatarColor: profil.avatarColor,
          onboardingCompleted: true,
        });
      } else {
        // Springer man over, sættes flaget alligevel — ellers ville forløbet
        // møde brugeren igen ved næste login.
        await opdaterProfil({ onboardingCompleted: true });
      }
    });

  if (trin === 1) {
    return (
      <div className="onboarding">
        <div className="onboardingindhold">
          <div className="stortikon">🍺</div>
          <h1>Velkommen til SladeshApp</h1>
          <p className="under">
            Alt i appen foregår i en Kanal — stillingen, chatten og kortet.
            Find din, så er du i gang.
          </p>

          {kanaler !== undefined && kanaler.length > 0 && (
            <div className="arkgruppe">
              <h3>Dine kanaler</h3>
              {kanaler.map((kanal) => (
                <button
                  key={kanal._id}
                  className="knap primaer"
                  disabled={arbejder}
                  onClick={() =>
                    void koer(async () => {
                      await setActiveChannel({ channelId: kanal._id });
                      setTrin(2);
                    })
                  }
                >
                  {kanal.name}
                </button>
              ))}
            </div>
          )}

          <div className="arkgruppe">
            <h3>Har du en kode?</h3>
            <input
              className="felt"
              value={kode}
              placeholder="Invitationskode"
              autoCapitalize="characters"
              onChange={(event) => setKode(event.target.value)}
            />
            <button
              className="knap primaer"
              disabled={arbejder || kode.trim().length === 0}
              onClick={() =>
                void koer(async () => {
                  const channelId = await joinKanal({ code: kode });
                  await setActiveChannel({ channelId });
                  setTrin(2);
                })
              }
            >
              Meld mig ind
            </button>
          </div>

          <div className="arkgruppe">
            <h3>Eller start din egen</h3>
            <input
              className="felt"
              value={nytNavn}
              placeholder="Navn på Kanalen"
              onChange={(event) => setNytNavn(event.target.value)}
            />
            <button
              className="knap"
              disabled={arbejder || nytNavn.trim().length === 0}
              onClick={() =>
                void koer(async () => {
                  const channelId = await createKanal({
                    name: nytNavn.trim(),
                    code: nyKode(),
                  });
                  await setActiveChannel({ channelId });
                  setTrin(2);
                })
              }
            >
              Opret Kanal
            </button>
          </div>

          {fejl !== undefined && <p className="fejl">{fejl}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding">
      <div className="onboardingindhold">
        <h1>Hvem er du?</h1>
        <p className="under">Du kan altid ændre det i indstillingerne.</p>

        <ProfilFelter vaerdier={profil} onAendret={setProfil} />

        <div className="arkgruppe">
          <button
            className="knap primaer"
            disabled={arbejder || profil.displayName.trim().length === 0}
            onClick={() => faerdig(true)}
          >
            Kom i gang
          </button>
          <button className="knap" disabled={arbejder} onClick={() => faerdig(false)}>
            Spring over
          </button>
        </div>

        {fejl !== undefined && <p className="fejl">{fejl}</p>}
      </div>
    </div>
  );
}

/**
 * Invitationskoden til en Kanal, man opretter under onboarding.
 *
 * `SLA-` og fire cifre, fordi koden læses højt og tastes af med en tommel:
 * fire cifre kan siges i ét åndedrag, og præfikset gør, at man kan se på en
 * streng, at den ER en kanalkode.
 *
 * Den stod magen til i KanalVælgeren, indtil "Opret ny Kanal" blev taget ud
 * derfra — nu findes den kun her, og onboarding er det eneste sted i appen,
 * hvor en almindelig bruger kan lave en Kanal.
 *
 * Ingen kollisionskontrol. 9.000 muligheder er ikke mange, men koden er ikke
 * en nøgle: `joinKanal` slår op på den, og to Kanaler med samme kode ville
 * være et problem for admin at rydde op i, ikke en sikkerhedsbrist. Skal det
 * gøres ordentligt, hører det hjemme i `convex/kanaler.ts` som en kontrol i
 * `createKanal`, ikke som flere cifre her.
 */
function nyKode(): string {
  return `SLA-${Math.floor(1000 + Math.random() * 9000)}`;
}
