import { AVATAR_COLORS } from "../../convex/constants";

/**
 * Præsentation: farver, tal og tekst.
 *
 * Alt der handler om, hvordan noget SER ud — ikke hvad det betyder.
 * Forretningsreglerne bor i `convex/`, og de importeres herfra frem for at
 * blive skrevet af, så frontend og backend ikke kan komme til at være uenige
 * om fx hvilke syv avatarfarver der findes.
 */

/**
 * Avatarfarve → CSS-gradient.
 *
 * Den gamle app gemte Tailwind-klasser (`from-orange-400 via-rose-400 …`) i
 * `profileGradient`. Dem bruger vi ikke: de forudsætter Tailwind og binder
 * udtrykket til den gamle apps palet. `avatarColor` er derimod ét af syv
 * navne, og navnet oversættes her.
 */
const GRADIENTER: Record<string, string> = {
  sunset: "linear-gradient(140deg, #fb923c, #fb7185 55%, #ec4899)",
  ocean: "linear-gradient(140deg, #22d3ee, #3b82f6 55%, #4f46e5)",
  aurora: "linear-gradient(140deg, #34d399, #22d3ee 55%, #3b82f6)",
  berry: "linear-gradient(140deg, #c084fc, #ec4899 55%, #f43f5e)",
  gold: "linear-gradient(140deg, #fcd34d, #facc15 55%, #fb923c)",
  mint: "linear-gradient(140deg, #6ee7b7, #2dd4bf 55%, #06b6d4)",
  cosmic: "linear-gradient(140deg, #8b5cf6, #a855f7 55%, #d946ef)",
};

export function gradientFor(farve: string | undefined): string {
  if (farve !== undefined && GRADIENTER[farve] !== undefined) {
    return GRADIENTER[farve];
  }
  return GRADIENTER[AVATAR_COLORS[0].name];
}

/**
 * Genstande med dansk komma, og uden overflødige decimaler.
 *
 * Størrelser gør tallene brudte: en stor øl vejer 2, en mellem 1,5. "3" skal
 * stå som 3, ikke 3,0 — men "4,5" skal have sin halve med.
 */
export function genstande(antal: number): string {
  return antal.toLocaleString("da-DK", { maximumFractionDigits: 1 });
}

/** Promille med to decimaler, som man er vant til at se den. */
export function promille(vaerdi: number): string {
  return `${vaerdi.toLocaleString("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ‰`;
}

/** Klokkeslæt i dansk format. */
export function klokken(tidspunkt: number): string {
  return new Date(tidspunkt).toLocaleTimeString("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Fejl fra Convex, oversat til noget en bruger kan læse.
 *
 * Mutationsfejl kastes som `ConvexError` med `{ code, message }` i `data`.
 * Beskederne er allerede skrevet på dansk til et menneske i hver enkelt
 * funktion, så de kan vises direkte — men formen skal pakkes ud, og alt andet
 * skal have en forståelig reserve i stedet for et stakspor.
 */
export function fejltekst(fejl: unknown): string {
  const data = (fejl as { data?: unknown } | null)?.data;

  if (data !== null && typeof data === "object" && "message" in data) {
    const besked = (data as { message?: unknown }).message;
    if (typeof besked === "string" && besked.length > 0) return besked;
  }

  return "Noget gik galt. Prøv igen.";
}
