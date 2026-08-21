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
 * Den gamle app havde syv faner. Fire er med her — dem hvor der ligger en
 * Convex-funktion i den anden ende. De tre andre (Oversigt, Broadcast,
 * Donorer) er udeladt med vilje, ikke glemt:
 *
 * - **Oversigt** viste hårdkodede tal. "24 brugere online", "156 drinks i
 *   dag" og "2.450 kr. i donationer" stod ordret i klientkoden med en
 *   kommentar om, at de "would come from Firestore in production". Der er
 *   ingen `stats`-tabel at koble den til, og en skærm der lyver er værre end
 *   ingen skærm.
 * - **Broadcast** og **Donorer** kræver tabellerne `broadcasts` og
 *   `donations`, som bevidst blev valgt fra i fase 1 (docs/skaermkortlaegning
 *   .md, 4.7).
 * - **Dev Tools** simulerede Sladesh'er ved at skrive direkte i Firestore og
 *   nulstillede andres tællere. Den hører til fase 4 sammen med resten af
 *   Sladesh-flowet.
 *
 * Adgangen er ægte nu. Den gamle app tjekkede `isAdminEmail(user.email)` mod
 * en hårdkodet liste I KLIENTEN — den kunne omgås ved at redigere bundtet.
 * Her er `isAdmin` et felt på brugeren, og HVER mutation kalder `requireAdmin`
 * på serveren. Tjekket nedenfor skjuler kun knapperne; det er ikke det, der
 * beskytter noget.
 */
type Omraade = "drikkevarer" | "brugere" | "kanaler" | "beacons";

const OMRAADER = [
  { id: "drikkevarer", etiket: "Drikkevarer" },
  { id: "brugere", etiket: "Brugere" },
  { id: "kanaler", etiket: "Kanaler" },
  { id: "beacons", etiket: "Beacons" },
] as const;

