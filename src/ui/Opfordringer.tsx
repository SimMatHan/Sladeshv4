import { Hjemmeskaermopfordring } from "./Hjemmeskaermopfordring";
import { Pushopfordring } from "./Pushopfordring";
import { useHjemmeskaerm } from "./useHjemmeskaerm";

/**
 * De ting, appen selv beder om — højst én ad gangen.
 *
 * Der er to: en plads på hjemmeskærmen, og lov til at sende
 * notifikationer. Begge er bjælker i samme form på samme plads øverst i
 * indholdet, og begge kan lukkes.
 *
 * ## Hvorfor de ikke må stå samtidig
 *
 * To bjælker oven på hinanden er ikke to gode råd. Det er en app, der
 * plager — og den, der læser dem, lukker som regel begge to uden at læse
 * nogen af dem.
 *
 * ## Hvorfor hjemmeskærmen har forrang
 *
 * Ikke fordi den er vigtigst, men fordi den er FØRST. På iPhone virker
 * Web Push udelukkende fra hjemmeskærmen, så "slå notifikationer til" er
 * et tilbud, der ikke kan tages imod, før appen ligger der. At spørge i
 * den rækkefølge er ikke en prioritering, det er den eneste rækkefølge,
 * der giver mening.
 *
 * Lukker man hjemmeskærmsbjælken, kommer push-bjælken ved næste
 * indlæsning. Hver af dem husker sit eget nej.
 */
export function Opfordringer() {
  const { vis } = useHjemmeskaerm();

  return (
    <>
      <Hjemmeskaermopfordring />
      <Pushopfordring tavs={vis} />
    </>
  );
}
