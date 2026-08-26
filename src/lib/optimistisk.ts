import { isDrinkCategory } from "../../convex/constants";
import type { ScoreboardRow } from "../../convex/scoreboard";

/**
 * Rene regler for, hvad skærmen skal vise, FØR serveren har svaret.
 *
 * Uden det her venter hvert tryk på turen frem og tilbage. På to bjælker
 * betyder det, at man trykker ( + ) → Øl → og så sker der ingenting i to
 * sekunder. Regel 1 i docs/brugerrejser.md siger, at appens hyppigste handling
 * skal koste mindst; at stirre på en knap, der ikke reagerer, er den dyreste
 * form for ingenting.
 *
 * Convex ruller selv tilbage: gætter vi forkert, eller afviser serveren
 * mutationen, træder det rigtige svar i stedet, så snart det lander. Derfor må
 * gættet gerne være groft — det skal bare være groft på den rigtige måde.
 *
 * Funktionerne her er RENE, så de kan afprøves af `npm run test:logic`.
 * Koblingen til Convex' localStore ligger i src/lib/optimistiskeKald.ts.
 */

/**
 * Hvor meget en genstand tæller i stillingen: én, eller nul.
 *
 * Hed `vaegtForStoerrelse` og slog en multiplikator op på størrelsen. Der
 * er ikke længere en størrelse at slå op — se kommentaren, hvor
 * `DRINK_SIZES` stod, i convex/constants.ts — så det eneste spørgsmål
 * tilbage er, om det overhovedet er en drikkevare. En cigaret flytter
 * ikke stillingen.
 */
export function vaegtForGenstand(categoryId: string): number {
  return isDrinkCategory(categoryId) ? 1 : 0;
}

/**
 * Lægger en genstand til stillingen.
 *
 * Er man ikke på listen i forvejen, kommer man på: første genstand på en aften
 * checker én ind (se convex/drinkLogs.ts), og så skal man dukke op med det
 * samme frem for at blinke ind et sekund senere.
 */
export function medGenstand(
  raekker: readonly ScoreboardRow[],
  mig: Pick<ScoreboardRow, "userId" | "name" | "avatar" | "color"> &
    Pick<Partial<ScoreboardRow>, "profileEmoji" | "profileGradient">,
  vaegt: number,
  nu: number,
): ScoreboardRow[] {
  const findes = raekker.some((raekke) => raekke.userId === mig.userId);

  const opdateret = raekker.map((raekke) =>
    raekke.userId === mig.userId
      ? {
          ...raekke,
          drinksToday: rund(raekke.drinksToday + vaegt),
          // Tie-breakeren skal med, ellers kan man springe forbi nogen, der
          // nåede samme antal før én selv.
          lastDrinkAt: vaegt > 0 ? nu : raekke.lastDrinkAt,
        }
      : raekke,
  );

  if (!findes) {
    opdateret.push({
      ...mig,
      drinksToday: rund(vaegt),
      streak: 0,
      lastDrinkAt: vaegt > 0 ? nu : undefined,
      isOnline: true,
    });
  }

  return sorter(opdateret);
}

/**
 * Trækker en genstand fra igen.
 *
 * `lastDrinkAt` røres ikke: vi ved ikke, hvornår den næstsidste genstand blev
 * logget, og at gætte på den ville kunne bytte om på to personer i stillingen.
 * Serverens svar retter det inden for et øjeblik.
 */
export function udenGenstand(
  raekker: readonly ScoreboardRow[],
  userId: ScoreboardRow["userId"],
  vaegt: number,
): ScoreboardRow[] {
  return sorter(
    raekker.map((raekke) =>
      raekke.userId === userId
        ? { ...raekke, drinksToday: rund(Math.max(0, raekke.drinksToday - vaegt)) }
        : raekke,
    ),
  );
}

/** Samme rækkefølge som convex/scoreboard.ts. De to MÅ ikke skride fra hinanden. */
function sorter(raekker: ScoreboardRow[]): ScoreboardRow[] {
  return [...raekker].sort((a, b) => {
    if (b.drinksToday !== a.drinksToday) return b.drinksToday - a.drinksToday;
    if (a.lastDrinkAt === undefined) return 1;
    if (b.lastDrinkAt === undefined) return -1;
    return a.lastDrinkAt - b.lastDrinkAt;
  });
}

/** Undgår flydende-komma-støj som 3.0000000000000004 — som på serveren. */
function rund(vaerdi: number): number {
  return Number(vaerdi.toFixed(2));
}
