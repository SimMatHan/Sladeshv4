import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { MIN_AKTIVE_FELTER } from "../../convex/straffehjulRules";
import { Ark } from "./Ark";
import { dunk, slag, tik } from "./haptik";
import { farveindeks, forkort, slutvinkel, vaelgPlads } from "./straffehjulValg";

/**
 * Straffehjulet — drej, og gør hvad det siger.
 *
 * Åbnes fra hjulknappen i Kanal-fanens top. Felterne styres under
 * Admin → Hjul og er de samme for alle Kanaler.
 *
 * ## Resultatet er trukket, FØR hjulet drejer
 *
 * `vaelgPlads` kaldes én gang, og slutvinklen regnes ud fra svaret. Se
 * straffehjulValg.ts — det er samme princip som skæbnens hjul i log-arket.
 *
 * ## Intet gemmes
 *
 * Drejet er en leg ved bordet. Det logger ingenting, tæller ikke på
 * stillingen og låser intet op — se convex/straffehjul.ts.
 *
 * ## `prefers-reduced-motion`
 *
 * Slås op i JavaScript. Drejet er en CSS-`transition` på fire sekunder, og
 * den globale regel ville korte den ned, men landingen venter på en timer,
 * der ikke kender den regel. Har man bedt om ro, står hjulet med det samme.
 */

/** Så længe drejer hjulet. Skal passe med `.straffehjulskive` i CSS'en. */
const DREJETID_MS = 4200;

/** Over så mange felter er der kun plads til emojien på hjulet. */
const KUN_EMOJI_OVER = 12;

/**
 * Felternes farver. Kuglens palet, fordi den allerede er afstemt til både
 * mørkt og lyst tema og bærer `--orb-tekst` ovenpå.
 */
const PALET = ["--orb-a", "--orb-e", "--orb-f", "--orb-c", "--orb-b"];

type Felt = Pick<Doc<"hjulfelter">, "_id" | "tekst" | "emoji">;

type Tilstand =
  | { slags: "klar" }
  | { slags: "drejer"; vinder: Felt }
  | { slags: "landet"; vinder: Felt };

export function Straffehjul({ onLuk }: { onLuk: () => void }) {
  const felter = useQuery(api.straffehjul.getFelter, {});

  const [tilstand, setTilstand] = useState<Tilstand>({ slags: "klar" });
  const [vinkel, setVinkel] = useState(0);

  /*
   * Hjulet tegnes af et FROSSET sæt felter fra det øjeblik, det drejer.
   *
   * Retter en admin i felterne midt i et drej, ville hjulet ellers tegne sig
   * om under viseren og lande på et andet felt end det, der blev trukket.
   * Det frosne sæt slippes først ved næste drej.
   */
  const [frosne, setFrosne] = useState<Felt[] | undefined>();
  const timere = useRef<number[]>([]);

  useEffect(() => () => timere.current.forEach((t) => clearTimeout(t)), []);

  if (felter === undefined) {
    return (
      <Ark titel="Straffehjulet" onLuk={onLuk}>
        <p className="midtstillet">Henter …</p>
      </Ark>
    );
  }

  const vist = frosne ?? felter;
  const kanDreje = felter.length >= MIN_AKTIVE_FELTER && tilstand.slags !== "drejer";

  const drej = () => {
    if (felter.length < MIN_AKTIVE_FELTER) return;
    tik();

    const plads = vaelgPlads(felter.length);
    const vinder = felter[plads];
    if (vinder === undefined) return;

    setFrosne(felter);

    const land = () => {
      setTilstand({ slags: "landet", vinder });
      slag();
    };

    const roligt = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Uden animation er der ingen grund til at snurre fem gange rundt —
    // hjulet stilles bare, så viseren peger det rigtige sted.
    setVinkel((nu) => slutvinkel(nu, plads, felter.length, roligt ? 0 : 5));

    if (roligt) {
      land();
      return;
    }

    setTilstand({ slags: "drejer", vinder });
    // Et stød halvvejs, så drejet også kan mærkes i en larmende bar.
    timere.current = [
      window.setTimeout(dunk, DREJETID_MS / 3),
      window.setTimeout(land, DREJETID_MS),
    ];
  };

  return (
    <Ark titel="Straffehjulet" onLuk={onLuk}>
      {vist.length < MIN_AKTIVE_FELTER ? (
        <div className="tom">
          <div className="stort">🎡</div>
          <p>Hjulet har ikke nok felter endnu.</p>
          <p className="hjaelp">
            Der skal mindst {MIN_AKTIVE_FELTER} til. En admin kan tilføje dem under
            Admin → Hjul.
          </p>
        </div>
      ) : (
        <div className="straffehjul">
          <div className="straffehjulramme">
            {/* Viseren står stille; det er skiven under den, der drejer. */}
            <div className="straffehjulviser" aria-hidden="true" />
            <Skive felter={vist} vinkel={vinkel} />
          </div>

          {/* `role="status"`: resultatet annonceres, når det står der.
              Skiven selv er `aria-hidden` — en skærmlæser skal have
              straffen, ikke en beskrivelse af en tegning. */}
          <div className="straffehjulresultat" role="status">
            {tilstand.slags === "landet" ? (
              <>
                <span className="etiket">Hjulet har talt</span>
                <div className="straffehjulstraf">
                  {tilstand.vinder.emoji !== undefined && (
                    <span className="hjulemoji">{tilstand.vinder.emoji}</span>
                  )}
                  {tilstand.vinder.tekst}
                </div>
              </>
            ) : tilstand.slags === "drejer" ? (
              <span className="etiket">Hjulet drejer …</span>
            ) : (
              <span className="hjaelp">
                {felter.length} felter på hjulet. Drej, og gør hvad det siger.
              </span>
            )}
          </div>

          <button className="knap primaer" disabled={!kanDreje} onClick={drej}>
            {tilstand.slags === "landet" ? "Drej igen" : "Drej"}
          </button>
        </div>
      )}
    </Ark>
  );
}

