import { useEffect, useState, type CSSProperties } from "react";
import {
  OPSTARTSTRIN,
  SIDSTE_TRIN,
  SKAAL,
  UDGANG_MS,
  opstartstekst,
  opstartstrin,
  tilNaesteTrin,
  tilUdgang,
} from "./opstartsregler";

/**
 * Opstartsskærmen — det, man ser, mens appen kommer op.
 *
 * ## Hvad den viser
 *
 * En mand ved en bardisk, der bunder en øl, mens en ring af grinende emojis
 * kredser om ham. Det er hele
 * appen i ét billede: man drikker, man logger det, og de andre griner.
 *
 * Venter man længe, går det ham på. Glasset bliver ikke fyldt op igen, han
 * bliver utålmodig, så rasende, og til sidst giver han op — og teksten
 * følger med, fra "Skænker op …" til "Genstart appen". Tidslinjen står i
 * opstartsregler.ts.
 *
 * ## Tre sekunder, og så skål
 *
 * Skærmen ligger OVEN PÅ appen — se `Indgang` i App.tsx. Appen tegnes bag
 * den, så snart den kan, og bruger tiden på at hente. Skærmen går, når
 * appen er `klar` OG skærmen har stået i mindst tre sekunder: teksten
 * bliver til "Skål!", manden løfter et fyldt glas, emojierne springer ud
 * til siderne, og hele skærmen zoomer væk ind i appen.
 *
 * Tre sekunder er et valg, ikke en ventetid. Appen er som regel klar før,
 * men en skærm, der blinker væk efter et halvt sekund, ligner en fejl, og
 * en animation, ingen når at se, er ikke værd at have. Det, der ikke er
 * hentet, når den går, viser selv "Henter …" — kun profilen venter den på,
 * se `Appen` i App.tsx.
 *
 * ## Ren CSS 3D, ingen pakke
 *
 * docs/redesign-kontrakt.md afsnit 2: intet animationsbibliotek. Dybden er
 * `transform-style: preserve-3d`:
 *
 *   - Bardisken er en forside og en plade, der er vippet ind i rummet.
 *   - Emojierne står i en ring i rummet, og ringen drejer. Manden står i
 *     samme 3D-rum, så de emojis, der er bag ham, ER bag ham.
 *
 * Alt animeres med `transform` og `opacity`. Ingen bredde, højde eller
 * filter — det er dem, der får en ældre telefon til at hakke, og det er
 * netop den telefon, der står længst tid på den her skærm.
 */
export function Opstart({
  begyndt,
  klar,
  status,
  onFaerdig,
}: {
  /** Ventetidens nul i `performance.now()`. Teksterne regnes herfra. */
  begyndt: number;
  /** Om det, der ligger under, kan vises. Skærmen går først, når det er. */
  klar: boolean;
  /** Hvad appen venter på lige nu. Intet, når den ikke venter på noget. */
  status?: string;
  /** Når udgangen er spillet, og skærmen kan tages ned. */
  onFaerdig: () => void;
}) {
  // Hvornår skærmen blev VIST. De tre sekunder regnes herfra og ikke fra
  // `begyndt`: har siden stået tom i to sekunder, mens JavaScript'en
  // hentede, skal animationen stadig have sine tre.
  const [vistFra] = useState(() => performance.now());
  const [trin, setTrin] = useState(() => opstartstrin(vistFra - begyndt));
  const [gaar, setGaar] = useState(false);
  const offline = useOffline();

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
    if (gaar) return;
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
  }, [trin, begyndt, gaar]);

  // Går, når det under er klar, og skærmen har stået længe nok. Bliver det
  // UKLART igen inden da — en profil, der viser sig ikke at findes og skal
  // oprettes — bliver den stående.
  useEffect(() => {
    if (!klar || gaar) return;
    const ur = setTimeout(
      () => setGaar(true),
      tilUdgang(performance.now() - vistFra),
    );
    return () => clearTimeout(ur);
  }, [klar, gaar, vistFra]);

  // Væk, når udgangen er spillet. Et ur frem for `animationend`: med
  // reduceret bevægelse er animationerne nul lange, og et event, der ikke
  // kommer, ville efterlade en usynlig skærm oven på appen.
  useEffect(() => {
    if (!gaar) return;
    const ur = setTimeout(onFaerdig, UDGANG_MS);
    return () => clearTimeout(ur);
  }, [gaar, onFaerdig]);

  const humoer = gaar ? "skaal" : OPSTARTSTRIN[trin].humoer;

  return (
    <div
      className={gaar ? "opstart ud" : "opstart"}
      data-humoer={humoer}
      data-trin={trin}
      aria-busy={!gaar}
    >
      <ShakaSymbol />
      <Bobler />

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
        <p key={gaar ? "skaal" : trin} className="opstartraab">
          {gaar ? SKAAL : opstartstekst(trin, offline)}
        </p>
        {/* Linjen står der altid — tom, når der ikke ventes på noget — så
            teksten over den ikke hopper, når den forsvinder. */}
        <p className="opstartstatus">
          {gaar ? "\u00a0" : offline ? "Ingen dækning" : (status ?? "\u00a0")}
        </p>
        {trin === SIDSTE_TRIN && !gaar && (
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

/** Ringen: drikkevarer og grin på skift, og shakaen. */
const EMOJIS = ["🍺", "😂", "🍻", "🤣", "🥂", "😆", "🤙", "🍹"];

/**
 * Shakaen — appens ikon — som tryk på mandens trøje.
 *
 * Farven er `currentColor`, så trykket selv bestemmer den. Folderne mellem
 * fingrene er en separat gruppe, der kun vises, når `--shakafold` er sat.
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
