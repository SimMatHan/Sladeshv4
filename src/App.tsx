import { Suspense, lazy, useEffect, useRef, useState, type FormEvent } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { LogDrinkResultat } from "../convex/drinkLogs";
import { useAuth } from "./contexts/AuthContext";
import { useCachetQuery } from "./lib/oejebliksbillede";
import { udenGenstand } from "./lib/optimistisk";
import { fejltekst, formatUr } from "./lib/visning";
import { AchievementOplaasning } from "./ui/AchievementOplaasning";
import { Broadcastbjaelke } from "./ui/Broadcastbjaelke";
import { Chat } from "./ui/Chat";
import { Faner } from "./ui/Faner";
import { KanalIkon, MigIkon, PlusIkon, SkiftIkon } from "./ui/Ikoner";
import { Sideundertekst } from "./ui/Sideundertekst";
import { Forbindelse } from "./ui/Forbindelse";
import { Historik } from "./ui/Historik";
import { Kanaltema } from "./ui/Kanaltema";
import { KanalVaelger } from "./ui/KanalVaelger";
import { LogArk } from "./ui/LogArk";
import { Mig } from "./ui/Mig";
import { Onboarding } from "./ui/Onboarding";
import { Personkort } from "./ui/Personkort";
import { SladeshOvertagelse } from "./ui/SladeshOvertagelse";
import { Stilling } from "./ui/Stilling";

/**
 * Kortet hentes dovent.
 *
 * Leaflet og dets CSS fylder omkring 45 kB gzippet — halvdelen af alt det
 * andet tilsammen — og de fleste sessioner åbner aldrig kortet. Prisen
 * betales først, når nogen trykker på fanen.
 */
const Kort = lazy(() => import("./ui/Kort"));

/**
 * Skallen.
 *
 * To faner og én handling — se docs/brugerrejser.md:
 *
 *   Kanal   Stilling · Chat · Kort · Historik
 *   ( + )   logger en genstand i et ark, uden at forlade det man er i gang med
 *   Mig     egne tal og handlinger
 *
 * INGEN ROUTER endnu. To faner og tre ark er tilstand, ikke adresser, og en
 * router ville koste et lag uden at give noget. Den kommer, når der er URL'er
 * værd at dele — fx et link direkte til en Kanal. `vercel.json` har allerede
 * SPA-rewrites klar til den dag.
 */

type Fane = "kanal" | "mig";
type Visning = "stilling" | "chat" | "kort" | "historik";

/** Hvor længe fortryd-muligheden står efter en logning. */
const KVITTERING_MS = 6000;

export default function App() {
  const { user, loading } = useAuth();
  const { isAuthenticated, isLoading: convexTjekker } = useConvexAuth();

  if (loading) return <p className="midtstillet">Indlæser …</p>;
  if (user === null) return <LoginSkaerm />;

  // Firebase har en session, men Convex har ikke nået at verificere tokenet
  // endnu. Uden dette blink ville hver query kortvarigt fejle som uautoriseret.
  if (convexTjekker) return <p className="midtstillet">Logger ind …</p>;

  if (!isAuthenticated) {
    return (
      <div className="midtstillet">
        <p className="fejl">
          Convex afviste dit login. Tjek VITE_FIREBASE_PROJECT_ID på
          deploymentet.
        </p>
      </div>
    );
  }

  return <Appen />;
}

