import { useEffect, type ReactNode } from "react";

/**
 * Bundark — appens ene måde at vise noget "oven på" det, man er i gang med.
 *
 * Log, kanalvælger og personkort bruger alle det samme ark. Det er med vilje:
 * ét mønster, man lærer én gang. Man lukker det ved at trykke ved siden af,
 * trykke på krydset, eller trykke Escape.
 *
 * Baggrunden låses, mens arket er åbent. Uden det scroller siden bagved, når
 * man ruller i arket, og det føles som om appen mister grebet.
 */
export function Ark({
  titel,
  onLuk,
  children,
}: {
  titel: string;
  onLuk: () => void;
  children: ReactNode;
}) {
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

  return (
    <>
      {/* Dugen er selv lukkeknappen. `aria-label` gør den forståelig for en
          skærmlæser, som ellers bare ville se en tom knap på hele skærmen. */}
      <button className="dug" aria-label="Luk" onClick={onLuk} />
      <div className="ark" role="dialog" aria-modal="true" aria-label={titel}>
        <div className="greb" />
        <h2>{titel}</h2>
        <div className="arkindhold">{children}</div>
      </div>
    </>
  );
}
