import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { DRINK_CATEGORIES } from "../../convex/constants";
import { fejltekst, genstande, klokken } from "../lib/visning";
import { Ark } from "./Ark";
import { Avatar } from "./Avatar";
import { Faner } from "./Faner";

/**
 * Admin.
 *
 * Den gamle app havde syv faner. Alle syv er nu dækket, plus Beacons og Tema,
 * som lå spredt i andre skærme:
 *
 * - **Oversigt** viste hårdkodede tal — "24 brugere online", "156 drinks i
 *   dag", "2.450 kr." — under kommentaren "Mock data - would come from
 *   Firestore in production". Der var intet at migrere; tallene her er de
 *   rigtige og kommer fra `stats.getAdminStats`.
 * - **Broadcast** og **Donorer** har fået deres tabeller. Broadcasts vises
 *   som en bjælke i appen, ikke som push — den kanal findes stadig ikke.
 * - **Dev Tools** er delt op: nulstillingerne ligger under Brugere, og
 *   Ballade-temaet har sin egen fane. Sladesh-simuleringen er IKKE med — den
 *   skrev direkte i Firestore og hører til fase 4 sammen med resten af
 *   Sladesh-flowet.
 *
 * Adgangen er ægte nu. Den gamle app tjekkede `isAdminEmail(user.email)` mod
 * en hårdkodet liste I KLIENTEN — den kunne omgås ved at redigere bundtet.
 * Her er `isAdmin` et felt på brugeren, og HVER mutation kalder `requireAdmin`
 * på serveren. Tjekket nedenfor skjuler kun knapperne; det er ikke det, der
 * beskytter noget.
 */
type Omraade =
  | "oversigt"
  | "drikkevarer"
  | "brugere"
  | "kanaler"
  | "beacons"
  | "broadcast"
  | "donorer"
  | "tema";

const OMRAADER = [
  { id: "oversigt", etiket: "Oversigt" },
  { id: "drikkevarer", etiket: "Drikkevarer" },
  { id: "brugere", etiket: "Brugere" },
  { id: "kanaler", etiket: "Kanaler" },
  { id: "beacons", etiket: "Beacons" },
  { id: "broadcast", etiket: "Broadcast" },
  { id: "donorer", etiket: "Donorer" },
  { id: "tema", etiket: "Tema" },
] as const;

export function Admin({
  channelId,
  onLuk,
}: {
  channelId: Id<"kanaler"> | undefined;
  onLuk: () => void;
}) {
  const [omraade, setOmraade] = useState<Omraade>("oversigt");

  return (
    <Ark titel="Admin" onLuk={onLuk}>
      <Faner valg={OMRAADER} aktiv={omraade} onVaelg={setOmraade} />

      <div style={{ marginTop: 16 }}>
        {omraade === "oversigt" ? (
          <Oversigt />
        ) : omraade === "drikkevarer" ? (
          <Drikkevarer />
        ) : omraade === "brugere" ? (
          <Brugere />
        ) : omraade === "kanaler" ? (
          <Kanaler />
        ) : omraade === "beacons" ? (
          <Beacons channelId={channelId} />
        ) : omraade === "broadcast" ? (
          <Broadcast />
        ) : omraade === "donorer" ? (
          <Donorer />
        ) : (
          <Tema />
        )}
      </div>
    </Ark>
  );
}

/**
 * En handling der kan fejle, med sin egen knap og sin egen fejlbesked.
 *
 * Hver admin-fane havde i den gamle app sin egen `useState`-trio af
 * arbejder/fejl/kvittering plus et `toast`-kald. Det er samlet her, så
 * fanerne kun beskriver HVAD der skal ske.
 */
function useHandling() {
  const [arbejder, setArbejder] = useState(false);
  const [fejl, setFejl] = useState<string | undefined>();
  const [kvittering, setKvittering] = useState<string | undefined>();

  const koer = async (navn: string, handling: () => Promise<string>) => {
    setArbejder(true);
    setFejl(undefined);
    setKvittering(undefined);
    try {
      const svar = await handling();
      console.log("[Admin] handling gennemfoert", { handling: navn });
      setKvittering(svar);
    } catch (error) {
      console.log("[Admin] handling fejlede", { handling: navn });
      setFejl(fejltekst(error));
    } finally {
      setArbejder(false);
    }
  };

  const besked =
    fejl !== undefined ? (
      <p className="fejl">{fejl}</p>
    ) : kvittering !== undefined ? (
      <p className="kvitteringstekst">{kvittering}</p>
    ) : null;

  return { arbejder, koer, besked };
}

/* ------------------------------------------------------------ drikkevarer */

/**
 * Kataloget.
 *
 * Den eneste fane, der er MERE komplet end den gamle. Der sad et
 * "Redigér drink (kommer snart)" på hver række i det gamle repo; siden
 * `drinkVariations.opdaterVariant` allerede findes, er den bygget her.
 */
