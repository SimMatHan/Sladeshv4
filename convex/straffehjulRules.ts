/**
 * Straffehjulets regler — uden database.
 *
 * Egen fil, samme grænse som de andre `*Rules.ts`: her røres hverken `ctx`
 * eller tabeller, så `scripts/logic-test.ts` kan importere den. Mutationerne
 * i straffehjul.ts kalder herind og oversætter et afslag til en ConvexError.
 */

/** Længdegrænsen på et felts tekst. En straf skal kunne læses på hjulet. */
export const FELT_TEKST_MAX = 80;

/**
 * Højst så mange tegn i emojien.
 *
 * Tegn og ikke "én emoji": et flag (🇩🇰) er fire UTF-16-enheder, og en
 * familie-emoji med hudfarver er langt flere. Grænsen er der for at holde
 * tekst ude af emojifeltet, ikke for at tælle grafemer.
 */
export const FELT_EMOJI_MAX = 16;

/**
 * Højst så mange AKTIVE felter på hjulet.
 *
 * Over det bliver hvert stykke for smalt til, at man kan se, hvor viseren
 * peger. Inaktive felter tæller ikke — de er ikke på hjulet.
 */
export const MAX_AKTIVE_FELTER = 24;

/** Færre end to, og der er intet at dreje imellem. */
export const MIN_AKTIVE_FELTER = 2;

/**
 * Pladsholderne — det, et tomt hjul drejer på, og det en admin kan fylde
 * hjulet med i ét tryk.
 *
 * Eksempler, ikke en facitliste. De er skrevet til at blive rettet, slettet
 * og slået fra under Admin → Hjul, og så skal de ligge som rækker i
 * databasen.
 *
 * Indtil da drejer et HELT tomt hjul på dem direkte herfra — se
 * `getFelter` i straffehjul.ts — så hjulet virker fra første deploy.
 */
export const STANDARDFELTER: readonly { tekst: string; emoji: string }[] = [
  { emoji: "🍺", tekst: "Bund din drink" },
  { emoji: "🥃", tekst: "Tag et shot" },
  { emoji: "🫵", tekst: "Giv en tår til en, du vælger" },
  { emoji: "🤝", tekst: "Skål med en fremmed" },
  { emoji: "🎤", tekst: "Syng omkvædet af en sang, Kanalen vælger" },
  { emoji: "✋", tekst: "Drik med venstre hånd resten af aftenen" },
  { emoji: "🙊", tekst: "Ingen bandeord i 15 minutter" },
  { emoji: "🔁", tekst: "Drej igen" },
  { emoji: "😇", tekst: "Fri! Du slap denne gang" },
  { emoji: "💸", tekst: "Køb en omgang til bordet" },
];

export type Afslag = { code: string; message: string };

/** Teksten renset, eller hvorfor den ikke kan bruges. */
export function rensTekst(raa: string): { tekst: string } | { afslag: Afslag } {
  const tekst = raa.trim();
  if (tekst.length === 0) {
    return { afslag: { code: "EMPTY_TEXT", message: "Feltet skal have en tekst." } };
  }
  if (tekst.length > FELT_TEKST_MAX) {
    return {
      afslag: {
        code: "TEXT_TOO_LONG",
        message: `Teksten må højst fylde ${FELT_TEKST_MAX} tegn.`,
      },
    };
  }
  return { tekst };
}

/**
 * Emojien renset. Tom betyder "ingen" og gemmes som fravær, ikke som en
 * tom streng — så visningen kun har ét tilfælde at tjekke for.
 */
export function rensEmoji(
  raa: string | undefined,
): { emoji: string | undefined } | { afslag: Afslag } {
  if (raa === undefined) return { emoji: undefined };
  const emoji = raa.trim();
  if (emoji.length === 0) return { emoji: undefined };
  if (emoji.length > FELT_EMOJI_MAX) {
    return {
      afslag: {
        code: "EMOJI_TOO_LONG",
        message: "Emojien er for lang — skriv teksten i tekstfeltet.",
      },
    };
  }
  return { emoji };
}

/** Er der plads til ét aktivt felt mere? */
export function harPladsTilAktivt(antalAktive: number): boolean {
  return antalAktive < MAX_AKTIVE_FELTER;
}
