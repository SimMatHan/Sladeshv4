import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AVATAR_COLORS } from "../../convex/constants";
import { fejltekst } from "../lib/visning";
import { Ark } from "./Ark";
import { usePush } from "./usePush";
import { ProfilFelter, type Profilvaerdier } from "./ProfilFelter";

/**
 * Indstillinger.
 *
 * Åbnes fra Mig. Et ark som alt andet i appen — man går ikke ind i
 * indstillingerne og skal finde vej tilbage.
 *
 * Tre ting: hvem du er, om din promille skal regnes, og om du vil have
 * notifikationer. Tema er fortsat ikke porteret — det styres af admin, ikke
 * herfra, se docs/kanaltemaer.md.
 */
export function Indstillinger({
  mig,
  onLuk,
}: {
  mig: Doc<"users">;
  onLuk: () => void;
}) {
  const opdaterProfil = useMutation(api.users.opdaterProfil);
  const setPromille = useMutation(api.promille.setPromilleIndstilling);
  const minPromille = useQuery(api.promille.getMinPromille, {});

  // Notifikationer har egen tilstand og egen fejl — aktivering rører
  // browserens tilladelsesdialog i SAMME klik, brugeren trykker på, og kan
  // derfor ikke vente på det fælles "Gem". Logikken deles med bjælken i
  // toppen af appen; se usePush.ts.
  const push = usePush();

  const [profil, setProfil] = useState<Profilvaerdier>({
    displayName: mig.displayName,
    emoji: mig.emoji,
    avatarColor: mig.avatarColor ?? AVATAR_COLORS[0].name,
  });

  // Vægten holdes som tekst, mens man skriver. Et talfelt bundet til et tal
  // kan ikke stå tomt undervejs, og så kan man ikke slette "7" for at skrive
  // "82".
  const [vaegt, setVaegt] = useState(
    mig.promille?.weight !== undefined ? String(mig.promille.weight) : "",
  );
  const [koen, setKoen] = useState<"male" | "female" | undefined>(
    mig.promille?.gender,
  );
  const [promilleTil, setPromilleTil] = useState(mig.promille?.enabled === true);

  const [arbejder, setArbejder] = useState(false);
  const [gemt, setGemt] = useState(false);
  const [fejl, setFejl] = useState<string | undefined>();

  const gem = async () => {
    setArbejder(true);
    setFejl(undefined);

    try {
      await opdaterProfil({
        displayName: profil.displayName,
        // `null` rydder feltet; `undefined` ville lade det stå.
        emoji: profil.emoji ?? null,
        avatarColor: profil.avatarColor,
      });

      await setPromille({
        enabled: promilleTil,
        gender: koen ?? null,
        weight: vaegt.trim() === "" ? null : Number(vaegt.replace(",", ".")),
      });

      setGemt(true);
      // Arket lukker ikke af sig selv. Man vil som regel skrue på flere ting,
      // og at blive smidt ud efter hver ændring er irriterende.
      setTimeout(() => setGemt(false), 2500);
    } catch (error) {
      setFejl(fejltekst(error));
    } finally {
      setArbejder(false);
    }
  };

  const manglerNoget =
    promilleTil && (koen === undefined || vaegt.trim() === "");

  return (
    <Ark titel="Indstillinger" onLuk={onLuk}>
      <ProfilFelter vaerdier={profil} onAendret={setProfil} />

      <div className="arkgruppe">
        <h3>Promille</h3>

        <button
          className="knap"
          aria-pressed={promilleTil}
          onClick={() => setPromilleTil(!promilleTil)}
        >
          {promilleTil ? "✓ Regn min promille" : "Regn min promille"}
        </button>

        {promilleTil && (
          <>
            {/*
             * Ingen margin her. `.segmenter` bærer selv 16 over og 20 under,
             * og de to rå tal, der stod her og på feltet nedenfor, gjorde
             * ingen af delene rigtigt: 12 skrev 16 ned til et tal, der ikke
             * er på skalaen, og feltets 9 var helt død — nabomarginer
             * lægger sig ikke sammen, så segmentrækkens 20 vandt alligevel.
             */}
            <div className="segmenter">
              {(
                [
                  ["male", "Mand"],
                  ["female", "Kvinde"],
                ] as const
              ).map(([id, etiket]) => (
                <button
                  key={id}
                  className="segment"
                  aria-selected={koen === id}
                  onClick={() => setKoen(id)}
                >
                  {etiket}
                </button>
              ))}
            </div>

            <input
              className="felt"
              inputMode="decimal"
              value={vaegt}
              placeholder="Vægt i kg"
              onChange={(event) => setVaegt(event.target.value)}
            />

            {/* Widmark kræver begge dele. Uden dem regnes der ikke — og så
                skal det stå her, ikke som en tom kolonne på stillingen. */}
            {manglerNoget && (
              <p className="hjaelp">
                Både køn og vægt skal udfyldes, før promillen kan regnes.
              </p>
            )}

            <p className="hjaelp">
              Tallet er et estimat til underholdning. Det siger ingenting om,
              hvorvidt du må køre bil.
            </p>

            {minPromille?.konfigureret === true && (
              <p className="hjaelp">
                Din promille vises også på stillingen for Kanalens medlemmer.
              </p>
            )}
          </>
        )}
      </div>

      {/* Tilstandene og deres rækkefølge er forklaret i usePush.ts. Her
          er de bare oversat til det, brugeren skal gøre — og de fire, der
          ikke er en knap, siger hver især HVORFOR, i stedet for at vise en
          knap, der ville fejle. */}
      <div className="arkgruppe">
        <h3>Notifikationer</h3>

        {push.status === "ukendt" ? (
          <p className="midtstillet">Henter …</p>
        ) : push.status === "iosudenhjem" ? (
          <p className="hjaelp">
            På iPhone virker notifikationer kun, når appen er føjet til
            hjemmeskærmen. Tryk på Del-knappen i Safari og vælg “Føj til
            hjemmeskærm” — så kan du slå dem til herfra.
          </p>
        ) : push.status === "ikkestoettet" ? (
          <p className="hjaelp">Denne browser understøtter ikke notifikationer.</p>
        ) : push.status === "afvist" ? (
          <p className="hjaelp">
            Du har sagt nej til notifikationer i browseren, og den husker
            det — appen kan ikke spørge igen. Du kan give lov igen under
            indstillingerne for dette websted i din browser.
          </p>
        ) : push.status === "serverklarikke" ? (
          <p className="hjaelp">Notifikationer er ikke sat op på serveren endnu.</p>
        ) : (
          <>
            <button
              className="knap"
              aria-pressed={push.status === "til"}
              disabled={push.arbejder}
              onClick={() => void push.skift()}
            >
              {push.status === "til"
                ? "✓ Notifikationer er slået til"
                : "Slå notifikationer til"}
            </button>
            <p className="hjaelp">
              Nye beskeder i chatten, en Sladesh på vej til dig, og når nogen
              i Kanalen går ud i aften.
            </p>
          </>
        )}
        {push.fejl !== undefined && <p className="fejl">{push.fejl}</p>}
      </div>

      <div className="arkgruppe">
        <button
          className="knap primaer"
          disabled={arbejder || profil.displayName.trim().length === 0}
          onClick={() => void gem()}
        >
          {gemt ? "Gemt ✓" : "Gem"}
        </button>
        {fejl !== undefined && <p className="fejl">{fejl}</p>}
      </div>
    </Ark>
  );
}
