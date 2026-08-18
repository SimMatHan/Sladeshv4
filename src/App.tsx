import { useEffect, useState, type FormEvent } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useAuth } from "./contexts/AuthContext";
import { fejltekst } from "./lib/visning";
import { KanalVaelger } from "./ui/KanalVaelger";
import { LogArk } from "./ui/LogArk";
import { Mig } from "./ui/Mig";
import { Personkort } from "./ui/Personkort";
import { Stilling } from "./ui/Stilling";

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
  const mig = useQuery(api.users.getMe, {});
  const createUser = useMutation(api.users.createUser);

  const [fane, setFane] = useState<Fane>("kanal");
  const [visning, setVisning] = useState<Visning>("stilling");
  const [logAabent, setLogAabent] = useState(false);
  const [kanalAabent, setKanalAabent] = useState(false);
  const [valgtPerson, setValgtPerson] = useState<Id<"users"> | undefined>();
  const [kvittering, setKvittering] = useState<
    { tekst: string; logId: Id<"drinkLogs"> } | undefined
  >();

  // Første login efter signup: profilen findes endnu ikke i Convex. Vi
  // opretter den uden at spørge — brugeren har allerede sagt ja til at være
  // her ved at logge ind, og et ekstra trin ville kun være i vejen.
  useEffect(() => {
    if (mig === null) void createUser({});
  }, [mig, createUser]);

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

  return (
    <div className="skal">
      <header className="top">
        <button className="kanalknap" onClick={() => setKanalAabent(true)}>
          {harKanal ? <KanalNavn channelId={channelId} /> : "Vælg Kanal"}
          <span className="pil">▾</span>
        </button>
      </header>

      <main className="indhold">
        {fane === "kanal" ? (
          !harKanal || channelId === undefined ? (
            <div className="tom">
              <div className="stort">👋</div>
              <p>Du er ikke i en Kanal endnu.</p>
              <p className="hjaelp">
                Tryk på <strong>Vælg Kanal</strong> foroven for at melde dig ind
                med en kode — eller oprette din egen.
              </p>
            </div>
          ) : (
            <>
              <div className="segmenter" role="tablist">
                {(
                  [
                    ["stilling", "Stilling"],
                    ["chat", "Chat"],
                    ["kort", "Kort"],
                    ["historik", "Historik"],
                  ] as const
                ).map(([id, etiket]) => (
                  <button
                    key={id}
                    role="tab"
                    className="segment"
                    aria-selected={visning === id}
                    onClick={() => setVisning(id)}
                  >
                    {etiket}
                  </button>
                ))}
              </div>

              {visning === "stilling" ? (
                <Stilling
                  channelId={channelId}
                  minUserId={mig._id}
                  onVaelgPerson={setValgtPerson}
                />
              ) : (
                // Pladsen står med vilje åben. Arkitekturen er besluttet, og
                // de tre visninger bygges én ad gangen — det er tydeligere at
                // vise hvor de lander end at skjule dem, indtil de er der.
                <KommerSenere visning={visning} />
              )}
            </>
          )
        ) : (
          <Mig channelId={channelId} />
        )}
      </main>

      <nav className="nav">
        <button
          className="navknap"
          aria-current={fane === "kanal" ? "page" : undefined}
          onClick={() => setFane("kanal")}
        >
          <span className="ikon">🏆</span>
          Kanal
        </button>

        <button
          className="logknap"
          aria-label="Log en genstand"
          onClick={() => setLogAabent(true)}
        >
          +
        </button>

        <button
          className="navknap"
          aria-current={fane === "mig" ? "page" : undefined}
          onClick={() => setFane("mig")}
        >
          <span className="ikon">👤</span>
          Mig
        </button>
      </nav>

      {kvittering !== undefined && (
        <Kvittering
          tekst={kvittering.tekst}
          logId={kvittering.logId}
          onFaerdig={() => setKvittering(undefined)}
        />
      )}

      {logAabent && (
        <LogArk
          channelId={channelId}
          onLuk={() => setLogAabent(false)}
          onLogget={(tekst, logId) => setKvittering({ tekst, logId })}
        />
      )}

      {kanalAabent && (
        <KanalVaelger aktivId={channelId} onLuk={() => setKanalAabent(false)} />
      )}

      {valgtPerson !== undefined && (
        <Personkort
          userId={valgtPerson}
          onLuk={() => setValgtPerson(undefined)}
        />
      )}
    </div>
  );
}

/** Kanalens navn i toppen. Egen komponent, så kun den henter opslaget. */
function KanalNavn({ channelId }: { channelId: Id<"kanaler"> | undefined }) {
  const kanal = useQuery(
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
  onFaerdig,
}: {
  tekst: string;
  logId: Id<"drinkLogs">;
  onFaerdig: () => void;
}) {
  const removeDrink = useMutation(api.drinkLogs.removeDrink);
  const [arbejder, setArbejder] = useState(false);
  const [fejl, setFejl] = useState<string | undefined>();

  const fortryd = async () => {
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
      <span className="tekst">{fejl ?? `${tekst} logget`}</span>
      {fejl === undefined && (
        <button disabled={arbejder} onClick={() => void fortryd()}>
          Fortryd
        </button>
      )}
    </div>
  );
}

function KommerSenere({ visning }: { visning: Visning }) {
  const tekster: Record<string, { ikon: string; hvad: string }> = {
    chat: { ikon: "💬", hvad: "Kanalens chat" },
    kort: { ikon: "📍", hvad: "Kortet med beacons" },
    historik: { ikon: "📈", hvad: "Kanalens aktivitet dag for dag" },
  };
  const { ikon, hvad } = tekster[visning];

  return (
    <div className="tom">
      <div className="stort">{ikon}</div>
      <p>{hvad}</p>
      <p className="hjaelp">Bygges i næste omgang. Backenden er klar.</p>
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
