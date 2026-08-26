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

/** Indstillinger, i profiltoppen på Mig. */
export function TandhjulIkon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...streg}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * Skift Kanal — dobbeltvinklen op og ned.
 *
 * IKKE en ▾. En enkelt pil nedad betyder "her folder noget sig ud" og er
 * det, en overskrift får, når den også er en knap; det var præcis dét, der
 * ikke var tydeligt nok. To vinkler, der peger fra hinanden, er
 * styresystemernes egen figur for "vælg mellem flere" — den samme, en
 * `<select>` og en iOS-picker bruger — og den siger, at der er noget at
 * skifte MELLEM, ikke bare noget at folde ud.
 *
 * Se design/Stilling.dc.html, knappen i højre side af toppen.
 */
export function SkiftIkon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...streg}>
      <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
    </svg>
  );
}

/**
 * Send — pil op, i chattens runde knap.
 *
 * Var glyffen ↑ sat som tekst. En pil er et TEGN i en skrifttype, og
 * systemskrifterne tegner den forskelligt: på nogle telefoner er den tynd
 * og høj, på andre kort og fed, og den sidder sjældent optisk midt i en
 * cirkel. Samme grund som navigationens ikoner, se toppen af filen.
 *
 * Tykkere streg end de andre, fordi den sidder på en fyldt flade.
 */
export function SendIkon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
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
