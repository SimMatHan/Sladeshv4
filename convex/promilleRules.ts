import { isDrinkCategory } from "./constants";

/**
 * Promille efter Widmark.
 *
 * Overtaget fra det gamle repos src/services/promilleService.ts, som allerede
 * regnede rigtigt — det var kun SCOREBOARDET der brugte en pladsholder
 * (`genstande × 0,18`, fra useLeaderboard.ts). Denne fase kobler den rigtige
 * beregning på begge steder.
 *
 *   promille (‰) = alkoholgram / (vægt_kg × r) − (β × timer siden første genstand)
 *
 *   r = Widmark-faktor (0,68 for mænd, 0,55 for kvinder)
 *   β = forbrændingshastighed, 0,15 ‰ i timen
 *
 * Ingen import fra `_generated`, så beregningen kan afprøves af
 * scripts/logic-test.ts uden et deployment.
 *
 * NB: dette er et ESTIMAT til underholdning. Widmark tager ikke højde for
 * mavesæk, optagelsestid eller individuel forbrænding, og resultatet må ikke
 * bruges til at afgøre om nogen kan køre bil.
 */

/** Widmark-fordelingsfaktorer. */
export const WIDMARK_MAND = 0.68;
export const WIDMARK_KVINDE = 0.55;

/** Forbrænding i ‰ per time. */
export const FORBRAENDING_PER_TIME = 0.15;

/**
 * Gram ren alkohol i én "lille" (1×) enhed af hver kategori.
 *
 * Et shot er langt stærkere end en øl, så ét fladt tal for alting rammer helt
 * ved siden af. Tallene er danske standardserveringer, uændrede fra det gamle
 * repo:
 *
 *   Øl:       33cl × 4,6 % → 33 × 0,046 × 0,789 ≈ 12,0 g
 *   Cider:    33cl × 4,5 % → ≈ 11,7 g            → 12 g
 *   Vin:      12cl × 12 %  → 12 × 0,12 × 0,789 ≈ 11,4 g → 12 g (ét glas)
 *   Cocktail: ~6cl spiritus × 37,5 % → ≈ 17,8 g  → 16 g
 *   Shot:     4cl × 38 %   → 4 × 0,38 × 0,789  ≈ 12,0 g → 12 g
 *
 * `sizeMultiplier` (1,0 lille / 1,5 mellem / 2,0 stor) skalerer derefter, så
 * en 50cl øl tæller som 1,5 enheder.
 */
export const GRAM_PER_KATEGORI: Record<string, number> = {
  beer: 12,
  cider: 12,
  wine: 12,
  cocktail: 16,
  shot: 12,
};

/** Fallback for en kategori vi ikke kender gramtallet for. */
export const GRAM_STANDARD = 12;

export type Koen = "male" | "female";

/** Den delmængde af en drinkLogs-række beregningen har brug for. */
export type PromilleLog = {
  categoryId: string;
  sizeMultiplier?: number;
  timestamp: number;
};

/**
 * Samlet antal gram ren alkohol.
 *
 * Kun rigtige drikkevarer tæller — cigaretter og andet ikke-drikkeligt
 * springes over. Fortrydelser bærer en NEGATIV `sizeMultiplier` og trækker
 * derfor sig selv fra, uden at der skal gøres noget særligt.
 */
export function alkoholGram(logs: readonly PromilleLog[]): number {
  let total = 0;

  for (const log of logs) {
    if (!isDrinkCategory(log.categoryId)) continue;
    const gram = GRAM_PER_KATEGORI[log.categoryId] ?? GRAM_STANDARD;
    total += gram * (log.sizeMultiplier ?? 1);
  }

  // En række fortrydelser kan i teorien give et negativt tal. Nul er gulvet.
  return Math.max(0, total);
}

/**
 * Tidspunktet for den første rigtige genstand.
 *
 * Fortrydelser (negativ multiplier) springes over: de er ikke en genstand og
 * må ikke kunne flytte starttidspunktet — og dermed forbrændingen — bagud.
 */
export function foersteGenstandTid(
  logs: readonly PromilleLog[],
): number | undefined {
  let tidligst: number | undefined;

  for (const log of logs) {
    if (!isDrinkCategory(log.categoryId)) continue;
    if ((log.sizeMultiplier ?? 1) < 0) continue;
    if (tidligst === undefined || log.timestamp < tidligst) {
      tidligst = log.timestamp;
    }
  }

  return tidligst;
}

/**
 * Promille i ‰. Aldrig under 0.
 *
 * `logs` skal være det aktuelle runs logninger — se `beregnRunStart` i
 * convex/drinkRules.ts. Er vægten ukendt eller nul, kan der ikke regnes, og
 * svaret er 0.
 */
export function beregnPromille(
  logs: readonly PromilleLog[],
  vaegt: number,
  koen: Koen,
  now: number,
): number {
  if (!Number.isFinite(vaegt) || vaegt <= 0) return 0;

  const gram = alkoholGram(logs);
  if (gram <= 0) return 0;

  const faktor = koen === "male" ? WIDMARK_MAND : WIDMARK_KVINDE;

  // Topværdien, før noget er forbrændt.
  const top = gram / (vaegt * faktor);

  const foerste = foersteGenstandTid(logs);
  const timer =
    foerste === undefined ? 0 : Math.max(0, (now - foerste) / (60 * 60 * 1000));

  const promille = top - FORBRAENDING_PER_TIME * timer;

  return Math.max(0, Math.round(promille * 1000) / 1000);
}

export type Beruselsesniveau = {
  label: string;
  status: "online" | "warning" | "danger";
};

/** Menneskelig etiket. Teksterne er ordret fra det gamle repo. */
export function beruselsesniveau(promille: number): Beruselsesniveau {
  if (promille < 0.3) return { label: "Ædru", status: "online" };
  if (promille < 0.8) return { label: "Let påvirket", status: "warning" };
  if (promille < 1.5) return { label: "Beruset", status: "warning" };
  return { label: "Meget beruset", status: "danger" };
}

/** Timer til promillen rammer 0, rundet op. */
export function timerTilAedru(promille: number): number {
  if (promille <= 0) return 0;
  return Math.ceil(promille / FORBRAENDING_PER_TIME);
}

/**
 * Kan der overhovedet regnes promille for denne bruger?
 *
 * Kræver at brugeren selv har slået det til OG har udfyldt vægt og køn.
 * Uden begge dele viser vi ingenting frem for et gættet tal — se
 * convex/scoreboard.ts.
 */
export function kanBeregnePromille(indstilling: {
  enabled: boolean;
  gender?: string;
  weight?: number;
} | undefined): indstilling is { enabled: true; gender: Koen; weight: number } {
  if (indstilling === undefined) return false;
  if (!indstilling.enabled) return false;
  if (indstilling.gender !== "male" && indstilling.gender !== "female") return false;
  return typeof indstilling.weight === "number" && indstilling.weight > 0;
}
