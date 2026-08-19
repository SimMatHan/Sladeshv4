import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AVATAR_COLORS } from "../../convex/constants";
import { fejltekst } from "../lib/visning";
import { Ark } from "./Ark";
import { ProfilFelter, type Profilvaerdier } from "./ProfilFelter";

/**
 * Indstillinger.
 *
 * Åbnes fra Mig. Et ark som alt andet i appen — man går ikke ind i
 * indstillingerne og skal finde vej tilbage.
 *
 * To ting: hvem du er, og om din promille skal regnes. Resten af den gamle
 * apps indstillingsside var tema (ikke porteret) og push (ikke bygget endnu).
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
            <div className="segmenter" style={{ marginTop: 12 }}>
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
              style={{ marginTop: 9 }}
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
