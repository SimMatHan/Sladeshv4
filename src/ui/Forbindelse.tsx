import { useEffect, useState } from "react";
import { useConvexConnectionState } from "convex/react";
import {
  harOpdateringKlar,
  lytTilOpdatering,
  opdaterNu,
} from "../lib/serviceworker";

/**
 * Statusbjælken.
 *
 * Det værste ved dårlig dækning er ikke ventetiden — det er ikke at vide, om
 * noget er gået galt. Trykker man Fortryd, og der ikke sker noget, er det så
 * appen der er død, eller er den bare i gang? Uden et svar trykker folk igen.
 *
 * Bjælken vises KUN, når der er noget at sige. Er alt som det skal være, er
 * den ikke der.
 *
 * Egen komponent, fordi `useConvexConnectionState` gentegner ved hver
 * ændring i forbindelsen. Lå den i skallen, ville hele appen gentegne, hver
 * gang en mutation blev sendt.
 */

/**
 * Hvor længe forbindelsen må være væk, før vi siger det.
 *
 * Websocket'en falder kortvarigt ned ved helt almindelige ting — et skift
 * mellem wifi og mobil, en fornyelse af login-tokenet. Sagde vi det med det
 * samme, ville bjælken blinke hele aftenen og betyde ingenting.
 */
const TAALMODIGHED_MS = 3500;

/** Det samme for "gemmer": under det her når man ikke at læse den alligevel. */
const GEMMER_EFTER_MS = 1200;

export function Forbindelse() {
  const forbindelse = useConvexConnectionState();
  const [opdatering, setOpdatering] = useState(harOpdateringKlar);

  const nede = !forbindelse.isWebSocketConnected;
  const gemmer = forbindelse.inflightMutations > 0;

  const nedeLaenge = useEfterVenteTid(nede, TAALMODIGHED_MS);
  const gemmerLaenge = useEfterVenteTid(gemmer, GEMMER_EFTER_MS);

  useEffect(() => lytTilOpdatering(() => setOpdatering(true)), []);

  if (nedeLaenge) {
    return (
      <div className="forbindelse nede" role="status">
        {/* Sagt som en forsikring, ikke en fejl. Convex sender selv ventende
            mutations igen, når der er hul igennem — se docs/offline.md. */}
        Ingen forbindelse · det du logger, sendes når der er dækning
      </div>
    );
  }

  if (gemmerLaenge) {
    return (
      <div className="forbindelse gemmer" role="status">
        Gemmer …
      </div>
    );
  }

  if (opdatering) {
    return (
      <div className="forbindelse ny" role="status">
        Ny version klar
        <button onClick={opdaterNu}>Opdater</button>
      </div>
    );
  }

  return null;
}

/** Sand, når `tilstand` har været sand uafbrudt i mindst `ventetid`. */
function useEfterVenteTid(tilstand: boolean, ventetid: number): boolean {
  const [naaet, setNaaet] = useState(false);

  useEffect(() => {
    if (!tilstand) {
      setNaaet(false);
      return;
    }
    const timer = setTimeout(() => setNaaet(true), ventetid);
    return () => clearTimeout(timer);
  }, [tilstand, ventetid]);

  return naaet && tilstand;
}
