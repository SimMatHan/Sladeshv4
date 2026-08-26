import type { ReactNode } from "react";

/**
 * Fremdriftsringen — et tal med en bue om.
 *
 * Afløser den gamle apps `ProgressRing`, som byggede sin cirkel med
 * Tailwind-klasser og en `conic-gradient`. Her er det ren SVG med to cirkler:
 * sporet og buen. Det er den samme figur, men den kan omtemaes fra
 * variablerne i index.css som resten af appen.
 *
 * `strokeDasharray` sat til hele omkredsen, og `strokeDashoffset` til den del
 * der IKKE er nået endnu — det er den klassiske måde at tegne en delvis bue
 * uden at regne på vinkler.
 */
export function Fremdriftsring({
  andel,
  stoerrelse = 80,
  tykkelse = 6,
  /**
   * Buens farve. Default læser `--ringneutral`, hvis den flade ringen står
   * på har sat den, og falder ellers tilbage på accentfarven — det er dét,
   * Achievements-hylden får. Mig-fanens promillering sender en af de andre
   * ringvariabler ind, fordi dens farve betyder noget: se `farveForNiveau`
   * i Mig.tsx og `beruselsesniveau` i convex/promilleRules.ts.
   */
  farve = "var(--ringneutral, var(--accent))",
  /**
   * Overstyrer skærmlæserens tekst. Default er procenten, som er rigtig for
   * en fremdriftsbue, men forkert for en promillering — der er "2,5 ‰
   * loftet", ikke en andel af noget, brugeren tænker på i procent.
   */
  srLabel,
  children,
}: {
  /** 0–1. Klippes, så et tal uden for intervallet ikke tegner en vrøvlebue. */
  andel: number;
  stoerrelse?: number;
  tykkelse?: number;
  farve?: string;
  srLabel?: string;
  children?: ReactNode;
}) {
  const radius = (stoerrelse - tykkelse) / 2;
  const omkreds = 2 * Math.PI * radius;
  const klippet = Math.min(Math.max(andel, 0), 1);

  return (
    <div
      className="ring"
      style={{ width: stoerrelse, height: stoerrelse }}
      role="img"
      aria-label={srLabel ?? `${Math.round(klippet * 100)} procent`}
    >
      <svg width={stoerrelse} height={stoerrelse} aria-hidden="true">
        <circle
          cx={stoerrelse / 2}
          cy={stoerrelse / 2}
          r={radius}
          fill="none"
          // Sporet følger fladen på samme måde som buen: en kantfarve er
          // rigtig på et almindeligt kort og forkert på et fyldt et.
          stroke="var(--ringspor, var(--kant))"
          strokeWidth={tykkelse}
        />
        <circle
          cx={stoerrelse / 2}
          cy={stoerrelse / 2}
          r={radius}
          fill="none"
          stroke={farve}
          strokeWidth={tykkelse}
          strokeLinecap="round"
          strokeDasharray={omkreds}
          strokeDashoffset={omkreds * (1 - klippet)}
          // Buen starter i toppen frem for til højre, som en urskive.
          transform={`rotate(-90 ${stoerrelse / 2} ${stoerrelse / 2})`}
        />
      </svg>
      <div className="ringindhold">{children}</div>
    </div>
  );
}
