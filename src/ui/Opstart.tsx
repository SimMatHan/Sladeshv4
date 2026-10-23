import { useEffect, useState, type CSSProperties } from "react";
import {
  OPSTARTSTRIN,
  SIDSTE_TRIN,
  opstartstekst,
  opstartstrin,
  tilNaesteTrin,
} from "./opstartsregler";

/**
 * Opstartsskærmen — det, man ser, mens appen kommer op.
 *
 * Den afløser FIRE tekster: "Indlæser …", "Logger ind …", "Henter din
 * profil …" og "Opretter din profil …". For brugeren er det én ventetid,
 * og den skal se sådan ud: én scene, der kører videre, og ét ur, der ikke
 * starter forfra, fordi appen skifter fra det ene trin til det næste.
 *
 * ## Hvad den viser
 *
 * Appens ikon som en tyk 3D-flise, der drejer, og under den en mand, der
 * bunder en øl, mens en ring af grinende emojis kredser om ham. Det er hele
 * appen i ét billede: man drikker, man logger det, og de andre griner.
 *
 * Venter man længe, går det ham på. Glasset bliver ikke fyldt op igen, han
 * bliver utålmodig, så rasende, og til sidst giver han op — og teksten
 * følger med, fra "Skænker op …" til "Genstart appen". Tidslinjen står i
 * opstartsregler.ts.
 *
 * ## Ren CSS 3D, ingen pakke
 *
 * docs/redesign-kontrakt.md afsnit 2: intet animationsbibliotek. Dybden er
 * `transform-style: preserve-3d`:
 *
 *   - Flisen er en STAK af lag med en pixel eller to imellem. Set forfra er
 *     det én flade; drejet ser man stakken fra siden, og den læses som en
 *     massiv klods. Shakaen er stablet oven på flisen på samme måde.
 *   - Emojierne står i en ring i rummet, og ringen drejer. Manden står i
 *     samme 3D-rum, så de emojis, der er bag ham, ER bag ham.
 *
 * Alt animeres med `transform` og `opacity`. Ingen bredde, højde eller
 * filter — det er dem, der får en ældre telefon til at hakke, og det er
 * netop den telefon, der står længst tid på den her skærm.
 *
 * ## Uret starter, da VENTETIDEN startede
 *
 * Skærmen monteres flere steder fra — `Indgang` og `Appen` i App.tsx — og
 * React tager den ned og op igen, når der skiftes imellem dem. Uden noget
 * at holde fast i ville teksten hoppe tilbage til "Skænker op …" og manden
 * starte forfra midt i en slurk.
 *
 * Derfor deles starttidspunktet af alle udgaver af skærmen (se
 * `ventetidBegyndt`), og hver animation får det som negativ forsinkelse
 * (`--opstart-forskudt`). Så står en ny udgave præcis, hvor den forrige
 * slap.
 */