export function Admin({
  channelId,
  onLuk,
}: {
  channelId: Id<"kanaler"> | undefined;
  onLuk: () => void;
}) {
  const [omraade, setOmraade] = useState<Omraade>("drikkevarer");

  return (
    <Ark titel="Admin" onLuk={onLuk}>
      <Faner valg={OMRAADER} aktiv={omraade} onVaelg={setOmraade} />

      <div style={{ marginTop: 16 }}>
        {omraade === "drikkevarer" ? (
          <Drikkevarer />
        ) : omraade === "brugere" ? (
          <Brugere channelId={channelId} />
        ) : omraade === "kanaler" ? (
          <Kanaler />
        ) : (
          <Beacons channelId={channelId} />
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
 * Der findes ingen `users.searchUsers` eller `getAllUsers` i Convex, så
 * listen kommer fra stillingen i den Kanal, admin selv står i. Det er en
 * reel begrænsning — man kan kun røre folk, man deler Kanal med — og den
 * står skrevet på skærmen frem for at være en overraskelse.
 *
 * De to handlinger er dem, der har et modstykke: tildel en manuel
 * achievement (i praksis Top Donor), og genberegn achievements. Den gamle
 * fanes "nulstil brugerens Sladesh" har ingen mutation og er ikke bygget.
 */
function Brugere({ channelId }: { channelId: Id<"kanaler"> | undefined }) {
  const stilling = useQuery(
    api.scoreboard.getScoreboard,
    channelId === undefined ? "skip" : { channelId },
  );
  const definitioner = useQuery(api.achievements.getDefinitions, {});
  const tildel = useMutation(api.achievements.tildelManuelt);
  const genberegn = useMutation(api.achievements.genberegnForBruger);
  const { arbejder, koer, besked } = useHandling();

  const [valgt, setValgt] = useState<Id<"users"> | undefined>();
  const [soegning, setSoegning] = useState("");

  if (channelId === undefined) {
    return (
      <p className="hjaelp">
        Vælg en Kanal foroven — brugerlisten kommer fra stillingen i den Kanal,
        du står i.
      </p>
    );
  }
  if (stilling === undefined) return <p className="midtstillet">Henter …</p>;

  const manuelle = (definitioner ?? []).filter((def) => def.type === "manual");
  const fundne = stilling.filter((raekke) =>
    raekke.name.toLowerCase().includes(soegning.trim().toLowerCase()),
  );
  const valgtRaekke = stilling.find((raekke) => raekke.userId === valgt);

  return (
    <>
      <p className="hjaelp" style={{ marginTop: 0 }}>
        Viser medlemmerne af din aktive Kanal. Der findes endnu ingen
        Convex-query, der kan søge på tværs af alle brugere.
      </p>

      <input
        className="felt"
        value={soegning}
        placeholder="Søg i Kanalen"
        onChange={(event) => setSoegning(event.target.value)}
      />

      <div className="adminliste" style={{ marginTop: 12 }}>
        {fundne.map((raekke) => (
          <button
            key={raekke.userId}
            className="adminraekke vaelgbar"
            aria-pressed={valgt === raekke.userId}
            onClick={() =>
              setValgt(valgt === raekke.userId ? undefined : raekke.userId)
            }
          >
            <Avatar emoji={raekke.avatar} navn={raekke.name} farve={raekke.color} />
            <span className="adminnavn">
              {raekke.name}
              <span className="hjaelp">
                {" "}
                · {genstande(raekke.drinksToday)} i dag
              </span>
            </span>
          </button>
        ))}
        {fundne.length === 0 && <p className="hjaelp">Ingen matcher søgningen.</p>}
      </div>

      {valgtRaekke !== undefined && (
        <div className="arkgruppe">
          <h3>Handlinger for {valgtRaekke.name}</h3>

          {manuelle.map((def) => (
            <button
              key={def.id}
              className="knap"
              disabled={arbejder}
              onClick={() =>
                void koer("tildelManuelt", async () => {
                  await tildel({
                    userId: valgtRaekke.userId,
                    achievementId: def.id,
                  });
                  return `"${def.title}" tildelt ${valgtRaekke.name}.`;
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
                const nye = await genberegn({ userId: valgtRaekke.userId });
                return nye.length === 0
                  ? "Genberegnet — der var intet nyt at låse op."
                  : `Genberegnet — låste ${nye.length} op.`;
              })
            }
          >
            Genberegn achievements
          </button>

          {/* Genberegningen kan kun TILFØJE. Det står her, fordi den gamle
              fanes tilsvarende knap hed "Nulstil achievements" og gjorde det
              stik modsatte — den tømte feltet på brugerdokumentet. */}
          <p className="hjaelp">
            Genberegning kan kun låse op, aldrig fjerne noget brugeren allerede
            har fået.
          </p>
        </div>
      )}

      {besked}
    </>
  );
}

/* ---------------------------------------------------------------- kanaler */

/**
 * Kanaler.
 *
 * Kun oprettelse. `kanaler.createKanal` findes; en query der lister ALLE
 * Kanaler og en `sletKanal` gør ikke, så listen viser dem, admin selv er
 * medlem af.
 */
function Kanaler() {
  const mine = useQuery(api.kanaler.getMineKanaler, {});
  const opret = useMutation(api.kanaler.createKanal);
  const { arbejder, koer, besked } = useHandling();

  const [navn, setNavn] = useState("");
  const [kode, setKode] = useState("");
  const [beskrivelse, setBeskrivelse] = useState("");

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
        <h3>Mine Kanaler</h3>
        <p className="hjaelp" style={{ marginTop: 0 }}>
          Der findes endnu ingen query, der lister alle Kanaler på tværs af
          appen — og ingen mutation der kan slette en.
        </p>
        <div className="adminliste">
          {(mine ?? []).map((kanal) => (
            <div key={kanal._id} className="adminraekke">
              <span className="adminnavn">
                {kanal.name}
                <span className="hjaelp"> · kode {kanal.code}</span>
              </span>
            </div>
          ))}
        </div>
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