/** Radius i viewBox-enheder. ViewBoxen er 200×200 med (0,0) i midten. */
const R = 96;

/** Navets radius — den tomme plet i midten, som teksten starter udenfor. */
const NAV = 14;

function Skive({ felter, vinkel }: { felter: readonly Felt[]; vinkel: number }) {
  const antal = felter.length;
  const bredde = 360 / antal;
  const kunEmoji = antal > KUN_EMOJI_OVER;
  // Smallere felter, mindre tekst. Grænserne er prøvet af på en 375 px bred skærm.
  const skrift = antal <= 6 ? 9.5 : antal <= 10 ? 7.5 : 7;

  return (
    <svg
      className="straffehjulskive"
      viewBox="-100 -100 200 200"
      aria-hidden="true"
      style={{ transform: `rotate(${vinkel}deg)` }}
    >
      {felter.map((felt, i) => {
        const fra = i * bredde;
        const midt = fra + bredde / 2;
        const farve = PALET[farveindeks(i, antal, PALET.length)];
        const tekst = kunEmoji
          ? (felt.emoji ?? forkort(felt.tekst, 3))
          : `${felt.emoji ?? ""} ${forkort(felt.tekst, 13)}`.trim();

        return (
          <g key={felt._id}>
            <path d={stykke(fra, fra + bredde)} style={{ fill: `var(${farve})` }} />
            {/* Teksten løber langs radius, fra navet og ud mod kanten, med
                emojien inderst. `rotate(midt - 90)` lægger +x-aksen ud
                gennem feltets midte. */}
            <text
              className="straffehjultekst"
              transform={`rotate(${midt - 90})`}
              x={NAV + 5}
              y={0}
              fontSize={kunEmoji ? 11 : skrift}
            >
              {tekst}
            </text>
          </g>
        );
      })}
      <circle className="straffehjulnav" r={NAV} />
    </svg>
  );
}

/** SVG-stien for et lagkagestykke fra `fra` til `til` grader. */
function stykke(fra: number, til: number): string {
  const [x1, y1] = punkt(fra);
  const [x2, y2] = punkt(til);
  const stor = til - fra > 180 ? 1 : 0;
  return `M0 0 L${x1} ${y1} A${R} ${R} 0 ${stor} 1 ${x2} ${y2} Z`;
}

/** Punktet på kanten, `grader` med uret fra klokken tolv. */
function punkt(grader: number): [number, number] {
  const rad = (grader * Math.PI) / 180;
  return [round(R * Math.sin(rad)), round(-R * Math.cos(rad))];
}

function round(tal: number): number {
  return Math.round(tal * 100) / 100;
}