export function Opstart({ status }: { status: string }) {
  // Starttidspunktet læses ÉN gang, i den første tegning. Se
  // `ventetidBegyndt` for hvorfor det ikke er "nu".
  const [begyndt] = useState(ventetidBegyndt);
  // Hvor langt inde i ventetiden DENNE udgave blev sat op. Også låst ved
  // første tegning: regnet forfra ved hver gentegning ville forsinkelsen
  // flytte sig, mens animationerne kører, og så hopper de alle sammen,
  // hver gang teksten skifter.
  const [forskudt] = useState(() => performance.now() - begyndt);
  const [trin, setTrin] = useState(() => opstartstrin(forskudt));
  const offline = useOffline();

  useEffect(() => {
    monterede++;
    return () => {
      monterede--;
      sidstSlut = performance.now();
    };
  }, []);

  // Ét ur til NÆSTE skift, ikke en interval. Der sker ingenting imellem.
  //
  // MINDST ÉT TRIN FREM, når det fyrer. Et ur kan fyre en anelse før tid —
  // timerne og `performance.now()` går ikke helt i takt — og så ville
  // trinnet blive regnet til det samme som før. React tegner ikke om for en
  // uændret værdi, der bliver ikke sat et nyt ur, og skærmen sidder fast på
  // "Kom nu …" for altid. Det skete i hver anden kørsel i Chromium.
  // `opstartstrin` vinder, hvis uret tværtimod er kommet SENT, fordi
  // telefonen har ligget i lommen.
  useEffect(() => {
    const ventetid = tilNaesteTrin(performance.now() - begyndt);
    if (ventetid === undefined) return;
    const ur = setTimeout(
      () =>
        setTrin((forrige) =>
          Math.max(forrige + 1, opstartstrin(performance.now() - begyndt)),
        ),
      ventetid,
    );
    return () => clearTimeout(ur);
  }, [trin, begyndt]);

  const { humoer } = OPSTARTSTRIN[trin];

  return (
    <div
      className="opstart"
      data-humoer={humoer}
      data-trin={trin}
      aria-busy="true"
      style={
        {
          "--opstart-forskudt": `${-Math.round(forskudt)}ms`,
        } as CSSProperties
      }
    >
      <ShakaSymbol />
      <Bobler />

      <div className="opstartlogo" aria-hidden="true">
        <div className="logosvaev">
          <div className="logodrej">
            {FLISELAG.map((lag) => (
              <span
                key={lag}
                className={
                  lag === 0 || lag === FLISELAG.length - 1
                    ? "logoflise flade"
                    : "logoflise"
                }
                style={{ "--lag": lag } as CSSProperties}
              />
            ))}
            {SHAKALAG.map((lag) => (
              <svg
                key={`for-${lag}`}
                className={lag === SHAKALAG.length - 1 ? "logoshaka oeverst" : "logoshaka"}
                style={{ "--lag": lag } as CSSProperties}
                viewBox="0 0 100 100"
              >
                <use href="#opstart-shaka" />
              </svg>
            ))}
            {SHAKALAG.map((lag) => (
              <svg
                key={`bag-${lag}`}
                className={
                  lag === SHAKALAG.length - 1 ? "logoshaka bag oeverst" : "logoshaka bag"
                }
                style={{ "--lag": lag } as CSSProperties}
                viewBox="0 0 100 100"
              >
                <use href="#opstart-shaka" />
              </svg>
            ))}
          </div>
        </div>
        <span className="logoskygge" />
      </div>

      <div className="opstartscene" aria-hidden="true">
        <div className="opstartrum">
          <span className="scenegulv" />
          <Mand />
          {/* Bardisken foran ham. Den er grunden til, at han kan stå
              afskåret ved maven, og den står i rummet, så emojierne kan
              passere bag og foran den. */}
          <div className="bardisk">
            <span className="diskplade" />
            <span className="diskfront" />
          </div>
          <div className="emojiring">
            <div className="ringdrej">
              {EMOJIS.map((emoji, i) => (
                <span
                  key={emoji}
                  className="ringplads"
                  style={
                    {
                      "--vinkel": `${(360 / EMOJIS.length) * i}deg`,
                      "--nr": i,
                    } as CSSProperties
                  }
                >
                  <span className="ringvend">
                    <span className="ringgrin">{emoji}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="opstarttekst" role="status" aria-live="polite">
        {/* `key` på trinnet: hver ny tekst skal slå ind, ikke bare skifte.
            Det er dét, der gør, at man opdager, at den er blevet værre. */}
        <p key={trin} className="opstartraab">
          {opstartstekst(trin, offline)}
        </p>
        <p className="opstartstatus">{offline ? "Ingen dækning" : status}</p>
        {trin === SIDSTE_TRIN && (
          <button
            className="knap primaer opstartknap"
            onClick={() => window.location.reload()}
          >
            Genstart appen
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ ventetiden */

/**
 * Hvor mange udgaver af skærmen, der er monteret lige nu, og hvornår den
 * sidste blev taget ned. Modulets egen tilstand, fordi den skal overleve
 * netop det, React gør: at tage komponenten ned og sætte en ny op.
 */
let monterede = 0;
let sidstSlut = Number.NEGATIVE_INFINITY;
let begyndtVed: number | undefined;

/**
 * Hvor længe en pause mellem to skærme må vare, før det er en NY ventetid.
 *
 * Skiftet fra `Indgang` til `Appen` sker i én og samme tegning, så pausen
 * er i praksis nul. Grænsen er der for alt det, vi ikke har tænkt på — et
 * enkelt billede af noget andet imellem må ikke nulstille uret.
 */
const SAMMENHAENG_MS = 1000;

/**
 * Hvornår den ventetid, skærmen viser, begyndte — i `performance.now()`.
 *
 * Den FØRSTE ventetid regnes fra 0, altså fra da siden begyndte at
 * indlæse. Det er dér, brugeren begyndte at vente: står JavaScript-filerne
 * og henter i seks sekunder på en dårlig forbindelse, er det seks sekunder
 * med en tom skærm, og så er "Kom nu …" det ærlige første ord.
 *
 * En SENERE ventetid — efter man har logget ud og ind igen — regnes fra
 * nu. Ellers ville tiden på login-skærmen tælle med, og den, der brugte et
 * minut på at huske sin kode, ville blive mødt af "Genstart appen".
 *
 * Kaldes, mens den nye skærm tegnes. Den gamle er ikke taget ned endnu på
 * det tidspunkt — det sker først, når React lægger ændringen ud — så
 * `monterede > 0` er netop tegnet på, at det er SAMME ventetid.
 */
function ventetidBegyndt(): number {
  const nu = performance.now();
  if (begyndtVed === undefined) {
    begyndtVed = 0;
  } else if (monterede === 0 && nu - sidstSlut > SAMMENHAENG_MS) {
    begyndtVed = nu;
  }
  return begyndtVed;
}

/** Sand, når browseren selv mener, at der ingen forbindelse er. */
function useOffline(): boolean {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const op = () => setOffline(false);
    const ned = () => setOffline(true);
    window.addEventListener("online", op);
    window.addEventListener("offline", ned);
    return () => {
      window.removeEventListener("online", op);
      window.removeEventListener("offline", ned);
    };
  }, []);
  return offline;
}

/* ---------------------------------------------------------------- tegning */

/**
 * Lagene i flisen og i shakaen.
 *
 * Flere lag giver en tættere side, når den drejer, men hvert lag er et
 * element mere i et 3D-rum, browseren skal sortere. Tolv og seks er dér,
 * hvor siden ser massiv ud på en telefon, uden at stakken kan tælles.
 */
const FLISELAG = Array.from({ length: 12 }, (_, i) => i);
const SHAKALAG = Array.from({ length: 6 }, (_, i) => i);

/** Ringen: drikkevarer og grin på skift, og shakaen. */
const EMOJIS = ["🍺", "😂", "🍻", "🤣", "🥂", "😆", "🤙", "🍹"];

/**
 * Shakaen — appens ikon — tegnet ÉN gang og brugt af alle lagene.
 *
 * Farven er `currentColor`, så hvert lag selv bestemmer, om det er side
 * eller forside. Folderne mellem fingrene er en separat gruppe, der kun
 * vises på det øverste lag; på siderne ville de ligne striber.
 */
function ShakaSymbol() {
  return (
    <svg className="opstartsymboler" aria-hidden="true">
      <symbol id="opstart-shaka" viewBox="0 0 100 100">
        <g
          fill="currentColor"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 26 L34 44" strokeWidth="12" fill="none" />
          <path d="M62 66 L82 57" strokeWidth="10" fill="none" />
          <path
            d="M24 34 C28 50 34 62 44 71 C50 76 59 74 66 67 L68 46 C60 39 50 38 36 44 Z"
            strokeWidth="5"
          />
          <rect x="47" y="35" width="23" height="11" rx="5.5" strokeWidth="1" />
          <rect x="46" y="45" width="24" height="11" rx="5.5" strokeWidth="1" />
          <rect x="47" y="55" width="21" height="10" rx="5" strokeWidth="1" />
        </g>
        {/* Stregens farve kommer gennem en variabel, fordi CSS'en ikke
            kan ramme ind i en `<use>` — men en arvet variabel kan. */}
        <g
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
          style={{ stroke: "var(--shakafold, none)" }}
        >
          <path d="M50 46 L68 46" />
          <path d="M50 56 L67 56" />
        </g>
      </symbol>
    </svg>
  );
}

/**
 * Manden. Set fra siden, vendt mod højre, med glasset i hånden.
 *
 * Han er bygget som en dukke: armen drejer om skulderen, glasset om
 * hånden, hovedet om nakken. Hver stemning er sit eget sæt keyframes på de
 * samme led — se `[data-humoer]` i index.css. Ansigterne ligger alle fire i
 * markup'en, og CSS'en viser det ene, stemningen kalder på.
 */
function Mand() {
  return (
    <svg className="mand" viewBox="0 0 200 200">
      <g className="mandkrop">
        <path
          className="troeje"
          d="M36 200 C36 166 58 146 92 146 C126 146 148 166 148 200 Z"
        />
        <use
          href="#opstart-shaka"
          className="troejetryk"
          x="80"
          y="152"
          width="24"
          height="24"
        />
        <rect className="hud" x="82" y="116" width="20" height="34" rx="8" />
        <circle className="hud adamsaeble" cx="100" cy="136" r="3" />
      </g>

      <g className="mandhoved">
        <circle className="hud" cx="92" cy="88" r="34" />
        <ellipse className="hud" cx="78" cy="94" rx="7" ry="9" />
        <path className="oereskal" d="M77 89 Q82 94 77 99" />
        <circle className="hud" cx="125" cy="93" r="7" />
        <path
          className="haar"
          d="M60 96 C52 62 70 48 92 50 C112 51 124 60 126 74 C114 66 100 66 90 72 C84 68 76 70 74 80 C70 82 66 88 64 98 Z"
        />
        <ellipse className="kind" cx="109" cy="102" rx="7" ry="4.5" />

        <g className="ansigt glad">
          <path className="streg" d="M100 86 Q106 79 112 86" />
          <path className="streg" d="M98 73 Q105 69 113 72" />
          <path className="mund" d="M104 106 Q118 124 130 105 Z" />
          <path className="tunge" d="M112 113 Q119 119 125 112 Z" />
        </g>

        <g className="ansigt sur">
          <circle className="oeje" cx="107" cy="85" r="3.4" />
          <path className="streg" d="M98 75 L115 79" />
          <path className="streg" d="M108 110 Q117 107 126 109" />
        </g>

        <g className="ansigt raab">
          <circle className="oeje" cx="107" cy="86" r="3.4" />
          <path className="streg tyk" d="M97 73 L116 81" />
          <path className="mund" d="M104 104 L130 102 L128 120 L108 121 Z" />
          <path className="taender" d="M105 105 L129 103 L129 107 L105 109 Z" />
        </g>

        <g className="ansigt sover">
          <path className="streg" d="M100 86 Q106 90 112 86" />
          <path className="streg" d="M99 76 Q106 75 113 78" />
          <ellipse className="mund" cx="118" cy="111" rx="4" ry="5" />
        </g>

        <g className="damp">
          <circle cx="76" cy="80" r="6" />
          <circle cx="92" cy="54" r="7" />
          <circle cx="70" cy="86" r="5" />
        </g>

        <g className="zzz">
          <text x="120" y="56">z</text>
          <text x="132" y="40">z</text>
          <text x="146" y="22">Z</text>
        </g>
      </g>

      <g className="mandarm">
        <path className="aerme" d="M106 156 Q136 152 146 114" />
        <g className="glas">
          <g className="oel">
            <rect className="oelvaeske" x="145" y="86" width="22" height="45" rx="3" />
            <rect className="oelskum" x="142" y="80" width="28" height="11" rx="5.5" />
            <circle className="oelboble" cx="151" cy="124" r="1.6" />
            <circle className="oelboble" cx="161" cy="114" r="1.3" />
            <circle className="oelboble" cx="155" cy="100" r="1.1" />
          </g>
          <path className="glaskant" d="M142 80 L144 132 L168 132 L170 80" />
          {/* Hånden: knoen på glassets kant og fire fingre hen over det. */}
          <circle className="hud" cx="146" cy="107" r="8" />
          <rect className="hud" x="142" y="98" width="15" height="5" rx="2.5" />
          <rect className="hud" x="142" y="103.5" width="16" height="5" rx="2.5" />
          <rect className="hud" x="142" y="109" width="15" height="5" rx="2.5" />
          <rect className="hud" x="142" y="114.5" width="13" height="5" rx="2.5" />
        </g>
      </g>

      <circle className="draabe" cx="0" cy="0" r="3.4" />
    </svg>
  );
}

/**
 * Bobler, der stiger op bag det hele. Faste tal frem for tilfældige: så
 * ser skærmen ens ud hver gang, og der er intet at regne ud ved montering.
 */
const BOBLER = [
  { x: 6, s: 10, d: 7.0, f: 0.0 },
  { x: 14, s: 6, d: 5.5, f: 2.1 },
  { x: 22, s: 14, d: 8.5, f: 4.0 },
  { x: 31, s: 8, d: 6.2, f: 1.2 },
  { x: 39, s: 5, d: 4.8, f: 3.3 },
  { x: 47, s: 12, d: 7.6, f: 5.1 },
  { x: 55, s: 7, d: 5.9, f: 0.7 },
  { x: 63, s: 16, d: 9.0, f: 2.8 },
  { x: 71, s: 6, d: 5.2, f: 4.4 },
  { x: 79, s: 11, d: 7.3, f: 1.6 },
  { x: 87, s: 8, d: 6.6, f: 3.8 },
  { x: 94, s: 13, d: 8.1, f: 0.4 },
];

function Bobler() {
  return (
    <div className="opstartbobler" aria-hidden="true">
      {BOBLER.map((boble) => (
        <span
          key={boble.x}
          style={
            {
              "--x": `${boble.x}%`,
              "--str": `${boble.s}px`,
              "--varighed": `${boble.d}s`,
              "--fase": `${boble.f}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
