/**
 * Navigationens ikoner.
 *
 * Streg-SVG frem for emoji, og kun HER. Emoji tegnes af styresystemet og
 * ser derfor forskellig ud på hver telefon; i navigationen, hvor de to
 * ikoner står side om side hele aftenen, var det det eneste sted i appen,
 * hvor forskellen var til at få øje på. En SVG arver desuden `currentColor`,
 * så den aktive fane kan skifte farve — det kan en emoji ikke.
 *
 * Emoji bliver, hvor de bærer BETYDNING og ikke bare form: drikkekategorier
 * (🍺 er Øl), avatarer, badges. Se docs/redesign-kontrakt.md afsnit 2 — ingen
 * ikonpakke, kun emoji eller inline SVG.
 *
 * Alle tre er tegnet på et 24-grid med samme stregtykkelse, så de vejer ens
 * ved siden af hinanden.
 */

const streg = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Kanal-fanen: et hus, altså "her er vi samlet". */
export function KanalIkon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...streg}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/** Mig-fanen: en person. */
export function MigIkon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...streg}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

/**
 * ( + ) — tykkere streg end de to andre, fordi den sidder på en fyldt
 * flade og skal bære lige så meget som dem på afstand.
 */
export function PlusIkon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
