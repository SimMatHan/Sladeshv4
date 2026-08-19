import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCachetQuery } from "../lib/oejebliksbillede";
import { genstande, promille } from "../lib/visning";
import { Avatar } from "./Avatar";

/**
 * Stillingen — appens forside.
 *
 * Det er det, folk åbner appen for at se, når de ikke lige skal logge noget,
 * så den er den første visning i Kanal-fanen og kræver ingen tryk at nå.
 *
 * Rækken er en knap: et tryk åbner personkortet. Samme mønster som overalt
 * ellers i appen — et navn er altid noget, man kan trykke på.
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
    <div className="raekker">
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
            <span className="under">
              {raekke.streak > 0 && <span>🔥 {raekke.streak}</span>}
              {/* Promillen er kun med for dem der selv har slået den til og
                  udfyldt vægt og køn. Resten får ingen kolonne — et opdigtet
                  tal ved siden af et rigtigt er værre end et tomt felt. */}
              {raekke.promille !== undefined && (
                <span>{promille(raekke.promille)}</span>
              )}
            </span>
          </span>

          <span className="tal">
            <span className="stort">{genstande(raekke.drinksToday)}</span>
            <br />
            <span className="enhed">genstande</span>
          </span>
        </button>
      ))}
    </div>
  );
}
