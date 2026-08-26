import { useLayoutEffect, useRef } from "react";

/**
 * FLIP — rækker der GLIDER forbi hinanden i stedet for at teleportere.
 *
 * Stillingen er reaktiv: logger nogen en genstand, flytter deres række sig
 * med det samme. Indtil nu hoppede den — man så listen FØR og listen EFTER,
 * aldrig selve overhalingen, som er hele det øjeblik, appen findes for.
 *
 * ## Teknikken
 *
 * First, Last, Invert, Play. Vi måler hvor hver række står FØR browseren
 * tegner den nye rækkefølge, måler igen bagefter, og skubber så hver række
 * tilbage til sin gamle plads med en `transform` — for straks at animere
 * den tilbage til nul.
 *
 * Browseren har allerede lagt rækkerne rigtigt hele tiden. Det eneste, der
 * bevæger sig, er en transform, og den koster ingen layout — derfor kan en
 * liste på tredive rækker gøre det på en telefon uden at hakke.
 *
 * `useLayoutEffect` og ikke `useEffect`: den anden måling skal ske EFTER
 * React har lagt DOM'en om og FØR browseren når at tegne den. Med
 * `useEffect` ville man se et glimt af den nye rækkefølge, før animationen
 * begyndte — altså præcis det hop, det hele handler om at fjerne.
 *
 * ## Tre spærrer, og de er der alle sammen af en grund
 *
 * 1. FØRSTE tegning animeres ikke. Der er ingen "før" at glide fra, og
 *    listen har i forvejen sin egen indkørsel (`.raekker > *` i index.css).
 *    Uden spærren ville de to animationer køre oven i hinanden.
 *
 * 2. Kun rækker, der fandtes BEGGE gange, flyttes. En ny række har ingen
 *    gammel plads; en, der er væk, er der ikke længere at animere.
 *
 * 3. `prefers-reduced-motion` slås op i JavaScript. Den globale CSS-regel
 *    slukker `animation` og `transition` — men dette er Web Animations API,
 *    og det rammer den ikke. Uden dette tjek ville netop den bruger, der
 *    har bedt om ro, få den eneste animation i appen, der flytter noget
 *    hen over skærmen.
 */

/** Så hurtigt, at det er en bevægelse og ikke en rejse. */
const VARIGHED_MS = 320;

/** Samme kurve som `--kurve` i index.css: hurtigt ud, blødt ind. */
const KURVE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Under dette flytter vi ikke noget.
 *
 * En ombytning af to naboer flytter en række dens egen højde. Et hop på
 * få pixels er derimod en liste, der har ændret højde af en anden grund —
 * en linje, der ombrydes, en bjælke, der kom til — og at animere DET ser
 * ud som en fejl frem for som en overhaling.
 */
const MINDSTE_FLYTNING_PX = 4;

export function useFlip(noegler: readonly string[]) {
  const beholder = useRef<HTMLDivElement>(null);
  const forrige = useRef<Map<string, number> | undefined>(undefined);

  useLayoutEffect(() => {
    const rod = beholder.current;
    if (rod === null) return;

    const boern = [...rod.children] as HTMLElement[];

    /** Hvor står hver række NU. Kun toppen: listen er lodret. */
    const nu = new Map<string, number>();
    boern.forEach((barn, nummer) => {
      const noegle = noegler[nummer];
      if (noegle !== undefined) nu.set(noegle, barn.getBoundingClientRect().top);
    });

    const foer = forrige.current;
    forrige.current = nu;

    // Spærre 1: første tegning.
    if (foer === undefined) return;

    // Spærre 3: brugeren har bedt om ro.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    boern.forEach((barn, nummer) => {
      const noegle = noegler[nummer];
      if (noegle === undefined) return;

      const gammelTop = foer.get(noegle);
      const nyTop = nu.get(noegle);

      // Spærre 2: rækken fandtes ikke før.
      if (gammelTop === undefined || nyTop === undefined) return;

      const flytning = gammelTop - nyTop;
      if (Math.abs(flytning) < MINDSTE_FLYTNING_PX) return;

      barn.animate(
        [{ transform: `translateY(${flytning}px)` }, { transform: "translateY(0)" }],
        { duration: VARIGHED_MS, easing: KURVE },
      );
    });
  }, [noegler]);

  return beholder;
}
