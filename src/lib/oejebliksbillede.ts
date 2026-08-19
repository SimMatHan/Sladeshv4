import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

/**
 * Sidst kendte svar, gemt lokalt.
 *
 * Convex holder selv fast i sine queries, så længe appen er ÅBEN: `useQuery`
 * bliver ved med at give sidste værdi, selv når forbindelsen ryger. Men ved en
 * KOLDSTART — appen åbnet på ny, ude på en bar med to bjælker — er hver query
 * `undefined`, indtil websocket'en står. Det er de sekunder, hvor appen føles
 * død, og hvor man i praksis får skeletter i stedet for tal.
 *
 * `useCachetQuery` maler det, der stod sidst, med det samme og lader Convex
 * skrive henover, så snart det rigtige svar lander. Ét lag, ingen synkronisering
 * at holde styr på: localStorage skrives KUN af serverens svar og læses KUN,
 * når der endnu ikke er et.
 *
 * Kun til LÆSNING. Skrivninger går aldrig gennem det her — de står i Convex'
 * egen kø og sendes igen ved genforbindelse.
 *
 * Hvad der IKKE gemmes: positioner. Et kort over hvem der var hvor i går aftes,
 * liggende i klartekst på telefonen, er ikke noget vi har brug for.
 */

const PRAEFIKS = "sladesh:snapshot:";

/**
 * Ældre end det her vises ikke.
 *
 * En stilling fra i går ville være direkte misvisende — drikkedagen er en ny.
 * Tolv timer holder den inden for samme aften, og alt derover er alligevel
 * hurtigere at hente end at bortforklare.
 */
const HOLDBARHED_MS = 12 * 60 * 60 * 1000;

/**
 * Loft per nøgle. En stilling fylder et par kB; rammer noget loftet, er der
 * noget galt, og så er det bedre at lade være end at fylde brugerens lager.
 */
const MAKS_TEGN = 128 * 1024;

type Pakke = { ejer: string; gemt: number; vaerdi: unknown };

/**
 * Hvem øjebliksbilledet tilhører.
 *
 * Uden dette ville en telefon, hvor to personer har været logget ind, kunne
 * vise den forriges stilling i det sekund, appen åbner. Sættes af
 * AuthProvider, når Firebase har afgjort, hvem der er logget ind.
 */
let ejer: string | undefined;

export function saetOejebliksbilledeEjer(ny: string | undefined) {
  if (ejer === ny) return;

  // Ryd kun, når vi FORLADER en kendt bruger — altså ved logud eller skift af
  // konto. Ved koldstart går vi fra "ved det ikke endnu" til en bruger, og
  // der er det gemte netop dét, vi vil vise; ryddede vi her, ville hele
  // øvelsen være spildt.
  if (ejer !== undefined) ryd();

  ejer = ny;
}

function ryd() {
  try {
    const noegler: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const noegle = localStorage.key(i);
      if (noegle !== null && noegle.startsWith(PRAEFIKS)) noegler.push(noegle);
    }
    for (const noegle of noegler) localStorage.removeItem(noegle);
  } catch {
    // Privat browsing kan afvise localStorage helt. Så er der ingen cache,
    // og appen opfører sig præcis som før.
  }
}

function laes(noegle: string): unknown {
  if (ejer === undefined) return undefined;
  try {
    const raa = localStorage.getItem(PRAEFIKS + noegle);
    if (raa === null) return undefined;

    const pakke = JSON.parse(raa) as Pakke;

    // Hører pakken til en anden, ryger den her. Kommer man tilbage til en
    // telefon, hvor en anden har været logget ind, bliver resterne ryddet af
    // sig selv frem for at ligge og fylde.
    if (pakke.ejer !== ejer) {
      localStorage.removeItem(PRAEFIKS + noegle);
      return undefined;
    }

    if (Date.now() - pakke.gemt > HOLDBARHED_MS) return undefined;

    return pakke.vaerdi;
  } catch {
    return undefined;
  }
}

function skriv(noegle: string, vaerdi: unknown) {
  if (ejer === undefined) return;
  try {
    const raa = JSON.stringify({ ejer, gemt: Date.now(), vaerdi } satisfies Pakke);
    if (raa.length > MAKS_TEGN) return;
    localStorage.setItem(PRAEFIKS + noegle, raa);
  } catch {
    // Fuldt lager eller privat browsing. Ikke værd at fejle på — det her er
    // en genvej, ikke en kilde.
  }
}

/**
 * Som `useQuery`, men med sidste kendte svar, indtil det rigtige lander.
 *
 * `noegle` skal indeholde alt, der ændrer svaret — typisk Kanalens id. To
 * Kanaler under samme nøgle ville vise den forkerte stilling i et øjeblik.
 */
export function useCachetQuery<Query extends FunctionReference<"query">>(
  noegle: string,
  query: Query,
  args: FunctionArgs<Query> | "skip",
): FunctionReturnType<Query> | undefined {
  const live = useQuery(query, args as FunctionArgs<Query>);

  // Læses én gang per nøgle — ikke ved hver gentegning, hvor en pakke, der
  // netop er udløbet, ville kunne forsvinde under fødderne på en åben visning.
  // Skifter nøglen (man skifter Kanal), læses den nye med det samme.
  const [cachet, setCachet] = useState(() => ({ noegle, vaerdi: laes(noegle) }));
  if (cachet.noegle !== noegle) {
    setCachet({ noegle, vaerdi: laes(noegle) });
  }

  useEffect(() => {
    if (live === undefined) return;
    skriv(noegle, live);
  }, [live, noegle]);

  if (live !== undefined) return live;
  if (cachet.noegle !== noegle) return undefined;

  return cachet.vaerdi as FunctionReturnType<Query> | undefined;
}
