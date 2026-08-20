import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { DRINK_CATEGORIES } from "../../convex/constants";
import { STANDARD_KATALOG } from "../../convex/drikkekatalog";
import { fejltekst } from "../lib/visning";
import { Ark } from "./Ark";

/**
 * Admin.
 *
 * Åbnes fra Mig, og kun for admins. Serveren er den, der bestemmer: hver
 * mutation herinde er spærret af `requireAdmin`, så knapperne er en
 * bekvemmelighed, ikke adgangskontrollen. Skjuler man dem, sparer man en
 * bruger for at trykke på noget, der alligevel ville blive afvist.
 *
 * Der er ÉN ting at styre herfra: kataloget over drikkevarianter. Det er det
 * eneste indhold i appen, som ikke kommer af sig selv fra brugerne — og
 * uden det er ( + )-arket tomt.
 *
 * Den gamle app havde en admin-portal med flere sider (AdminDrinks,
 * AdminUsers, AdminChannels). De andre er bevidst ikke bygget her: brugere og
 * Kanaler styrer sig selv, og de få indgreb, der kan blive brug for, hører
 * hjemme i Convex-dashboardet frem for i en skærm, ingen ser mere end to
 * gange om året.
 */
export function Admin({ onLuk }: { onLuk: () => void }) {
  const katalog = useQuery(api.drinkVariations.getDrinkVariations, {});
  const indlaes = useMutation(api.drinkVariations.indlaesStandardkatalog);
  const opret = useMutation(api.drinkVariations.opretVariant);
  const slet = useMutation(api.drinkVariations.sletVariant);

  const [arbejder, setArbejder] = useState(false);
  const [besked, setBesked] = useState<string | undefined>();
  const [fejl, setFejl] = useState<string | undefined>();

  // Ny variant
  const [navn, setNavn] = useState("");
  const [kategori, setKategori] = useState<string>(DRINK_CATEGORIES[0].id);
  const [beskrivelse, setBeskrivelse] = useState("");

  /** Hvilken variant der er ved at blive slettet. Slet spørger altid. */
  const [sletter, setSletter] = useState<Id<"drinkVariations"> | undefined>();

  const efterKategori = useMemo(() => {
    const kort = new Map<string, Doc<"drinkVariations">[]>();
    for (const variant of katalog ?? []) {
      const liste = kort.get(variant.categoryId);
      if (liste === undefined) kort.set(variant.categoryId, [variant]);
      else liste.push(variant);
    }
    return kort;
  }, [katalog]);

  /**
   * Hvor mange af standardkataloget der mangler.
   *
   * Regnet i klienten, så knappen kan sige hvad den gør, FØR man trykker.
   * Serveren regner det samme igen — det er den, der har det sidste ord.
   */
  const manglerFraStandard = useMemo(() => {
    if (katalog === undefined) return undefined;
    const findes = new Set(katalog.map((v) => `${v.categoryId}::${v.name}`));
    return STANDARD_KATALOG.filter(
      (v) => !findes.has(`${v.categoryId}::${v.name}`),
    ).length;
  }, [katalog]);

  const koer = async (handling: () => Promise<string>) => {
    setArbejder(true);
    setFejl(undefined);
    setBesked(undefined);
    try {
      setBesked(await handling());
    } catch (error) {
      setFejl(fejltekst(error));
    } finally {
      setArbejder(false);
    }
  };

  const indlaesKatalog = () =>
    koer(async () => {
      const { oprettet, sprunget } = await indlaes({});
      return oprettet === 0
        ? `Alt var der i forvejen — ${sprunget} sprunget over.`
        : `${oprettet} tilføjet, ${sprunget} fandtes i forvejen.`;
    });

  const opretVariant = () =>
    koer(async () => {
      await opret({
        name: navn.trim(),
        categoryId: kategori,
        description: beskrivelse.trim() === "" ? undefined : beskrivelse.trim(),
      });
      const tilfoejet = navn.trim();
      setNavn("");
      setBeskrivelse("");
      return `"${tilfoejet}" tilføjet.`;
    });

  const sletVariant = (variant: Doc<"drinkVariations">) =>
    koer(async () => {
      await slet({ variationId: variant._id });
      setSletter(undefined);
      return `"${variant.name}" slettet. Historikken er urørt.`;
    });

  return (
    <Ark titel="Admin" onLuk={onLuk}>
      <div className="arkgruppe">
        <h3>Kataloget</h3>
        <p className="hjaelp" style={{ marginTop: 0 }}>
          {katalog === undefined
            ? "Henter …"
            : `${katalog.length} drikkevarianter i deploymentet. ` +
              (manglerFraStandard === 0
                ? "Hele standardkataloget er inde."
                : `${manglerFraStandard} af standardkataloget mangler.`)}
        </p>

        <button
          className="knap primaer"
          disabled={arbejder || katalog === undefined || manglerFraStandard === 0}
          onClick={() => void indlaesKatalog()}
        >
          Indlæs standardkataloget ({STANDARD_KATALOG.length})
        </button>
        <p className="hjaelp">
          Tilføjer kun det, der mangler. Sletter aldrig noget, og retter ikke
          beskrivelser, nogen har ændret her.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Tilføj en variant</h3>

        <input
          className="felt"
          value={navn}
          maxLength={60}
          placeholder="Navn, fx Tuborg Classic"
          onChange={(event) => setNavn(event.target.value)}
        />

        <div className="chips" style={{ margin: "9px 0" }}>
          {DRINK_CATEGORIES.map((valg) => (
            <button
              key={valg.id}
              className="chip"
              aria-pressed={kategori === valg.id}
              onClick={() => setKategori(valg.id)}
            >
              <span className="emoji">{valg.emoji}</span>
              {valg.label}
            </button>
          ))}
        </div>

        <input
          className="felt"
          value={beskrivelse}
          maxLength={200}
          placeholder="Beskrivelse (valgfri)"
          onChange={(event) => setBeskrivelse(event.target.value)}
        />

        <button
          className="knap"
          style={{ marginTop: 9 }}
          disabled={arbejder || navn.trim() === ""}
          onClick={() => void opretVariant()}
        >
          Tilføj
        </button>
      </div>

      {besked !== undefined && <p className="hjaelp">{besked}</p>}
      {fejl !== undefined && <p className="fejl">{fejl}</p>}

      {DRINK_CATEGORIES.map((valg) => {
        const varianter = efterKategori.get(valg.id) ?? [];
        if (varianter.length === 0) return null;

        return (
          <div className="arkgruppe" key={valg.id}>
            <h3>
              {valg.emoji} {valg.label} · {varianter.length}
            </h3>
            <div className="varianter">
              {varianter.map((variant) => (
                <div className="variant" key={variant._id}>
                  <span className="midt">
                    <span className="navn">{variant.name}</span>
                    <span className="under">
                      {variant.description ?? "Ingen beskrivelse"}
                    </span>
                  </span>

                  {/* Slet spørger altid. En variant, der forsvinder fra
                      kataloget, er ikke til at få tilbage uden at taste den
                      ind igen — men historikken rører den ikke. */}
                  {sletter === variant._id ? (
                    <span className="handlinger">
                      <button
                        className="chip fare"
                        disabled={arbejder}
                        onClick={() => void sletVariant(variant)}
                      >
                        Slet
                      </button>
                      <button
                        className="chip"
                        onClick={() => setSletter(undefined)}
                      >
                        Fortryd
                      </button>
                    </span>
                  ) : (
                    <button
                      className="chip"
                      aria-label={`Slet ${variant.name}`}
                      onClick={() => setSletter(variant._id)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </Ark>
  );
}
