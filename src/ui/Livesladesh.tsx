import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Ur } from "./Ur";

/**
 * Sladesh, mens den sker — med beviserne, efterhånden som de kommer ind.
 *
 * ## Hvorfor den findes
 *
 * En Sladesh var indtil nu usynlig for alle andre end de to indblandede.
 * Afsenderen så en venterbjælke, modtageren så overtagelsesskærmen, og
 * resten af Kanalen så ingenting — selvom det er dét, hele legen går ud på
 * at se på.
 *
 * Nu står den øverst på stillingen, så længe den kører: hvem mod hvem, hvor
 * lang tid der er igen, og de to billeder, som de bliver taget.
 *
 * ## Billederne er KUN synlige, mens den kører
 *
 * Det er hele grænsen, og den er sat med vilje. `getSladeshHistorik` — det
 * afgjorte arkiv — viser stadig kun billeder til de to parter, og er ikke
 * rørt. Se kommentaren over `getLiveSladesh` i convex/sladesh.ts for
 * hvorfor de to har hver sin regel.
 *
 * Konsekvensen er, at denne skærm ikke kan vise et eneste billede taget,
 * før den blev bygget: en aktiv udfordring lever højst én frist. Det var
 * betingelsen for at udvide — man kan altid åbne mere, aldrig lukke igen.
 *
 * ## Tomme pladser er fremdrift
 *
 * De to rammer står der fra begyndelsen, også før der er taget noget. Det
 * er dét, der gør ventetiden læselig: man kan se, at der mangler et billede,
 * frem for at gætte, om der overhovedet sker noget.
 */
export function Livesladesh({ channelId }: { channelId: Id<"kanaler"> }) {
  const live = useQuery(api.sladesh.getLiveSladesh, { channelId });

  // Vis intet, du ikke ved. `undefined` er "henter" — se
  // docs/redesign-kontrakt.md afsnit 7.
  if (live === undefined || live.length === 0) return null;

  return (
    <div className="livesladesher">
      {live.map((sladesh) => (
        <div key={sladesh.challengeId} className="livesladesh" role="status">
          <div className="livetop">
            <span className="livenavne">
              🍺 <strong>{sladesh.senderName}</strong> har sladeshet{" "}
              <strong>{sladesh.recipientName}</strong>
            </span>
            <span className="liveur">
              <Ur deadlineAt={sladesh.deadlineAt} />
            </span>
          </div>

          <div className="livebeviser">
            <Bevis billede={sladesh.foerBillede} etiket="Fyldt" />
            <Bevis billede={sladesh.efterBillede} etiket="Tom" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Ét bevis — eller pladsen, hvor det kommer til at stå.
 *
 * `alt` beskriver hvad billedet ER, ikke at det er et billede: en
 * skærmlæser siger allerede "billede" af sig selv, og "Billede af fyldt
 * genstand" ville blive læst op som "billede billede af …".
 */
function Bevis({ billede, etiket }: { billede: string | null; etiket: string }) {
  if (billede === null) {
    return (
      <div className="bevis mangler">
        <span className="etiket">{etiket}</span>
      </div>
    );
  }

  return (
    <div className="bevis">
      <img src={billede} alt={`${etiket} genstand`} loading="lazy" />
      <span className="etiket">{etiket}</span>
    </div>
  );
}
