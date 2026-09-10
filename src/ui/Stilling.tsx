import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCachetQuery } from "../lib/oejebliksbillede";
import { genstande, promille } from "../lib/visning";
import type { StillingSladesh } from "../../convex/sladeshRules";
import { Avatar } from "./Avatar";
import { useFlip } from "./flip";
import { Livesladesh } from "./Livesladesh";
import { Ur } from "./Ur";

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
 *
 * ## Sladesh står PÅ rækken
 *
 * Indtil nu skete Sladesh usynligt for alle andre end de to indblandede: de
 * to bjælker i toppen af skallen viste kun en igangværende udfordring, og
 * kun hvis man selv var afsender eller modtager. Stod man udenfor, kunne man
 * hverken se, at der var en i gang, hvem der havde taget en, eller hvem der
 * havde brugt sin.
 *
 * Nu bærer rækken det, fordi stillingen er der, hvor man i forvejen kigger
 * efter, hvordan aftenen står. Se `Sladeshmaerke` nederst for hvorfor der er
 * netop fire tilstande og ikke flere.
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
      <>
        <Livesladesh channelId={channelId} />
        <div className="tom">
          <div className="stort">🍺</div>
          <p>Ingen er ude endnu.</p>
          <p className="hjaelp">
            Log en genstand med <strong>+</strong>, så kommer du på listen.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Livesladesh channelId={channelId} />
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

              <Sladeshmaerke sladesh={raekke.sladesh} />
            </span>

            <span className="talblok">
              <span className="tal">{genstande(raekke.drinksToday)}</span>
              <br />
              <span className="etiket">genstande</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Sladesh-mærket på en række.
 *
 * ## Fire tilstande, og hvorfor der ikke er flere
 *
 *   modtager   en udfordring er i gang, og DENNE person skal drikke
 *   afsender   personens egen udfordring er ude og venter på svar
 *   tog        personen gennemførte en i aften
 *   brugt      personen har brugt sin ene Sladesh i denne 12-timers blok
 *
 * `failed` og `expired` får ingen markering. Man kan argumentere for et
 * gravsten-mærke, men rækken har plads til én oplysning, og "nåede det
 * ikke" er en dårligere brug af den plads end "tog én" — desuden findes
 * achievementet "Tog den aldrig" allerede til netop dét.
 *
 * ## Rækkefølgen er ikke tilfældig
 *
 * En igangværende udfordring vinder over alt andet, fordi den er det eneste,
 * der ændrer sig, mens man kigger — og det eneste, nogen skal handle på.
 * Derefter "tog", som er en præstation, før "brugt", som blot er en tilstand.
 *
 * Vises der ingenting, er det enten fordi der ikke er noget at sige, eller
 * fordi rækken ikke VED det: en optimistisk række eller en malet fra cachen
 * har ingen `sladesh`. Se `ScoreboardRow` i convex/scoreboard.ts.
 */
function Sladeshmaerke({ sladesh }: { sladesh: StillingSladesh | undefined }) {
  if (sladesh === undefined) return null;

  if (sladesh.aktiv !== undefined) {
    const { rolle, deadlineAt, modpart } = sladesh.aktiv;
    return (
      <span className="sladeshmaerke igang">
        <span className="sladeshtekst">
          {rolle === "modtager" ? `🍺 Sladeshet af ${modpart}` : `⏳ Sendt til ${modpart}`}
        </span>
        {/* Egen komponent, så kun tallet gentegner hvert sekund — ikke hele
            listen. Se Ur.tsx. */}
        <span className="sladeshur">
          <Ur deadlineAt={deadlineAt} />
        </span>
      </span>
    );
  }

  if (sladesh.tog > 0) {
    return (
      <span className="sladeshmaerke tog">
        🍻 Tog {sladesh.tog === 1 ? "en Sladesh" : `${sladesh.tog} Sladesh`}
      </span>
    );
  }

  if (sladesh.brugt) {
    return <span className="sladeshmaerke brugt">Sladesh brugt</span>;
  }

  return null;
}