function Drikkevarer() {
  const varianter = useQuery(api.drinkVariations.getDrinkVariations, {});
  const opret = useMutation(api.drinkVariations.opretVariant);
  const opdater = useMutation(api.drinkVariations.opdaterVariant);
  const slet = useMutation(api.drinkVariations.sletVariant);
  const { arbejder, koer, besked } = useHandling();

  const [navn, setNavn] = useState("");
  const [kategori, setKategori] = useState<string>(DRINK_CATEGORIES[0].id);
  const [beskrivelse, setBeskrivelse] = useState("");
  const [redigerer, setRedigerer] = useState<Id<"drinkVariations"> | undefined>();
  const [redigeretNavn, setRedigeretNavn] = useState("");
  const [bekraeftSlet, setBekraeftSlet] = useState<Id<"drinkVariations"> | undefined>();

  if (varianter === undefined) return <p className="midtstillet">Henter …</p>;

  return (
    <>
      <div className="arkgruppe">
        <h3>Ny drikkevare</h3>
        <input
          className="felt"
          value={navn}
          placeholder="Navn, fx Vermouth Tonic"
          onChange={(event) => setNavn(event.target.value)}
        />
        <div className="chips" style={{ margin: "9px 0" }}>
          {DRINK_CATEGORIES.map((k) => (
            <button
              key={k.id}
              className="chip"
              aria-pressed={kategori === k.id}
              onClick={() => setKategori(k.id)}
            >
              <span className="emoji">{k.emoji}</span>
              {k.label}
            </button>
          ))}
        </div>
        <input
          className="felt"
          value={beskrivelse}
          placeholder="Beskrivelse (valgfri)"
          onChange={(event) => setBeskrivelse(event.target.value)}
        />
        <button
          className="knap primaer"
          disabled={arbejder || navn.trim().length === 0}
          onClick={() =>
            void koer("opretVariant", async () => {
              await opret({
                name: navn.trim(),
                categoryId: kategori,
                ...(beskrivelse.trim().length > 0
                  ? { description: beskrivelse.trim() }
                  : {}),
              });
              setNavn("");
              setBeskrivelse("");
              return `"${navn.trim()}" oprettet.`;
            })
          }
        >
          Opret
        </button>
      </div>

      <div className="arkgruppe">
        <h3>Kataloget · {varianter.length}</h3>
        <div className="adminliste">
          {varianter.map((variant) => {
            const kat = DRINK_CATEGORIES.find((k) => k.id === variant.categoryId);
            return (
              <div key={variant._id} className="adminraekke">
                {redigerer === variant._id ? (
                  <>
                    <input
                      className="felt"
                      value={redigeretNavn}
                      onChange={(event) => setRedigeretNavn(event.target.value)}
                    />
                    <button
                      className="knap primaer"
                      disabled={arbejder || redigeretNavn.trim().length === 0}
                      onClick={() =>
                        void koer("opdaterVariant", async () => {
                          await opdater({
                            variationId: variant._id,
                            name: redigeretNavn.trim(),
                          });
                          setRedigerer(undefined);
                          return "Navnet er rettet.";
                        })
                      }
                    >
                      Gem
                    </button>
                    <button className="knap" onClick={() => setRedigerer(undefined)}>
                      Fortryd
                    </button>
                  </>
                ) : bekraeftSlet === variant._id ? (
                  <>
                    <span className="adminnavn">Slet "{variant.name}"?</span>
                    <button
                      className="knap fare"
                      disabled={arbejder}
                      onClick={() =>
                        void koer("sletVariant", async () => {
                          await slet({ variationId: variant._id });
                          setBekraeftSlet(undefined);
                          return `"${variant.name}" slettet.`;
                        })
                      }
                    >
                      Ja, slet
                    </button>
                    <button className="knap" onClick={() => setBekraeftSlet(undefined)}>
                      Fortryd
                    </button>
                  </>
                ) : (
                  <>
                    <span className="adminnavn">
                      <span className="emoji">{kat?.emoji ?? "🌀"}</span>
                      {variant.name}
                      <span className="hjaelp"> · {kat?.label ?? variant.categoryId}</span>
                    </span>
                    <button
                      className="knap"
                      onClick={() => {
                        setRedigerer(variant._id);
                        setRedigeretNavn(variant.name);
                      }}
                    >
                      Redigér
                    </button>
                    <button
                      className="knap fare"
                      onClick={() => setBekraeftSlet(variant._id)}
                    >
                      Slet
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {besked}
    </>
  );
}

/* ---------------------------------------------------------------- brugere */

/**
 * Brugere.
 *
 * Søgningen går nu på tværs af ALLE brugere gennem `users.searchUsers`, som
 * kræver `requireAdmin` og filtrerer på serveren. Indtil den fandtes, kom
 * listen fra stillingen i admins egen Kanal — man kunne kun røre folk, man
 * delte Kanal med.
 *
 * Søgefeltet er ubunden: en tom søgning giver de nyeste brugere, så fanen
 * viser noget brugbart, før man har skrevet et bogstav.
 */
function Brugere() {
  const [soegning, setSoegning] = useState("");
  const brugere = useQuery(api.users.searchUsers, { soegning });
  const definitioner = useQuery(api.achievements.getDefinitions, {});

  const tildel = useMutation(api.achievements.tildelManuelt);
  const genberegn = useMutation(api.achievements.genberegnForBruger);
  const nulstilRun = useMutation(api.admin.nulstilRunForBruger);
  const nulstilSladesh = useMutation(api.admin.nulstilSladeshForBruger);
  const nulstilAchievements = useMutation(api.admin.nulstilAchievementsForBruger);
  const setAdmin = useMutation(api.admin.setAdmin);
  const { arbejder, koer, besked } = useHandling();

  const [valgt, setValgt] = useState<Id<"users"> | undefined>();
  // De destruktive handlinger spørger én gang. `undefined` betyder "ingen
  // venter på svar" — der kan kun være ét spørgsmål ad gangen.
  const [bekraefter, setBekraefter] = useState<string | undefined>();

  const manuelle = (definitioner ?? []).filter((def) => def.type === "manual");
  const valgtBruger = brugere?.find((bruger) => bruger._id === valgt);

  return (
    <>
      <input
        className="felt"
        value={soegning}
        placeholder="Søg på navn eller email"
        onChange={(event) => {
          setSoegning(event.target.value);
          // Den valgte forsvinder ud af listen, når søgningen snævrer ind.
          // Uden dette ville handlingerne blive stående for en person, man
          // ikke kan se længere.
          setValgt(undefined);
          setBekraefter(undefined);
        }}
      />

      {brugere === undefined ? (
        <p className="midtstillet">Henter …</p>
      ) : brugere.length === 0 ? (
        <p className="hjaelp">Ingen brugere matcher søgningen.</p>
      ) : (
        <div className="adminliste" style={{ marginTop: 12 }}>
          {brugere.map((bruger) => (
            <button
              key={bruger._id}
              className="adminraekke vaelgbar"
              aria-pressed={valgt === bruger._id}
              onClick={() => {
                setValgt(valgt === bruger._id ? undefined : bruger._id);
                setBekraefter(undefined);
              }}
            >
              <Avatar
                emoji={bruger.emoji}
                navn={bruger.displayName}
                farve={bruger.avatarColor}
              />
              <span className="adminnavn">
                {bruger.displayName}
                {bruger.isAdmin === true && <span className="maerkat">Admin</span>}
                <span className="hjaelp"> · {bruger.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {valgtBruger !== undefined && (
        <>
          <div className="arkgruppe">
            <h3>Achievements for {valgtBruger.displayName}</h3>

            {manuelle.map((def) => (
              <button
                key={def.id}
                className="knap"
                disabled={arbejder}
                onClick={() =>
                  void koer("tildelManuelt", async () => {
                    await tildel({
                      userId: valgtBruger._id,
                      achievementId: def.id,
                    });
                    return `"${def.title}" tildelt ${valgtBruger.displayName}.`;
                  })
                }
              >
                Tildel {def.emoji ?? "🏆"} {def.title}
              </button>
            ))}

            <button
              className="knap"
              disabled={arbejder}
              onClick={() =>
                void koer("genberegnForBruger", async () => {
                  const nye = await genberegn({ userId: valgtBruger._id });
                  return nye.length === 0
                    ? "Genberegnet — der var intet nyt at låse op."
                    : `Genberegnet — låste ${nye.length} op.`;
                })
              }
            >
              Genberegn achievements
            </button>

            <p className="hjaelp">
              Genberegning kan kun låse op, aldrig fjerne. Skal noget væk, så
              nulstil først og genberegn bagefter.
            </p>
          </div>

          <div className="arkgruppe">
            <h3>Nulstil</h3>

            <button
              className="knap"
              disabled={arbejder}
              onClick={() =>
                void koer("nulstilRunForBruger", async () => {
                  await nulstilRun({ userId: valgtBruger._id });
                  return `${valgtBruger.displayName}s run er nulstillet.`;
                })
              }
            >
              Nulstil run
            </button>
            <p className="hjaelp">
              Stillingen starter forfra. Logninger og historik bliver stående.
            </p>

            <button
              className="knap"
              disabled={arbejder}
              onClick={() =>
                void koer("nulstilSladeshForBruger", async () => {
                  const afsluttede = await nulstilSladesh({
                    userId: valgtBruger._id,
                  });
                  return afsluttede === 0
                    ? "Sladesh-tallene er nulstillet."
                    : `Sladesh-tallene er nulstillet, og ${afsluttede} hængende udfordring(er) er lukket.`;
                })
              }
            >
              Nulstil Sladesh
            </button>

            {/* Den eneste handling her, der ikke kan fortrydes. Derfor er den
                den eneste, der spørger. */}
            {bekraefter === "achievements" ? (
              <div className="kort">
                <p style={{ marginTop: 0 }}>
                  Alle {valgtBruger.displayName}s achievements slettes — også
                  dem, der er tildelt i hånden. Det kan ikke fortrydes.
                </p>
                <button
                  className="knap fare"
                  disabled={arbejder}
                  onClick={() =>
                    void koer("nulstilAchievementsForBruger", async () => {
                      const slettede = await nulstilAchievements({
                        userId: valgtBruger._id,
                      });
                      setBekraefter(undefined);
                      return `${slettede} achievement(s) slettet.`;
                    })
                  }
                >
                  Ja, slet dem
                </button>
                <button className="knap" onClick={() => setBekraefter(undefined)}>
                  Fortryd
                </button>
              </div>
            ) : (
              <button
                className="knap fare"
                onClick={() => setBekraefter("achievements")}
              >
                Nulstil achievements
              </button>
            )}
          </div>

          <div className="arkgruppe">
            <h3>Adgang</h3>
            <button
              className={valgtBruger.isAdmin === true ? "knap fare" : "knap"}
              disabled={arbejder}
              onClick={() =>
                void koer("setAdmin", async () => {
                  const nyVaerdi = valgtBruger.isAdmin !== true;
                  await setAdmin({
                    userId: valgtBruger._id,
                    isAdmin: nyVaerdi,
                  });
                  return nyVaerdi
                    ? `${valgtBruger.displayName} er nu administrator.`
                    : `${valgtBruger.displayName} er ikke længere administrator.`;
                })
              }
            >
              {valgtBruger.isAdmin === true
                ? "Fjern administratoradgang"
                : "Gør til administrator"}
            </button>
            <p className="hjaelp">
              Adgangen håndhæves af requireAdmin på serveren, ikke af hvad der
              vises her. Du kan ikke fjerne din egen.
            </p>
          </div>
        </>
      )}

      {besked}
    </>
  );
}

/* ---------------------------------------------------------------- kanaler */

/**
 * Kanaler.
 *
 * Listen viser nu ALLE Kanaler gennem `kanaler.getAlleKanaler`, ikke kun dem
 * admin selv er medlem af.
 *
 * Der er ingen sletteknap. En Kanal er refereret af beskeder, logninger,
 * check ins og beacons, og en kaskade ville fjerne logninger, som brugernes
 * livstidstal og achievements er regnet ud fra — oprydning i en liste må ikke
 * omskrive folks historik. `arkiverKanal` melder medlemmerne ud og skjuler
 * Kanalen; rækkerne bliver stående, og det kan fortrydes.
 */
function Kanaler() {
  const [visArkiverede, setVisArkiverede] = useState(false);
  const kanaler = useQuery(api.kanaler.getAlleKanaler, {
    inkluderArkiverede: visArkiverede,
  });
  const opret = useMutation(api.kanaler.createKanal);
  const arkiver = useMutation(api.kanaler.arkiverKanal);
  const genaktiver = useMutation(api.kanaler.genaktiverKanal);
  const { arbejder, koer, besked } = useHandling();

  const [navn, setNavn] = useState("");
  const [kode, setKode] = useState("");
  const [beskrivelse, setBeskrivelse] = useState("");
  const [bekraeftArkiv, setBekraeftArkiv] = useState<Id<"kanaler"> | undefined>();

  return (
    <>
      <div className="arkgruppe">
        <h3>Ny Kanal</h3>
        <input
          className="felt"
          value={navn}
          placeholder="Navn, fx Brøndby IF"
          onChange={(event) => setNavn(event.target.value)}
        />
        <input
          className="felt"
          value={kode}
          placeholder="Invitationskode"
          autoCapitalize="characters"
          onChange={(event) => setKode(event.target.value)}
        />
        <input
          className="felt"
          value={beskrivelse}
          placeholder="Beskrivelse (valgfri)"
          onChange={(event) => setBeskrivelse(event.target.value)}
        />
        <button
          className="knap primaer"
          disabled={arbejder || navn.trim().length === 0 || kode.trim().length === 0}
          onClick={() =>
            void koer("createKanal", async () => {
              await opret({
                name: navn.trim(),
                code: kode.trim(),
                ...(beskrivelse.trim().length > 0
                  ? { description: beskrivelse.trim() }
                  : {}),
              });
              const oprettet = navn.trim();
              setNavn("");
              setKode("");
              setBeskrivelse("");
              return `Kanalen "${oprettet}" er oprettet, og du er meldt ind.`;
            })
          }
        >
          Opret Kanal
        </button>
      </div>

      <div className="arkgruppe">
        <h3>Alle Kanaler</h3>

        <button
          className="chip"
          aria-pressed={visArkiverede}
          onClick={() => setVisArkiverede(!visArkiverede)}
        >
          Vis arkiverede
        </button>

        {kanaler === undefined ? (
          <p className="midtstillet">Henter …</p>
        ) : (
          <div className="adminliste" style={{ marginTop: 10 }}>
            {kanaler.map((kanal) => (
              <div key={kanal._id} className="adminraekke">
                {bekraeftArkiv === kanal._id ? (
                  <>
                    <span className="adminnavn">
                      Arkivér "{kanal.name}"? {kanal.members.length} medlem(mer)
                      meldes ud.
                    </span>
                    <button
                      className="knap fare"
                      disabled={arbejder}
                      onClick={() =>
                        void koer("arkiverKanal", async () => {
                          await arkiver({ channelId: kanal._id });
                          setBekraeftArkiv(undefined);
                          return `"${kanal.name}" er arkiveret.`;
                        })
                      }
                    >
                      Ja, arkivér
                    </button>
                    <button className="knap" onClick={() => setBekraeftArkiv(undefined)}>
                      Fortryd
                    </button>
                  </>
                ) : (
                  <>
                    <span className="adminnavn">
                      {kanal.name}
                      {kanal.isDefault && <span className="maerkat">Standard</span>}
                      {kanal.archived === true && (
                        <span className="maerkat">Arkiveret</span>
                      )}
                      <span className="hjaelp">
                        {" "}
                        · {kanal.code ?? "ingen kode"} · {kanal.members.length}{" "}
                        medlem(mer)
                      </span>
                    </span>
                    {kanal.archived === true ? (
                      <button
                        className="knap"
                        disabled={arbejder}
                        onClick={() =>
                          void koer("genaktiverKanal", async () => {
                            await genaktiver({ channelId: kanal._id });
                            return `"${kanal.name}" er aktiv igen — men tom, for medlemmerne blev meldt ud ved arkiveringen.`;
                          })
                        }
                      >
                        Genaktivér
                      </button>
                    ) : (
                      // Standard-Kanalen kan ikke arkiveres — nye brugere
                      // meldes automatisk ind i den. Serveren afviser det
                      // også; knappen skjules, så man ikke prøver forgæves.
                      !kanal.isDefault && (
                        <button
                          className="knap fare"
                          onClick={() => setBekraeftArkiv(kanal._id)}
                        >
                          Arkivér
                        </button>
                      )
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {besked}
    </>
  );
}

/* ---------------------------------------------------------------- beacons */

/**
 * Beacons.
 *
 * Den gamle app kaldte det "Stress Beacon" og lagde knappen i brugerfanen.
 * Her har den sin egen, fordi der også skal kunne slukkes igen —
 * `deaktiverBeacon` findes, og uden den kunne en beacon kun sættes op.
 */
function Beacons({ channelId }: { channelId: Id<"kanaler"> | undefined }) {
  const beacons = useQuery(
    api.beacons.getBeacons,
    channelId === undefined ? {} : { channelId },
  );
  const opret = useMutation(api.beacons.opretBeacon);
  const deaktiver = useMutation(api.beacons.deaktiverBeacon);
  const { arbejder, koer, besked } = useHandling();

  const [sted, setSted] = useState("");
  const [beskedtekst, setBeskedtekst] = useState("");

  /**
   * Positionen tages fra telefonen, ligesom i den gamle app.
   *
   * `getCurrentPosition` er callback-baseret, så den pakkes i et løfte —
   * ellers kunne fejlen ikke fanges af `koer` sammen med selve mutationen.
   */
  const hentPosition = () =>
    new Promise<GeolocationPosition>((klar, fejl) => {
      if (navigator.geolocation === undefined) {
        fejl(new Error("Din browser kan ikke oplyse din position."));
        return;
      }
      navigator.geolocation.getCurrentPosition(klar, fejl, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });

  return (
    <>
      <div className="arkgruppe">
        <h3>Ny beacon her</h3>
        <p className="hjaelp" style={{ marginTop: 0 }}>
          Beaconen placeres på din nuværende position.
        </p>
        <input
          className="felt"
          value={sted}
          placeholder="Sted, fx Ballade"
          onChange={(event) => setSted(event.target.value)}
        />
        <input
          className="felt"
          value={beskedtekst}
          placeholder="Besked (valgfri)"
          onChange={(event) => setBeskedtekst(event.target.value)}
        />
        <button
          className="knap primaer"
          disabled={arbejder}
          onClick={() =>
            void koer("opretBeacon", async () => {
              const position = await hentPosition();
              await opret({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                ...(sted.trim().length > 0
                  ? { title: sted.trim(), venue: sted.trim() }
                  : {}),
                ...(beskedtekst.trim().length > 0 ? { message: beskedtekst.trim() } : {}),
                ...(channelId !== undefined ? { channelId } : {}),
              });
              setSted("");
              setBeskedtekst("");
              return "Beaconen er aktiv.";
            })
          }
        >
          Aktivér beacon
        </button>
      </div>

      <div className="arkgruppe">
        <h3>Aktive beacons</h3>
        {beacons === undefined ? (
          <p className="midtstillet">Henter …</p>
        ) : beacons.length === 0 ? (
          <p className="hjaelp">Ingen aktive beacons.</p>
        ) : (
          <div className="adminliste">
            {beacons.map((beacon) => (
              <div key={beacon._id} className="adminraekke">
                <span className="adminnavn">
                  📍 {beacon.title ?? beacon.venue ?? "Beacon"}
                  <span className="hjaelp"> · {klokken(beacon.createdAt)}</span>
                </span>
                <button
                  className="knap fare"
                  disabled={arbejder}
                  onClick={() =>
                    void koer("deaktiverBeacon", async () => {
                      await deaktiver({ beaconId: beacon._id });
                      return "Beaconen er slukket.";
                    })
                  }
                >
                  Sluk
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {besked}
    </>
  );
}

/* --------------------------------------------------------------- oversigt */

/**
 * Oversigt.
 *
 * Den gamle fane var ren pynt: "24 brugere online", "156 drinks logget i
 * dag", "8 aktive kanaler" og "2.450 kr." stod hårdkodet i klientkoden under
 * kommentaren "Mock data - would come from Firestore in production", sammen
 * med tre opdigtede aktivitetslinjer. Der var altså ingen visning at migrere
 * — kun fire etiketter, der aldrig fik rigtige tal bag sig.
 *
 * Tallene her er de rigtige og kommer fra `stats.getAdminStats`.
 */
function Oversigt() {
  const stats = useQuery(api.stats.getAdminStats, {});

  if (stats === undefined) return <p className="midtstillet">Henter …</p>;

  return (
    <>
      <div className="talgitter">
        <div className="talkort">
          <div className="vaerdi">{stats.brugere}</div>
          <div className="etiket">brugere</div>
        </div>
        <div className="talkort">
          <div className="vaerdi">{stats.checketInd}</div>
          <div className="etiket">checket ind</div>
        </div>
        <div className="talkort">
          <div className="vaerdi">{stats.aktiveKanaler}</div>
          <div className="etiket">aktive Kanaler</div>
        </div>
        <div className="talkort">
          <div className="vaerdi">{stats.aktiveBrugereIDag}</div>
          <div className="etiket">har logget i dag</div>
        </div>
        <div className="talkort">
          <div className="vaerdi">{genstande(stats.genstandeIDag)}</div>
          <div className="etiket">genstande i dag</div>
        </div>
        <div className="talkort">
          <div className="vaerdi">{stats.logningerIDag}</div>
          <div className="etiket">logninger i dag</div>
        </div>
      </div>

      <div className="arkgruppe">
        <h3>Donationer</h3>
        <div className="talgitter">
          <div className="talkort">
            <div className="vaerdi">{stats.donationerIAlt.toLocaleString("da-DK")}</div>
            <div className="etiket">kroner i alt</div>
          </div>
          <div className="talkort">
            <div className="vaerdi">{stats.antalDonationer}</div>
            <div className="etiket">donationer</div>
          </div>
        </div>
      </div>

      {/* Drikkedagen starter kl. 10:00, ikke ved midnat. Uden dette ville
          "i dag" se forkert ud for enhver, der kigger før frokost. */}
      <p className="hjaelp">
        "I dag" er drikkedagen, der begyndte {klokken(stats.dayStart)}.
        {stats.arkiveredeKanaler > 0 &&
          ` ${stats.arkiveredeKanaler} Kanal(er) er arkiveret.`}
      </p>
    </>
  );
}

/* -------------------------------------------------------------- broadcast */

/**
 * Broadcast.
 *
 * I det gamle repo var knappen et `toast.success("Stress Signal sendt")` —
 * den skrev ingenting nogen steder. Den rigtige vej gik gennem DevTools, som
 * lagde et dokument i `broadcasts`, hvorefter en Cloud Function fanede det ud
 * som push.
 *
 * Push findes ikke i v4 endnu, så en broadcast er her en tilstand: den er
 * aktiv, til den udløber eller slås fra, og vises som en bjælke i toppen af
 * appen. Rækkerne ligger klar til at blive fanet ud som push den dag kanalen
 * findes.
 */
function Broadcast() {
  const mine = useQuery(api.kanaler.getMineKanaler, {});
  const broadcasts = useQuery(api.broadcasts.getAlleBroadcasts, {});
  const opret = useMutation(api.broadcasts.opretBroadcast);
  const deaktiver = useMutation(api.broadcasts.deaktiverBroadcast);
  const { arbejder, koer, besked } = useHandling();

  const [titel, setTitel] = useState("");
  const [tekst, setTekst] = useState("");
  const [kanal, setKanal] = useState<Id<"kanaler"> | undefined>();
  const [timer, setTimer] = useState("");

  return (
    <>
      <div className="arkgruppe">
        <h3>Ny broadcast</h3>
        <input
          className="felt"
          value={titel}
          placeholder="Overskrift"
          onChange={(event) => setTitel(event.target.value)}
        />
        <input
          className="felt"
          value={tekst}
          placeholder="Besked"
          onChange={(event) => setTekst(event.target.value)}
        />

        <h3 style={{ marginTop: 14 }}>Hvem skal se den?</h3>
        <div className="chips">
          <button
            className="chip"
            aria-pressed={kanal === undefined}
            onClick={() => setKanal(undefined)}
          >
            Alle
          </button>
          {(mine ?? []).map((k) => (
            <button
              key={k._id}
              className="chip"
              aria-pressed={kanal === k._id}
              onClick={() => setKanal(k._id)}
            >
              {k.name}
            </button>
          ))}
        </div>

        <input
          className="felt"
          style={{ marginTop: 12 }}
          value={timer}
          inputMode="numeric"
          placeholder="Timer den skal stå (tom = til du slukker den)"
          onChange={(event) => setTimer(event.target.value)}
        />

        <button
          className="knap primaer"
          disabled={arbejder || titel.trim().length === 0 || tekst.trim().length === 0}
          onClick={() =>
            void koer("opretBroadcast", async () => {
              const antalTimer = Number(timer.trim());
              await opret({
                title: titel.trim(),
                body: tekst.trim(),
                ...(kanal !== undefined ? { channelId: kanal } : {}),
                ...(timer.trim().length > 0 && Number.isFinite(antalTimer)
                  ? { timer: antalTimer }
                  : {}),
              });
              setTitel("");
              setTekst("");
              setTimer("");
              return "Broadcasten er ude.";
            })
          }
        >
          Send broadcast
        </button>
      </div>

      <div className="arkgruppe">
        <h3>Sendte broadcasts</h3>
        {broadcasts === undefined ? (
          <p className="midtstillet">Henter …</p>
        ) : broadcasts.length === 0 ? (
          <p className="hjaelp">Der er ikke sendt nogen endnu.</p>
        ) : (
          <div className="adminliste">
            {broadcasts.map((broadcast) => (
              <div key={broadcast._id} className="adminraekke">
                <span className="adminnavn">
                  {broadcast.title}
                  {broadcast.active ? (
                    <span className="maerkat optjent">Aktiv</span>
                  ) : (
                    <span className="maerkat">Slukket</span>
                  )}
                  <span className="hjaelp">
                    {" "}
                    · {broadcast.channelId === undefined ? "alle" : "én Kanal"} ·{" "}
                    {klokken(broadcast.createdAt)}
                  </span>
                </span>
                {broadcast.active && (
                  <button
                    className="knap fare"
                    disabled={arbejder}
                    onClick={() =>
                      void koer("deaktiverBroadcast", async () => {
                        await deaktiver({ broadcastId: broadcast._id });
                        return "Broadcasten er slukket.";
                      })
                    }
                  >
                    Sluk
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {besked}
    </>
  );
}

/* ---------------------------------------------------------------- donorer */

/**
 * Donorer.
 *
 * `opretDonation` tildeler Top Donor-achievementet i samme transaktion. I det
 * gamle repo var det to ting at huske i to forskellige faner, og det ene blev
 * jævnligt glemt.
 *
 * Brugeren vælges gennem den samme admin-søgning som Brugere-fanen bruger.
 */
function Donorer() {
  const [soegning, setSoegning] = useState("");
  const brugere = useQuery(api.users.searchUsers, { soegning });
  const donorer = useQuery(api.donations.getDonorer, {});
  const opret = useMutation(api.donations.opretDonation);
  const slet = useMutation(api.donations.sletDonation);
  const { arbejder, koer, besked } = useHandling();

  const [valgt, setValgt] = useState<Id<"users"> | undefined>();
  const [beloeb, setBeloeb] = useState("");
  const [hilsen, setHilsen] = useState("");
  const [bekraeftSlet, setBekraeftSlet] = useState<Id<"donations"> | undefined>();

  const valgtBruger = brugere?.find((bruger) => bruger._id === valgt);

  return (
    <>
      <div className="arkgruppe">
        <h3>Registrér donation</h3>

        <input
          className="felt"
          value={soegning}
          placeholder="Søg efter donor"
          onChange={(event) => {
            setSoegning(event.target.value);
            setValgt(undefined);
          }}
        />

        {brugere !== undefined && (
          <div className="adminliste" style={{ marginTop: 10 }}>
            {brugere.slice(0, 8).map((bruger) => (
              <button
                key={bruger._id}
                className="adminraekke vaelgbar"
                aria-pressed={valgt === bruger._id}
                onClick={() => setValgt(valgt === bruger._id ? undefined : bruger._id)}
              >
                <Avatar
                  emoji={bruger.emoji}
                  navn={bruger.displayName}
                  farve={bruger.avatarColor}
                />
                <span className="adminnavn">{bruger.displayName}</span>
              </button>
            ))}
          </div>
        )}

        <input
          className="felt"
          style={{ marginTop: 12 }}
          value={beloeb}
          inputMode="numeric"
          placeholder="Beløb i kroner"
          onChange={(event) => setBeloeb(event.target.value)}
        />
        <input
          className="felt"
          value={hilsen}
          placeholder="Hilsen (valgfri)"
          onChange={(event) => setHilsen(event.target.value)}
        />

        <button
          className="knap primaer"
          disabled={
            arbejder || valgtBruger === undefined || Number(beloeb.trim()) <= 0
          }
          onClick={() =>
            void koer("opretDonation", async () => {
              if (valgtBruger === undefined) return "";
              await opret({
                userId: valgtBruger._id,
                amount: Number(beloeb.trim()),
                ...(hilsen.trim().length > 0 ? { message: hilsen.trim() } : {}),
              });
              const navn = valgtBruger.displayName;
              setBeloeb("");
              setHilsen("");
              setValgt(undefined);
              return `Donation fra ${navn} registreret — Top Donor er tildelt.`;
            })
          }
        >
          Registrér donation
        </button>
      </div>

      <div className="arkgruppe">
        <h3>
          Donorlisten
          {donorer !== undefined &&
            ` · ${donorer.total.toLocaleString("da-DK")} kr.`}
        </h3>
        {donorer === undefined ? (
          <p className="midtstillet">Henter …</p>
        ) : donorer.donationer.length === 0 ? (
          <p className="hjaelp">Ingen donationer endnu.</p>
        ) : (
          <div className="adminliste">
            {donorer.donationer.map((donation) => (
              <div key={donation._id} className="adminraekke">
                {bekraeftSlet === donation._id ? (
                  <>
                    <span className="adminnavn">
                      Slet donationen fra {donation.name}?
                    </span>
                    <button
                      className="knap fare"
                      disabled={arbejder}
                      onClick={() =>
                        void koer("sletDonation", async () => {
                          await slet({ donationId: donation._id });
                          setBekraeftSlet(undefined);
                          return "Donationen er slettet. Top Donor blev stående.";
                        })
                      }
                    >
                      Ja, slet
                    </button>
                    <button className="knap" onClick={() => setBekraeftSlet(undefined)}>
                      Fortryd
                    </button>
                  </>
                ) : (
                  <>
                    <Avatar
                      emoji={donation.avatar}
                      navn={donation.name}
                      farve={donation.color}
                    />
                    <span className="adminnavn">
                      {donation.name}
                      <span className="hjaelp">
                        {" "}
                        · {donation.amount.toLocaleString("da-DK")} kr.
                      </span>
                    </span>
                    <button
                      className="knap fare"
                      onClick={() => setBekraeftSlet(donation._id)}
                    >
                      Slet
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {besked}
    </>
  );
}

/* ------------------------------------------------------------------- tema */

/** De lovlige Ballade-temaer, med de navne de skal vises under. */
const BALLADE_TEMAER = [
  { id: "", etiket: "Intet tema" },
  { id: "copenhell", etiket: "Copenhell" },
  { id: "odays", etiket: "O Days" },
] as const;

/**
 * Ballade-temaet.
 *
 * Det gamle repo havde to booleans, `copenhellBallade` og `odaysBallade`, og
 * to næsten identiske funktioner, der hver især skulle huske at slå den anden
 * fra. Det var i praksis ét valg med tre tilstande, så det er ét felt nu — og
 * så kan de to ikke være tændt samtidig.
 *
 * "Ballade" er et af de kanoniske danske Kanalnavne og skrives ordret.
 */
function Tema() {
  const tema = useQuery(api.indstillinger.getBalladeTema, {});
  const setTema = useMutation(api.indstillinger.setBalladeTema);
  const { arbejder, koer, besked } = useHandling();

  if (tema === undefined) return <p className="midtstillet">Henter …</p>;

  return (
    <>
      <div className="arkgruppe">
        <h3>Tema på Ballade</h3>
        <p className="hjaelp" style={{ marginTop: 0 }}>
          Gælder alle brugere i Kanalen Ballade. Kun ét tema ad gangen.
        </p>
        <div className="chips">
          {BALLADE_TEMAER.map((valg) => (
            <button
              key={valg.id}
              className="chip stor"
              aria-pressed={tema === valg.id}
              disabled={arbejder}
              onClick={() =>
                void koer("setBalladeTema", async () => {
                  await setTema({ tema: valg.id });
                  return valg.id === ""
                    ? "Temaet er slået fra."
                    : `${valg.etiket} er slået til.`;
                })
              }
            >
              {valg.etiket}
            </button>
          ))}
        </div>
      </div>

      {/* Ærligt frem for at lade som om. Indstillingen GEMMES korrekt og kan
          læses af enhver klient; der er bare endnu ingen visning, der maler
          efter den — ChannelThemeContext fra det gamle repo er ikke migreret. */}
      <p className="hjaelp">
        Valget gemmes og kan læses af appen, men der er endnu ingen skærm, der
        skifter udseende efter det. Det kommer sammen med kanaltemaerne.
      </p>

      {besked}
    </>
  );
}
