import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCachetQuery } from "../lib/oejebliksbillede";
import { genstande, promille } from "../lib/visning";
import { Avatar } from "./Avatar";
import { useFlip } from "./flip";

/**
 * Stillingen — appens forside.
 *
 * Det er det, folk åbner appen for at se, når de ikke lige skal logge noget,
 * så den er den første visning i Kanal-fanen og kræver ingen tryk at nå.
 *
 * Rækken er en knap: et tryk åbner personkortet. Samme mønster som overalt
 * ellers i appen — et navn er altid noget, man kan trykke på.
 *
 * Rækkerne GLIDER, når stillingen skifter — se `useFlip`. Overhalingen er
 * hele det øjeblik, appen findes for, og den var indtil nu usynlig: man så
 * listen før og listen efter, aldrig selve skiftet.
 */
export function Stilling({
  channelId,
  minUserId,
  onVaelgPerson,
}: {
  channelId: Id<"kanaler">;
  minUserId: Id<"users"> | undefined;
  onVaelgPerson: (userId: Id<"users">) => void;
}) {
  // Reaktiv af sig selv: logger en anden en genstand, flytter rækken sig her
  // uden at nogen skal hente noget igen.
  //
  // Nøglen bærer Kanalen, ellers ville et skift vise den forriges stilling i
  // et øjeblik. Det gemte er sidste kendte stilling — den maler skærmen med
  // det samme ved koldstart og bliver skrevet over, så snart serveren svarer.
  const raekker = useCachetQuery(`stilling:${channelId}`, api.scoreboard.getScoreboard, {
    channelId,
  });

  // Nøglerne skal beregnes FØR de tidlige returneringer: en hook må ikke
  // stå efter en betinget exit. `useMemo` holder listen stabil, så FLIP'ens
  // effekt ikke kører på hver eneste tegning, kun når rækkefølgen ændrer sig.
  const noegler = useMemo(
    () => (raekker ?? []).map((raekke) => raekke.userId as string),
    [raekker],
  );
  const listen = useFlip(noegler);

  if (raekker === undefined) {
    return <p className="midtstillet">Henter stillingen …</p>;
  }

  if (raekker.length === 0) {
    return (
      <div className="tom">
        <div className="stort">🍺</div>
        <p>Ingen er ude endnu.</p>
        <p className="hjaelp">
          Log en genstand med <strong>+</strong>, så kommer du på listen.
        </p>
      </div>
    );
  }

  return (
    <div className="raekker skaerm-ind" ref={listen}>
      {raekker.map((raekke, plads) => (
        <button
          key={raekke.userId}
          className={raekke.userId === minUserId ? "raekke mig" : "raekke"}
          onClick={() => onVaelgPerson(raekke.userId)}
        >
          <span className={`plads p${plads + 1}`}>{plads + 1}</span>

          <Avatar emoji={raekke.avatar} navn={raekke.name} farve={raekke.color} />

          <span className="midt">
            <span className="navn">{raekke.name}</span>
            <span className="under hjaelp">
              {raekke.streak > 0 && <span>🔥 {raekke.streak}</span>}
              {/* Promillen er kun med for dem der selv har slået den til og
                  udfyldt vægt og køn. Resten får ingen kolonne — et opdigtet
                  tal ved siden af et rigtigt er værre end et tomt felt. */}
              {raekke.promille !== undefined && (
                <span>{promille(raekke.promille)}</span>
              )}
            </span>
          </span>

          <span className="talblok">
            <span className="tal">{genstande(raekke.drinksToday)}</span>
            <br />
            <span className="etiket">genstande</span>
          </span>
        </button>
      ))}
    </div>
  );
}