function Appen() {
  // Profilen er det, hele skallen hænger på — uden den står appen på
  // "Henter din profil …". Derfor er den den vigtigste at kunne male fra
  // sidste besøg, mens forbindelsen kommer op.
  const mig = useCachetQuery("mig", api.users.getMe, {});
  const createUser = useMutation(api.users.createUser);

  const [fane, setFane] = useState<Fane>("kanal");
  const [visning, setVisning] = useState<Visning>("stilling");
  const [logAabent, setLogAabent] = useState(false);
  const [kanalAabent, setKanalAabent] = useState(false);
  const [valgtPerson, setValgtPerson] = useState<Id<"users"> | undefined>();
  // `logId` er valgfri: en logning kan fortrydes, en afgjort Sladesh kan ikke.
  const [kvittering, setKvittering] = useState<
    { id: number; tekst: string; logId?: Id<"drinkLogs">; vaegt?: number } | undefined
  >();
  const kvitteringNummer = useRef(0);
  /**
   * Achievements der venter på at blive fejret.
   *
   * En kø, ikke ét id: den 20. genstand kan låse både Full Bender og Obeerma
   * op i samme kald, og to fejringer oven i hinanden ville betyde, at man kun
   * så den ene.
   */
  const [oplaasninger, setOplaasninger] = useState<string[]>([]);

  /**
   * Tager imod en logning, FØR serveren har svaret.
   *
   * Arket lukker på trykket, og stillingen flytter sig med det samme via den
   * optimistiske opdatering. Kvitteringen står der straks — men Fortryd kan
   * først komme, når vi kender logningens id, for det er dét, serveren skal
   * bruge for at fjerne den igen.
   *
   * Nummeret afgør, at svaret på den FØRSTE logning ikke sætter sig på
   * kvitteringen for den anden, hvis man når at logge to i træk.
   */
  const modtagLogning = (
    navn: string,
    vaegt: number,
    svar: Promise<LogDrinkResultat>,
  ) => {
    const nummer = ++kvitteringNummer.current;
    setKvittering({ id: nummer, tekst: `${navn} logget`, vaegt });

    svar.then(
      (resultat) => {
        setKvittering((forrige) =>
          forrige?.id === nummer ? { ...forrige, logId: resultat.logId } : forrige,
        );
        // Serveren siger selv hvad denne logning låste op — vi gætter ikke.
        if (resultat.nyeAchievements.length > 0) {
          setOplaasninger((koe) => [...koe, ...resultat.nyeAchievements]);
        }
      },
      (fejl: unknown) =>
        // Uden logId kommer Fortryd ikke frem — og der er heller ikke noget at
        // fortryde. Convex har allerede rullet den optimistiske +1 tilbage.
        setKvittering((forrige) =>
          forrige?.id === nummer ? { ...forrige, tekst: fejltekst(fejl) } : forrige,
        ),
    );
  };

  // Den aktive Sladesh — i BEGGE retninger. Er man modtager, tager den
  // skærmen; er man afsender, får man kun en stille bjælke, for der er
  // ingenting man skal gøre.
  const aktivSladesh = useQuery(api.sladesh.getActiveSladeshForUser, {});
  const [minimeret, setMinimeret] = useState(false);

  // Ulæst-prikken på Chat-segmentet. Ét kald for alle ens Kanaler, så den
  // også kan bruges på kanalvælgeren, den dag den skal vise det.
  const ulaeste = useQuery(api.messages.getUlaeste, {});

  // Første login efter signup: profilen findes endnu ikke i Convex. Vi
  // opretter den uden at spørge — brugeren har allerede sagt ja til at være
  // her ved at logge ind, og et ekstra trin ville kun være i vejen.
  useEffect(() => {
    if (mig === null) void createUser({});
  }, [mig, createUser]);

  // En NY udfordring skal altid tage skærmen, også selvom man minimerede den
  // forrige. Nøglen er udfordringens id, ikke om der er en.
  const sladeshId = aktivSladesh?._id;
  useEffect(() => {
    setMinimeret(false);
  }, [sladeshId]);

  // Bekræftelsen forsvinder af sig selv. Den er en mulighed, ikke en besked
  // man skal lukke.
  useEffect(() => {
    if (kvittering === undefined) return;
    const timer = setTimeout(() => setKvittering(undefined), KVITTERING_MS);
    return () => clearTimeout(timer);
  }, [kvittering]);

  if (mig === undefined) return <p className="midtstillet">Henter din profil …</p>;
  if (mig === null) return <p className="midtstillet">Opretter din profil …</p>;

  const channelId = mig.activeChannelId;
  const harKanal = mig.joinedChannelIds.length > 0;

  // Førstegangsforløbet vises kun til dem, der faktisk er nye: uden Kanal OG
  // uden at have været igennem det før. De 32 migrerede brugere har begge
  // dele på plads og skal ikke bydes velkommen til en app, de har brugt i
  // årevis.
  if (mig.onboardingCompleted !== true && !harKanal) {
    return <Onboarding mig={mig} />;
  }

  const jegErModtager =
    aktivSladesh !== undefined &&
    aktivSladesh !== null &&
    aktivSladesh.recipientId === mig._id;

  if (jegErModtager && !minimeret) {
    return (
      <SladeshOvertagelse
        udfordring={aktivSladesh}
        onMinimer={() => setMinimeret(true)}
        // En afgjort Sladesh kan ikke fortrydes, så den har hverken logId
        // eller vægt — kun nummeret, så kvitteringerne kan skelnes.
        onAfgjort={(tekst) =>
          setKvittering({ id: ++kvitteringNummer.current, tekst })
        }
      />
    );
  }

  return (
    <div className="skal">
      {/* INGEN header på Mig. Den fane har sin egen top — profilrækken med
          avatar, navn og "Ballade · tirsdag" — og en kanaltitel oven over
          ville være to lag titel, hvor mockuppen har ét. Se
          design/Main.dc.html og `Profilundertekst` i Mig.tsx.

          Kanalskifteren forsvinder dermed fra Mig. Det er med vilje: man
          skifter Kanal dér, hvor Kanalen er. */}
      {fane !== "mig" && (
        <header className="top">
          <div className="sidetitel">
            {/* TITLEN ER EN TITEL. Den var selv knappen, med en ▾ efter sig
                — men en overskrift, der også er en kontrol, ligner mest af
                alt en overskrift, og ▾'en var for lille til at læses som
                andet end pynt. Skiftet har sin egen knap nu, til højre.
                Se design/Stilling.dc.html. */}
            <h1 className="kanalnavn">
              {harKanal ? <KanalNavn channelId={channelId} /> : "Ingen Kanal"}
            </h1>

            {/* Skallen VÆLGER kun hvilken undertekst der monteres; hver af dem
                henter sit eget tal. Se Sideundertekst.tsx. */}
            {channelId !== undefined && (
              <Sideundertekst skaerm={visning} channelId={channelId} />
            )}
          </div>

          <button
            className="kanalskift"
            aria-label={harKanal ? "Skift Kanal" : "Meld dig ind i en Kanal"}
            onClick={() => setKanalAabent(true)}
          >
            <SkiftIkon />
          </button>
        </header>
      )}

      <main className="indhold">
        <Forbindelse />
        <Broadcastbjaelke />

        {jegErModtager && (
          <button className="sladeshbjaelke" onClick={() => setMinimeret(false)}>
            🍺 {aktivSladesh.senderName} har sladeshet dig
            <span className="ur">
              <Ur deadlineAt={aktivSladesh.deadlineAt} />
            </span>
          </button>
        )}

        {aktivSladesh !== undefined &&
          aktivSladesh !== null &&
          aktivSladesh.senderId === mig._id && (
            <div className="venterbjaelke">
              🍺 Venter på at {aktivSladesh.recipientName} gennemfører
              <span className="ur">
                <Ur deadlineAt={aktivSladesh.deadlineAt} />
              </span>
            </div>
          )}

        {fane === "kanal" ? (
          !harKanal || channelId === undefined ? (
            <div className="tom">
              <div className="stort">👋</div>
              <p>Du er ikke i en Kanal endnu.</p>
              <p className="hjaelp">
                Du skal bruge en invitationskode. Den får du af en, der
                allerede er med.
              </p>
              {/* En rigtig knap frem for "tryk på knappen foroven". Den
                  henvisning var kun rigtig, så længe titlen SELV var
                  knappen — og selv da skulle man lede efter den. */}
              <button className="knap primaer" onClick={() => setKanalAabent(true)}>
                Meld dig ind i en Kanal
              </button>
            </div>
          ) : (
            <>
              <Faner
                valg={[
                  { id: "stilling", etiket: "Stilling" },
                  {
                    id: "chat",
                    etiket: "Chat",
                    prik:
                      ulaeste?.find((k) => k.channelId === channelId)?.ulaest ===
                      true,
                  },
                  { id: "kort", etiket: "Kort" },
                  { id: "historik", etiket: "Historik" },
                ]}
                aktiv={visning}
                onVaelg={setVisning}
              />

              {visning === "stilling" ? (
                <Stilling
                  channelId={channelId}
                  minUserId={mig._id}
                  onVaelgPerson={setValgtPerson}
                />
              ) : visning === "chat" ? (
                <Chat
                  channelId={channelId}
                  minUserId={mig._id}
                  onVaelgPerson={setValgtPerson}
                />
              ) : visning === "historik" ? (
                <Historik channelId={channelId} onVaelgPerson={setValgtPerson} />
              ) : (
                <Suspense fallback={<p className="midtstillet">Henter kortet …</p>}>
                  <Kort channelId={channelId} onVaelgPerson={setValgtPerson} />
                </Suspense>
              )}
            </>
          )
        ) : (
          <Mig
            channelId={channelId}
            onOplaasninger={(ider) =>
              setOplaasninger((koe) => [...koe, ...ider])
            }
          />
        )}
      </main>

      <nav className="nav">
        <button
          className="navknap"
          aria-current={fane === "kanal" ? "page" : undefined}
          onClick={() => setFane("kanal")}
        >
          <span className="ikon">
            <KanalIkon />
          </span>
          Kanal
        </button>

        <button
          className="logknap"
          aria-label="Log en genstand"
          onClick={() => setLogAabent(true)}
        >
          <PlusIkon />
        </button>

        <button
          className="navknap"
          aria-current={fane === "mig" ? "page" : undefined}
          onClick={() => setFane("mig")}
        >
          <span className="ikon">
            <MigIkon />
          </span>
          Mig
        </button>
      </nav>

      {kvittering !== undefined && (
        <Kvittering
          tekst={kvittering.tekst}
          logId={kvittering.logId}
          vaegt={kvittering.vaegt}
          channelId={channelId}
          minUserId={mig._id}
          onFaerdig={() => setKvittering(undefined)}
        />
      )}

      {logAabent && (
        <LogArk
          channelId={channelId}
          onLuk={() => setLogAabent(false)}
          onLogget={modtagLogning}
        />
      )}

      {/* Sætter `data-tema` på <html>, når Ballade har et festivaltema slået
          til. Tegner intet selv — se docs/kanaltemaer.md. */}
      <Kanaltema channelId={channelId} />

      {oplaasninger.length > 0 && (
        <AchievementOplaasning
          achievementId={oplaasninger[0]}
          onLuk={() => setOplaasninger((koe) => koe.slice(1))}
        />
      )}

      {kanalAabent && (
        <KanalVaelger aktivId={channelId} onLuk={() => setKanalAabent(false)} />
      )}

      {valgtPerson !== undefined && (
        <Personkort
          userId={valgtPerson}
          minUserId={mig._id}
          channelId={channelId}
          onLuk={() => setValgtPerson(undefined)}
        />
      )}
    </div>
  );
}

