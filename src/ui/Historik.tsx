import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { DRINK_CATEGORIES } from "../../convex/constants";
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
  const dage = useQuery(api.historik.getKanalHistorik, { channelId, dage: DAGE });
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
    <div className="historik">
      {/* Søjlerne er ikke en knap: de er en oversigt, man læser på ét blik.
          Selve valget sker i listen nedenunder, hvor målene er store nok til
          en tommelfinger. */}
      <div className="soejler" aria-hidden="true">
        {dage.map((dag) => (
          <div key={dag.dayStart} className="soejleplads">
            <div
              className={
                dag.dayStart === udfoldet ? "soejle valgt" : "soejle"
              }
              style={{ height: `${Math.round((dag.genstande / maks) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="soejletekst">
        <span>{datoKort(dage[0].dayStart)}</span>
        <span>i dag</span>
      </div>

      <div className="dage">
        {/* Nyeste øverst. Aksen læses venstre mod højre, men en liste læses
            oppefra — og det, man leder efter, er som regel i går. */}
        {[...dage].reverse().map((dag) => (
          <div key={dag.dayStart}>
            <button
              className="dagraekke"
              aria-expanded={dag.dayStart === udfoldet}
              onClick={() =>
                setUdfoldet(dag.dayStart === udfoldet ? undefined : dag.dayStart)
              }
            >
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
        ))}
      </div>
    </div>
  );
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
function datoKort(dayStart: number): string {
  return new Date(dayStart).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
  });
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
