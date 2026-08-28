import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { DRINK_CATEGORIES } from "../../convex/constants";
import { useCachetQuery } from "../lib/oejebliksbillede";
import { genstande, klokken } from "../lib/visning";

/**
 * Kanalens aktivitet, dag for dag.
 *
 * Fjerde og sidste visning under Kanal. Stillingen svarer på "hvem fører lige
 * nu"; det her svarer på "hvad skete der i tirsdags".
 *
 * Dagene er DRIKKEDAGE (kl. 10:00 → kl. 10:00), som alt andet i appen. En
 * aften der fortsætter til klokken tre står derfor under aftenen før — det er
 * hele grunden til, at grænsen ikke ligger ved midnat.
 *
 * Dagens logninger hentes først, når man folder den ud. Havde oversigten
 * indeholdt hver eneste række, ville det koste hele periodens data at åbne
 * fanen.
 */

/** Hvor mange dage aksen viser. */
const DAGE = 14;

export function Historik({
  channelId,
  onVaelgPerson,
}: {
  channelId: Id<"kanaler">;
  onVaelgPerson: (userId: Id<"users">) => void;
}) {
  // Cachet, ikke rå `useQuery`. Historikken er en FANE, man skifter til og
  // fra hele aftenen, og hvert skift afmelder queryen og starter den forfra
  // — så stod der "Henter historikken …" i et øjeblik, hver eneste gang.
  // Nøglen bærer Kanalen, ellers ville et kanalskift vise den forriges
  // historik et øjeblik. Samme mønster som Stillingen.
  const dage = useCachetQuery(`historik:${channelId}`, api.historik.getKanalHistorik, {
    channelId,
    dage: DAGE,
  });
  const [udfoldet, setUdfoldet] = useState<number | undefined>();

  if (dage === undefined) {
    return <p className="midtstillet">Henter historikken …</p>;
  }

  const maks = Math.max(...dage.map((dag) => dag.genstande), 1);
  const total = dage.reduce((sum, dag) => sum + dag.genstande, 0);

  if (total === 0) {
    return (
      <div className="tom">
        <div className="stort">📈</div>
        <p>Ingen aktivitet de seneste {DAGE} dage.</p>
        <p className="hjaelp">Log en genstand, så begynder kurven.</p>
      </div>
    );
  }

  return (
    <div className="historik skaerm-ind">
      {/* Søjlerne er ikke en knap: de er en oversigt, man læser på ét blik.
          Selve valget sker i listen nedenunder, hvor målene er store nok til
          en tommelfinger. */}
      <div className="kort soejlekort">
        <div className="soejler" aria-hidden="true">
          {dage.map((dag, nummer) => (
            <div key={dag.dayStart} className="soejleplads">
              <div
                className={soejleklasse(
                  dag.dayStart === udfoldet,
                  nummer === dage.length - 1,
                )}
                style={{
                  height: `${Math.round((dag.genstande / maks) * 100)}%`,
                }}
              />
            </div>
          ))}
        </div>

        {/* Ugedagen under hver søjle frem for to datoer i enderne: man læser
            "T" hurtigere end "12. aug.", og aksen bliver læsbar hele vejen
            i stedet for kun i kanterne. */}
        <div
          className="soejledage"
          aria-hidden="true"
          style={{
            gridTemplateColumns: `repeat(${dage.length}, minmax(0, 1fr))`,
          }}
        >
          {dage.map((dag, nummer) => (
            <span
              key={dag.dayStart}
              className={nummer === dage.length - 1 ? "etiket idag" : "etiket"}
            >
              {ugedagsbogstav(dag.dayStart)}
            </span>
          ))}
        </div>

        {/* Tre tal, der ikke fandtes før: man kunne se formen, men ikke hvad
            den lagde op til. Alle tre er regnet af de dage, der vises. */}
        <div className="soejlesum">
          <div>
            <span className="etiket">I alt</span>
            <span className="tal">{genstande(total)}</span>
          </div>
          <div>
            <span className="etiket">Snit pr. dag</span>
            <span className="tal">{genstande(total / dage.length)}</span>
          </div>
          <div>
            <span className="etiket">Bedste dag</span>
            <span className="tal">{genstande(maks)}</span>
          </div>
        </div>
      </div>

      <div className="dage">
        {/* Nyeste øverst. Aksen læses venstre mod højre, men en liste læses
            oppefra — og det, man leder efter, er som regel i går. */}
        {[...dage].reverse().map((dag) => {
          // Aksen er ældst-først, så den SIDSTE dag i `dage` er i dag. Testen
          // stod to gange herunder — på rækken og på brikken — og to kopier af
          // "hvilken dag er i dag" er to steder, den kan komme til at flytte
          // sig hver for sig.
          const erIDag = dag.dayStart === dage[dage.length - 1].dayStart;
          return (
            <div key={dag.dayStart}>
              <button
                className={erIDag ? "dagraekke idag" : "dagraekke"}
                aria-expanded={dag.dayStart === udfoldet}
                onClick={() =>
                  setUdfoldet(
                    dag.dayStart === udfoldet ? undefined : dag.dayStart,
                  )
                }
              >
                {/* Datobrikken giver listen noget fast at scanne ned ad —
                  samme rolle som avataren i stillingen. */}
                <span
                  className={erIDag ? "datobrik idag" : "datobrik"}
                  aria-hidden="true"
                >
                  {new Date(dag.dayStart).getDate()}
                </span>
                <span className="midt">
                  <span className="navn">{datoLang(dag.dayStart)}</span>
                  <span className="under">
                    {dag.deltagere === 0
                      ? "ingen aktivitet"
                      : dag.topNavn !== undefined
                        ? `${dag.deltagere} med · ${dag.topNavn} førte`
                        : `${dag.deltagere} med`}
                  </span>
                </span>
                <span className="talblok">
                  <span className="tal">{genstande(dag.genstande)}</span>
                  <span className="etiket">Genstande</span>
                </span>
              </button>

              {dag.dayStart === udfoldet && (
                <Dag
                  channelId={channelId}
                  dayStart={dag.dayStart}
                  onVaelgPerson={onVaelgPerson}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Søjlens klasse. Både den valgte og dagens står i fuld accent — resten i
 * den dæmpede tone, se `.soejle` i index.css.
 */
function soejleklasse(valgt: boolean, erIDag: boolean): string {
  if (valgt) return "soejle valgt";
  return erIDag ? "soejle idag" : "soejle";
}

/** Én dags logninger. Hentes først når dagen foldes ud. */
function Dag({
  channelId,
  dayStart,
  onVaelgPerson,
}: {
  channelId: Id<"kanaler">;
  dayStart: number;
  onVaelgPerson: (userId: Id<"users">) => void;
}) {
  const logninger = useQuery(api.historik.getKanalDag, { channelId, dayStart });

  if (logninger === undefined) {
    return <p className="hjaelp dagliste">Henter …</p>;
  }

  if (logninger.length === 0) {
    return <p className="hjaelp dagliste">Der skete ingenting.</p>;
  }

  return (
    <div className="dagliste">
      {logninger.map((logning) => (
        <button
          key={logning.logId}
          className={logning.fortrudt ? "logning fortrudt" : "logning"}
          onClick={() => onVaelgPerson(logning.userId)}
        >
          <span className="emoji">{emojiFor(logning.categoryId)}</span>
          <span className="midt">
            <span className="navn">{logning.navn}</span>
            <span className="under">
              {logning.variationName}
              {logning.sizeLabel !== undefined && ` · ${logning.sizeLabel}`}
              {logning.fortrudt && " · fortrudt"}
            </span>
          </span>
          <span className="tid">{klokken(logning.timestamp)}</span>
        </button>
      ))}
    </div>
  );
}

function emojiFor(categoryId: string): string {
  return DRINK_CATEGORIES.find((k) => k.id === categoryId)?.emoji ?? "🥤";
}

/** "ons. 13. aug." — kort nok til en akse. */
/** Dansk ugedagsforbogstav. Samme tabel som Stimestribe.tsx. */
function ugedagsbogstav(dayStart: number): string {
  return ["S", "M", "T", "O", "T", "F", "L"][new Date(dayStart).getDay()];
}

/**
 * "I dag", "I går" eller "onsdag den 13. august".
 *
 * De to seneste dage får et navn frem for en dato. Det er sådan man taler om
 * dem — og det er dem, man leder efter.
 */
function datoLang(dayStart: number): string {
  const iDag = nulstilTilDag(Date.now());
  const dagen = nulstilTilDag(dayStart);
  const doegn = Math.round((iDag - dagen) / (24 * 60 * 60 * 1000));

  if (doegn === 0) return "I dag";
  if (doegn === 1) return "I går";

  return new Date(dayStart).toLocaleDateString("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Kalenderdagen et tidspunkt hører til, som et rundt tal.
 *
 * Bruges KUN til at sige "i dag" og "i går" i en overskrift. Drikkedagens
 * rigtige grænse ligger på serveren; her handler det om, hvad datoen hedder.
 */
function nulstilTilDag(tidspunkt: number): number {
  const d = new Date(tidspunkt);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
