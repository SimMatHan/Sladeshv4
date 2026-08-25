import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { drikkedageBagud, getDrinkDayStart } from "../../convex/constants";

/**
 * Stimen — de seneste syv drikkedage som en stribe.
 *
 * ## Hvorfor den findes
 *
 * `currentDayStreak` og `longestStreak` stod som ét tal i en dæmpet linje
 * under ringene: "1.284 point i alt · længste stræk 31 dage". Det er ægte
 * information, men det ligner en fodnote, og et tal alene siger ikke, om man
 * er ved at tabe stimen i aften.
 *
 * Striben viser de syv dage, tallet er lavet af. Et hul er til at få øje på,
 * og dagen i dag står som en tom ring, der kan fyldes — det er hele pointen
 * med at åbne appen dagen derpå.
 *
 * ## Ingen ny backend
 *
 * Dagene kommer fra `drikkedageBagud` i convex/constants.ts, den samme akse
 * historikken bruger, og de fyldte dage udledes af ens egne logninger.
 * Ingen ny query, intet nyt felt — se docs/redesign-kontrakt.md afsnit 6.
 *
 * Afledningen står her i komponenten frem for i et delt lag, af samme grund
 * som `udledSaedvanlige` i LogArk.tsx: den er ren præsentation af data, der
 * allerede hentes, og den bruges ét sted.
 */

/** Antal dage i striben. Syv fylder én række på en telefon. */
const DAGE = 7;

/**
 * Hvor mange logninger vi ser tilbage i.
 *
 * Skal dække syv drikkedage med god margin. En rigtig tung aften i Ballade
 * ligger omkring 15 genstande for én person, så 200 rækker langt forbi
 * ugen — og det er samme loft, log-arket allerede henter med.
 */
const HISTORIK_DYBDE = 200;

/** Dansk ugedagsforbogstav. `getDay()`: 0 = søndag. */
const UGEDAG = ["S", "M", "T", "O", "T", "F", "L"] as const;

export function Stimestribe({ stime }: { stime: number }) {
  const mineLogs = useQuery(api.drinkLogs.getDrinkLogsForUser, {
    limit: HISTORIK_DYBDE,
  });

  const dage = useMemo(() => {
    const nu = Date.now();
    const akse = drikkedageBagud(nu, DAGE);
    const iDag = getDrinkDayStart(nu);

    // Nulstillinger og fortrydelser tæller ikke med: en genstand, man
    // fortrød, gjorde ikke dagen til en drikkedag. Samme regel som
    // `udledSaedvanlige` i LogArk.tsx.
    const fyldte = new Set<number>();
    for (const log of mineLogs ?? []) {
      if (log.isReset === true) continue;
      if (log.action === "remove") continue;
      fyldte.add(getDrinkDayStart(log.timestamp));
    }

    return akse.map((dayStart) => {
      const dato = new Date(dayStart);
      return {
        dayStart,
        bogstav: UGEDAG[dato.getDay()],
        dato: dato.getDate(),
        ude: fyldte.has(dayStart),
        erIDag: dayStart === iDag,
      };
    });
  }, [mineLogs]);

  return (
    <div className="kort stime">
      <div className="stimetal">
        <span className="stimeflamme" aria-hidden="true">
          <FlammeIkon />
          <span className="stimeantal">{stime}</span>
        </span>
        <span className="etiket">{stime === 1 ? "Dag" : "Dage"}</span>
      </div>

      <ol className="stimedage">
        {dage.map((dag) => (
          <li key={dag.dayStart} className="stimedag">
            <span className={dag.erIDag ? "etiket stimeidag" : "etiket"}>
              {dag.bogstav}
            </span>
            <span
              className={prikklasse(dag.ude, dag.erIDag)}
              // Bogstavet ovenover er ikke nok for en skærmlæser — to
              // torsdage i træk hedder begge "T".
              aria-label={`${dag.dato}. ${dag.ude ? "ude" : "ikke ude"}`}
            >
              {dag.dato}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function prikklasse(ude: boolean, erIDag: boolean): string {
  if (ude) return "stimeprik fyldt";
  // I dag uden logning endnu: en ring, der kan fyldes — ikke et hul.
  if (erIDag) return "stimeprik idag";
  return "stimeprik";
}

/** Flammen bag stimetallet. Fyldt, ikke streg — den er en flade, ikke et ikon. */
function FlammeIkon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1.2-.4-2-.4-2 2.4 1.4 3.4 3.4 3.4 5.5A6 6 0 0 1 6 14.5C6 9 12 8 12 2z" />
    </svg>
  );
}