/**
 * Nedtællingen i en bjælke.
 *
 * Egen komponent, så kun den gentegner hvert sekund. Lå tikket i skallen,
 * ville hele appen gentegne 600 gange i løbet af en Sladesh.
 */
function Ur({ deadlineAt }: { deadlineAt: number }) {
  const [nu, setNu] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNu(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{formatUr(deadlineAt - nu)}</>;
}

/** Kanalens navn i toppen. Egen komponent, så kun den henter opslaget. */
function KanalNavn({ channelId }: { channelId: Id<"kanaler"> | undefined }) {
  const kanal = useCachetQuery(
    `kanal:${channelId ?? "ingen"}`,
    api.kanaler.getKanal,
    channelId === undefined ? "skip" : { channelId },
  );

  if (channelId === undefined) return <>Vælg Kanal</>;
  return <>{kanal?.name ?? "…"}</>;
}

/**
 * Fortryd-bekræftelsen.
 *
 * Fortryd står HER frem for i en logbog, man skal finde. Det er sekunderne
 * lige efter, man kommer til at trykke forkert, at man vil af med den igen.
 */
function Kvittering({
  tekst,
  logId,
  vaegt,
  channelId,
  minUserId,
  onFaerdig,
}: {
  tekst: string;
  logId?: Id<"drinkLogs">;
  /** Hvad logningen vejede i stillingen. Bruges til at trække den fra igen. */
  vaegt?: number;
  channelId?: Id<"kanaler">;
  minUserId?: Id<"users">;
  onFaerdig: () => void;
}) {
  // `withOptimisticUpdate` får kun mutationens egne argumenter, og
  // `removeDrink` tager kun et logId — serveren har jo selv resten. Vægten og
  // Kanalen kender KVITTERINGEN, fordi den lige har vist logningen, så de
  // rækkes ind gennem en ref frem for at blive hentet forfra.
  const info = useRef({ vaegt, channelId, minUserId });
  info.current = { vaegt, channelId, minUserId };

  const removeDrink = useMutation(api.drinkLogs.removeDrink).withOptimisticUpdate(
    (localStore) => {
      const { vaegt, channelId, minUserId } = info.current;
      if (vaegt === undefined || channelId === undefined || minUserId === undefined) {
        return;
      }

      const raekker = localStore.getQuery(api.scoreboard.getScoreboard, {
        channelId,
      });
      if (raekker === undefined) return;

      localStore.setQuery(
        api.scoreboard.getScoreboard,
        { channelId },
        udenGenstand(raekker, minUserId, vaegt),
      );
    },
  );

  const [arbejder, setArbejder] = useState(false);
  const [fejl, setFejl] = useState<string | undefined>();

  const fortryd = async () => {
    if (logId === undefined) return;
    setArbejder(true);
    try {
      await removeDrink({ logId });
      onFaerdig();
    } catch (error) {
      setFejl(fejltekst(error));
      setArbejder(false);
    }
  };

  return (
    <div className="kvittering" role="status">
      <span className="tekst">{fejl ?? tekst}</span>
      {fejl === undefined && logId !== undefined && (
        <button disabled={arbejder} onClick={() => void fortryd()}>
          Fortryd
        </button>
      )}
    </div>
  );
}

function LoginSkaerm() {
  const { signIn, signUp, signInWithGoogle, error } = useAuth();
  const [email, setEmail] = useState("");
  const [kodeord, setKodeord] = useState("");
  const [opretter, setOpretter] = useState(false);
  const [arbejder, setArbejder] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setArbejder(true);
    try {
      if (opretter) await signUp(email, kodeord);
      else await signIn(email, kodeord);
    } catch {
      // Fejlen vises via AuthContext.error.
    } finally {
      setArbejder(false);
    }
  };

  return (
    <div className="login">
      <h1>SladeshApp</h1>
      <p className="under">
        {opretter ? "Opret en konto." : "Log ind med din sædvanlige konto."}
      </p>

      <form onSubmit={(event) => void send(event)}>
        <input
          className="felt"
          type="email"
          value={email}
          placeholder="Email"
          autoComplete="email"
          required
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          className="felt"
          type="password"
          value={kodeord}
          placeholder="Adgangskode"
          autoComplete={opretter ? "new-password" : "current-password"}
          required
          onChange={(event) => setKodeord(event.target.value)}
        />
        <button className="knap primaer" type="submit" disabled={arbejder}>
          {opretter ? "Opret konto" : "Log ind"}
        </button>
      </form>

      <button className="knap" onClick={() => void signInWithGoogle()}>
        Fortsæt med Google
      </button>

      <button className="skift" onClick={() => setOpretter(!opretter)}>
        {opretter
          ? "Jeg har allerede en konto"
          : "Opret en konto i stedet"}
      </button>

      {error !== null && <p className="fejl">{error}</p>}
    </div>
  );
}
