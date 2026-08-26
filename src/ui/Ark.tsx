import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

/**
 * Bundark — appens ene måde at vise noget "oven på" det, man er i gang med.
 *
 * Log, kanalvælger og personkort bruger alle det samme ark. Det er med vilje:
 * ét mønster, man lærer én gang. Man lukker det ved at trykke ved siden af,
 * trykke på krydset, trykke Escape — eller trække det ned.
 *
 * Baggrunden låses, mens arket er åbent. Uden det scroller siden bagved, når
 * man ruller i arket, og det føles som om appen mister grebet.
 */

/**
 * Hvor langt ned arket skal trækkes for at lukke, som andel af sin egen
 * højde. En fjerdedel er langt nok til, at et rystende tommelfingertryk
 * ikke lukker noget, og kort nok til at man ikke skal trække arket helt ud
 * af skærmen for at slippe af med det.
 */
const LUKKEANDEL = 0.25;

/**
 * … eller hurtigt nok. Et hurtigt flick nedad lukker, selv hvis fingeren
 * kun nåede et par centimeter — det er dét, en telefon gør, og uden det
 * føles arket tungt.
 *
 * Pixels per millisekund.
 */
const LUKKEFART = 0.5;

export function Ark({
  titel,
  onLuk,
  children,
}: {
  titel: string;
  onLuk: () => void;
  children: ReactNode;
}) {
  const arket = useRef<HTMLDivElement>(null);

  /**
   * Hvor langt arket er trukket ned lige nu, i pixels. `undefined` = ikke i
   * gang med at trække, og så bestemmer CSS'en formen.
   *
   * Ligger i state og ikke kun i en ref, fordi den skal TEGNES for hver
   * bevægelse. Det er den ene ting i appen, der opdaterer per frame.
   */
  const [trukket, setTrukket] = useState<number | undefined>();
  const traek = useRef<
    { start: number; tid: number; sidst: number; sidstTid: number } | undefined
  >(undefined);

  useEffect(() => {
    const forrige = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const paaTast = (event: KeyboardEvent) => {
      if (event.key === "Escape") onLuk();
    };
    window.addEventListener("keydown", paaTast);

    return () => {
      document.body.style.overflow = forrige;
      window.removeEventListener("keydown", paaTast);
    };
  }, [onLuk]);

  const start = (event: PointerEvent<HTMLDivElement>) => {
    // `setPointerCapture` gør, at vi bliver ved med at få bevægelser, også
    // når fingeren glider uden for grebet. Uden den slipper arket midt i
    // trækket, så snart man rammer ved siden af.
    event.currentTarget.setPointerCapture(event.pointerId);
    const nu = performance.now();
    traek.current = { start: event.clientY, tid: nu, sidst: event.clientY, sidstTid: nu };
    setTrukket(0);
  };

  const flyt = (event: PointerEvent<HTMLDivElement>) => {
    const t = traek.current;
    if (t === undefined) return;

    t.sidst = event.clientY;
    t.sidstTid = performance.now();

    // KUN nedad. Trækker man op, står arket stille — der er ikke mere ark at
    // hente frem, og et ark der løfter sig fra kanten ser i stykker ud.
    setTrukket(Math.max(0, event.clientY - t.start));
  };

  const slip = (event: PointerEvent<HTMLDivElement>) => {
    const t = traek.current;
    traek.current = undefined;
    if (t === undefined) return;

    event.currentTarget.releasePointerCapture(event.pointerId);

    const afstand = Math.max(0, event.clientY - t.start);
    const hoejde = arket.current?.offsetHeight ?? window.innerHeight;

    // Farten måles på det SIDSTE stykke af bevægelsen, ikke på hele trækket.
    // Ellers ville et langsomt træk, der slutter med et flick, blive regnet
    // som langsomt — og et hurtigt træk, man stopper op med, som hurtigt.
    const tid = Math.max(1, t.sidstTid - t.tid);
    const fart = (t.sidst - t.start) / tid;

    if (afstand > hoejde * LUKKEANDEL || fart > LUKKEFART) {
      onLuk();
      return;
    }
    setTrukket(undefined);
  };

  const traekker = trukket !== undefined;

  return (
    <>
      {/* Dugen er selv lukkeknappen. `aria-label` gør den forståelig for en
          skærmlæser, som ellers bare ville se en tom knap på hele skærmen.

          Den lysner, mens arket trækkes ned: uden det ligner et halvt
          nedtrukket ark en fejl frem for en handling, man er midt i. */}
      <button
        className="dug"
        aria-label="Luk"
        onClick={onLuk}
        style={
          traekker
            ? { opacity: Math.max(0, 1 - trukket / 400), transition: "none" }
            : undefined
        }
      />
      <div
        ref={arket}
        className={traekker ? "ark traekkes" : "ark"}
        role="dialog"
        aria-modal="true"
        aria-label={titel}
        style={traekker ? { transform: `translateY(${trukket}px)` } : undefined}
      >
        {/*
          Grebet OG titlen er trækfladen. Grebet alene er 40×4px — for lidt
          til en tommelfinger, og regel 5 gælder også her. Indholdet under
          er med vilje IKKE med: dér ruller man, og et træk, der både kan
          betyde "rul" og "luk", kommer til at betyde det forkerte.

          `touch-action: none` i CSS'en er det, der forhindrer browseren i
          selv at rulle eller trække-for-at-genindlæse midt i bevægelsen.
        */}
        <div
          className="arkgreb"
          onPointerDown={start}
          onPointerMove={flyt}
          onPointerUp={slip}
          onPointerCancel={slip}
        >
          <div className="greb" />
          <h2>{titel}</h2>
        </div>
        <div className="arkindhold">{children}</div>
      </div>
    </>
  );
}
