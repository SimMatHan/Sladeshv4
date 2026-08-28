import type { Aggregat } from "./drinkRules";
import { variantNoegle } from "./drinkRules";

/**
 * Achievements: definitioner og oplåsningslogik.
 *
 * Definitionerne er statiske i kode — som i det gamle repo — mens brugerens
 * oplåsninger ligger i tabellen `achievements`, én række per (bruger,
 * achievement). Tekster, billeder og emojis er ordret fra
 * src/lib/achievements.ts.
 *
 * Ingen import fra `_generated`, så motoren kan afprøves af
 * scripts/logic-test.ts uden et deployment.
 *
 * ## Hvorfor logikken er skrevet om
 *
 * Den gamle motor lå i AchievementContext.tsx og læste de denormaliserede
 * tællere på brugerdokumentet (`currentRunDrinkCount`, `drinkVariations`,
 * `allTimeDrinkVariations`, `drinkTypes`). Netop dem udelod vi bevidst i fase
 * 1, fordi de kunne komme ud af trit med logrækkerne. Alt måles derfor nu
 * direkte på `drinkLogs`.
 *
 * Der lå desuden en anden, ufuldstændig kopi i
 * functions/src/utils/achievements.ts (en Cloud Function-hjælper fuld af
 * "let's assume"-kommentarer, som var uenig med klienten om flere regler).
 * Hvor de to var uenige, følger vi KLIENTEN — den var den der faktisk kørte.
 * Uenighederne er noteret ved hver enkelt regel.
 */

export type AchievementType =
  | "total_resets"
  | "run_drinks"
  | "total_drinks"
  | "category_diversity"
  | "run_specific_variation"
  | "specific_drink_count"
  /**
   * De fire nedenfor måler IKKE på `drinkLogs`.
   *
   * De tre første læser tællere, der står på brugerdokumentet og
   * vedligeholdes af den kode, der ejer dem — Sladesh-livscyklussen,
   * check ind og stimeberegningen. Motoren regner dem ikke ud igen; den
   * spørger. Det er en bevidst forskel fra alt det øvrige, hvor det netop
   * ER en pointe, at tallene udledes af logrækkerne (se afsnittet om det
   * gamle repos denormaliserede tællere ovenfor): disse tre har ingen
   * logrækker at udlede sig af.
   */
  | "sladesh_fejlet"
  | "check_ins"
  | "streak"
  /** Klokkeslæt frem for mængde. Måles på runnets logninger. */
  | "time_specific"
  | "manual";

/**
 * Vinduet for "Sidste mand ud": fra og med kl. 04, til men ikke med kl. 06.
 *
 * Ét vindue for hele samlingen, ikke et per definition. Der er én
 * `time_specific`-achievement, og et felt på `Achievement`, som kun én post
 * udfylder, er en generalisering, der endnu ikke har fortjent sig selv.
 * Kommer der en til med et andet vindue, flytter tallene ind i definitionen.
 *
 * Timerne er LOKALE (Europe/Copenhagen) og læses med `localWallClock`, som
 * også drikkedagens grænse bruger. Convex kører i UTC, så det er ikke til at
 * springe over — se tidszone-afsnittet i convex/constants.ts.
 */
export const NATTETIMER = { fra: 4, til: 6 } as const;

export type Achievement = {
  id: string;
  type: AchievementType;
  title: string;
  description: string;
  howToGet: string;
  image: string;
  emoji?: string;
  threshold?: number;
  /**
   * Kategori-id, fx `beer`.
   *
   * Hed `variationType` i det gamle repo, hvilket var misvisende: den holdt
   * en KATEGORI, ikke et variantnavn. Klienten troede på navnet og ledte med
   * `variationName.includes("wine")` blandt variantnavnene — og fandt derfor
   * aldrig noget, fordi danske vin-varianter hedder "Rødvin" og "Hvidvin".
   * Cloud Function-kopien slog rigtigt op i kategorien. Navnet er rettet, så
   * fejlen ikke kan opstå igen.
   */
  categoryId?: string;
  /** Variantnavn, fx "Cigaret". Bruges sammen med `categoryId`. */
  variation?: string;
  requiredCategories?: readonly string[];
  repeatable?: boolean;
};

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: "reset_confirmed",
    type: "total_resets",
    threshold: 3,
    title: "Are you sure about that?",
    description:
      "Full run resets. Double-check before you smash that button next time.",
    howToGet: "Nulstil dit run 3 gange i alt.",
    image: "/assets/achievements/areyousureaboutthat.gif",
    emoji: "🔄",
    repeatable: true,
  },
  {
    id: "obeerma",
    type: "run_drinks",
    categoryId: "beer",
    threshold: 10,
    title: "Obeerma",
    description: "Beers down the hatch. Change is brewing.",
    howToGet: "Drik 10 øl i ét run.",
    image: "/assets/achievements/obeerma.png",
    emoji: "🍺",
    repeatable: true,
  },
  {
    id: "full_bender",
    type: "run_drinks",
    threshold: 20,
    title: "Full Bender",
    description: "Twenty drinks. Maybe switch to water for one round?",
    howToGet: "Registrer 20 genstandstal i ét run.",
    image: "/assets/achievements/fullbender.gif",
    emoji: "🥴",
    repeatable: true,
  },
  {
    id: "like_fine_wine",
    type: "total_drinks",
    categoryId: "wine",
    threshold: 5,
    title: "Like Fine Wine",
    description: "Five wines deep and still aging gracefully.",
    howToGet: "Registrer 5 vine i alt på tværs af alle runs.",
    image: "/assets/achievements/likefinewine.png",
    emoji: "🍷",
    repeatable: true,
  },
  {
    id: "top_donor",
    type: "manual",
    title: "Top Donor",
    description: "Du har doneret til Sladesh App, mange tak for dit bidrag",
    howToGet: "Donér til Sladesh App.",
    image: "/assets/achievements/topdonor.jpeg",
    emoji: "💎",
  },
  {
    id: "mr_worldwide",
    type: "category_diversity",
    requiredCategories: ["beer", "cider", "wine", "cocktail", "shot"],
    title: "Mr. Worldwide",
    description:
      "Du har smagt på det hele! En genstand registreret i hver kategori: Øl, Cider, Vin, Cocktails og Shots.",
    howToGet:
      "Registrer mindst én genstand i hver kategori: Øl, Cider, Vin, Cocktails og Shots.",
    image: "/assets/achievements/mrworldwide.jpg",
    emoji: "🌍",
    repeatable: true,
  },
  {
    id: "puff_minister",
    type: "run_specific_variation",
    categoryId: "other",
    variation: "Cigaret",
    threshold: 5,
    title: "Puffminister",
    description:
      "Du har haft ekstra travlt med piberiet i dag! Mere end 5 pufs registreret på én dag.",
    howToGet: "Registrer 5 cigaretter på én dag.",
    image: "/assets/achievements/puffpuffpassaway.jpg",
    emoji: "🚬",
    repeatable: true,
  },
  {
    id: "feinschmecker",
    type: "specific_drink_count",
    categoryId: "cocktail",
    variation: "Vermouth Tonic",
    threshold: 1,
    title: "Feinschmecker",
    description: "En sand kender! Du har nydt en klassisk Vermouth og Tonic.",
    howToGet: "Bestil en Vermouth Tonic.",
    image: "/assets/achievements/feinschmecker.png",
    emoji: "🍸",
    repeatable: true,
  },

  // ---------------------------------------------------------------------
  // De fire nye. Alle måler på noget, der ikke er "hvor meget har du
  // drukket" — Full Bender på 20 genstande er toppen af den skala, og en
  // ny oven på den bliver en opfordring frem for en spøg.
  //
  // BILLEDERNE MANGLER. Stierne peger på filer, der endnu ikke findes i
  // public/assets/achievements/, og `<img>` viser et brudt ikon, indtil de
  // lægges ind. Navnene er valgt, så de kan lægges ind uden at røre koden.
  // ---------------------------------------------------------------------

  {
    id: "tog_den_aldrig",
    type: "sladesh_fejlet",
    threshold: 1,
    title: "Han tog den aldrig",
    description:
      "En Sladesh løb ud, mens du kiggede den anden vej. Det tæller også.",
    howToGet: "Lad en Sladesh, du har modtaget, løbe ud uden at gennemføre den.",
    image: "/assets/achievements/togdenaldrig.png",
    emoji: "🐔",
    // IKKE gentagelig. Den kunne teknisk set tælle, hvor mange gange man har
    // kylret ud — men et mærke, der står "×12", er en statistik, ikke en
    // spøg, og appen har lige haft en omgang med tællere, der løb løbsk.
  },
  {
    id: "sidste_mand_ud",
    type: "time_specific",
    threshold: 1,
    title: "Sidste mand ud",
    description: "Klokken var fire. Du var der stadig.",
    howToGet: "Log en genstand mellem kl. 04 og kl. 06.",
    image: "/assets/achievements/sidstemandud.png",
    emoji: "🌅",
    // Run-baseret, så en ny aften er en ny chance. Man kan ikke planlægge
    // sig til den; man ender bare der.
    repeatable: true,
  },
  {
    id: "stamgaest",
    type: "check_ins",
    threshold: 25,
    title: "Stamgæst",
    description: "Femogtyve aftener. Personalet kender din bestilling.",
    howToGet: "Vær ude 25 aftener i alt.",
    image: "/assets/achievements/stamgaest.png",
    emoji: "🍻",
    // Den lange, rolige. Belønner at møde op, ikke at drikke meget — og den
    // er det eneste sted, `checkInCount` på Mig-fanen får en betydning.
  },
  {
    id: "ingen_hviledag",
    type: "streak",
    threshold: 7,
    title: "Ingen hviledag",
    description: "Syv drikkedage i træk. Selv søndag.",
    howToGet: "Hav en stime på syv drikkedage i træk.",
    image: "/assets/achievements/ingenhviledag.png",
    emoji: "🔥",
    // Den sværeste af de fire, og den eneste ingen får ved et tilfælde.
    // Stimen står allerede på Mig-fanen som ugestribe, så fremdriften er
    // synlig hele vejen.
  },
] as const;

/**
 * `total_all_drinks` er den sidste type fra det gamle repo, der ikke er
 * porteret. Den stod i type-unionen og havde sin egen gren i klienten, men
 * INGEN definition brugte den — grenen kunne altså aldrig køre, og den er
 * udeladt frem for at stå her som utestet kode.
 *
 * `time_specific` og `streak` stod på samme liste og er nu bygget, fordi
 * "Sidste mand ud" og "Ingen hviledag" fik brug for dem. Det er den
 * rækkefølge, det skal ske i: en gren kommer til, når en definition
 * bruger den, ikke før.
 */

/** Slår en definition op. */
export function findAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Alt hvad motoren skal måle på. */
export type Maalinger = {
  /** Antal gange brugeren har nulstillet sit run — livstid. */
  totalRunResets: number;
  /** Starten på det aktuelle run. Se `beregnRunStart` i drinkRules.ts. */
  runStart: number;
  /** Logninger i det aktuelle run. */
  run: Aggregat;
  /** Alle brugerens logninger, nogensinde. */
  livstid: Aggregat;

  /**
   * Tællere fra brugerdokumentet — livstid.
   *
   * `totalRunResets` ovenfor er af samme slags og har været der hele tiden;
   * de tre her følger bare efter. De ejes af hver sin del af appen
   * (`sladesh.ts`, `checkIns.ts`/`drinkLogs.ts`, `streaks.ts`), og motoren
   * læser dem frem for at regne dem ud igen.
   */
  sladeshFejlet: number;
  /**
   * Check ins SIDEN nulpunktet, ikke i alt. Se `achievementNulpunkt` i
   * schema.ts: tælleren havde talt op i årevis, før "Stamgæst" fandtes.
   */
  checkIns: number;
  /**
   * Den AKTUELLE stime, ikke den længste.
   *
   * `longestStreak` er et maksimum og kan ikke bære et nulpunkt: en bruger
   * med syv i bagagen ville stå på nul for evigt, uanset hvor mange gange de
   * siden lavede syv dage i træk. Den aktuelle nulstiller sig selv, og det
   * er præcis den egenskab, "start forfra" har brug for.
   *
   * At mærket BLIVER STÅENDE, når den ottende dag udebliver, klares af
   * rækken i `achievements`: den er ikke gentagelig, så `beregnOplaasninger`
   * springer den over, så snart den findes én gang.
   */
  aktuelStime: number;

  /**
   * Logninger i det aktuelle run, der faldt inden for `NATTETIMER`.
   *
   * Et TAL og ikke et boolean: `maalFor` skal returnere noget, der kan
   * sammenlignes med en tærskel, og et tal kan en fremtidig "tre genstande
   * mellem fire og seks" bruge uden at ændre noget her.
   */
  natteLogninger: number;
};

/** Den tilstand der allerede står i `achievements`-tabellen. */
export type EksisterendeRaekke = {
  count: number;
  /** Runnet der udløste den seneste oplåsning. Kun for run-baserede. */
  lastRunStart?: number;
};

/**
 * Achievements der hører til ÉT run, og som derfor kan opnås igen i det
 * næste. Resten er kumulative over hele livstiden.
 */
export function erRunbaseret(def: Achievement): boolean {
  return (
    def.type === "run_drinks" ||
    def.type === "run_specific_variation" ||
    def.type === "category_diversity" ||
    // Nattetimerne måles på runnet og nulstilles altså af sig selv. En ny
    // aften er en ny chance — præcis som Obeerma.
    def.type === "time_specific"
  );
}

/** Den værdi der måles mod tærsklen. */
export function maalFor(def: Achievement, maal: Maalinger): number {
  switch (def.type) {
    case "total_resets":
      return maal.totalRunResets;

    case "run_drinks":
      // Uden kategori tælles alle genstande i runnet under ét.
      return def.categoryId === undefined
        ? maal.run.genstande
        : (maal.run.perKategori[def.categoryId] ?? 0);

    case "total_drinks":
      return def.categoryId === undefined
        ? maal.livstid.genstande
        : (maal.livstid.perKategori[def.categoryId] ?? 0);

    case "run_specific_variation":
      return hentVariant(maal.run, def);

    case "specific_drink_count":
      return hentVariant(maal.livstid, def);

    case "category_diversity":
      // Hvor mange af de krævede kategorier har mindst én genstand i runnet?
      //
      // Klienten målte på det aktuelle RUN, Cloud Function-kopien på
      // livstiden. Vi følger klienten: den kørte, og dens
      // gentagelsesregel ("kan opnås igen efter en nulstilling") giver kun
      // mening for noget run-baseret.
      return (def.requiredCategories ?? []).filter(
        (kategori) => (maal.run.perKategori[kategori] ?? 0) > 0,
      ).length;

    case "sladesh_fejlet":
      return maal.sladeshFejlet;

    case "check_ins":
      return maal.checkIns;

    // Den AKTUELLE stime, ikke den længste. Se `aktuelStime` i `Maalinger`
    // for hvorfor — kort: den længste er et maksimum og kan ikke startes
    // forfra, og mærkets varighed sikres af rækken, ikke af tallet.
    case "streak":
      return maal.aktuelStime;

    case "time_specific":
      return maal.natteLogninger;

    case "manual":
      return 0;
  }
}

/** Tærsklen der skal nås. */
export function taerskelFor(def: Achievement): number {
  // `|| 1` frem for `?? 1`: en tom liste eller en tærskel på 0 ville give
  // division med nul i fremdriften.
  if (def.type === "category_diversity") {
    return def.requiredCategories?.length || 1;
  }
  return def.threshold || 1;
}

/** Er tærsklen nået lige nu? */
export function erOpnaaet(def: Achievement, vaerdi: number): boolean {
  if (def.type === "manual") return false;
  return vaerdi >= taerskelFor(def);
}

export type Oplaasning = {
  achievementId: string;
  /** Den nye værdi for `count` på rækken. */
  nyCount: number;
  /** Sættes kun for run-baserede achievements. */
  lastRunStart?: number;
};

/**
 * Hvilke achievements skal låses op lige nu?
 *
 * To veje ind:
 *
 * 1. **Første gang.** Ingen række endnu, og tærsklen er nået.
 * 2. **Igen.** Kun for `repeatable`, og kun ved en NY milepæl. Uden den
 *    spærre ville enhver opdatering låse op igen, så længe tærsklen blev ved
 *    med at være opfyldt — det var netop den løkke `hasReachedNewMilestone`
 *    fandtes for at bryde i det gamle repo.
 *
 * Hvad "en ny milepæl" er, afhænger af typen:
 *
 * - **Kumulative** (nulstillinger, livstidstal): hver gang tærsklen er
 *   passeret én gang mere. 15 nulstillinger med tærskel 3 giver 5.
 * - **Run-baserede**: når man er i et NYT run. Det gamle repo sammenlignede
 *   antallet af nulstillinger, hvilket betød at man kun kunne få fx Obeerma
 *   igen ved at trykke nulstil — drak man 10 øl i går og 10 i dag uden at
 *   nulstille, kom den ikke igen, selvom det var to forskellige runs. Her
 *   sammenlignes runnets STARTTIDSPUNKT, som flytter sig både ved en
 *   nulstilling og ved drikkedagens skift kl. 10:00.
 */
export function beregnOplaasninger(
  maal: Maalinger,
  eksisterende: Readonly<Record<string, EksisterendeRaekke>>,
): Oplaasning[] {
  const oplaasninger: Oplaasning[] = [];

  for (const def of ACHIEVEMENTS) {
    if (def.type === "manual") continue;

    const vaerdi = maalFor(def, maal);
    if (!erOpnaaet(def, vaerdi)) continue;

    const runbaseret = erRunbaseret(def);
    const raekke = eksisterende[def.id];

    if (raekke === undefined) {
      // FØRSTE gang. For en kumulativ gælder samme regnestykke som ved en
      // gentagelse: hvor mange hele tærskler er der plads til? Stod der
      // altid 1 her, ville en bruger med 32 vine og en tærskel på 5 få
      // Like Fine Wine med tallet 1 — og næste gang de loggede HVAD SOM
      // HELST, ville milepælsregningen nedenfor opdage de manglende fem og
      // låse op igen. Det var netop det, der skete efter migreringen: den
      // gamle app talte aldrig vin rigtigt (se `categoryId` ovenfor), så
      // alle havde en pukkel, der udløste sig selv på den næste øl.
      //
      // Et run tæller altid som ÉN oplåsning, uanset hvor langt over
      // tærsklen man kom — og en ikke-gentagelig kan pr. definition kun
      // stå på 1.
      const kumulativ = !runbaseret && def.repeatable === true;
      oplaasninger.push({
        achievementId: def.id,
        nyCount: kumulativ ? Math.floor(vaerdi / taerskelFor(def)) : 1,
        ...(runbaseret ? { lastRunStart: maal.runStart } : {}),
      });
      continue;
    }

    if (def.repeatable !== true) continue;

    if (runbaseret) {
      // Et nyt run — altså et der starter senere end det der sidst udløste
      // oplåsningen. `undefined` betyder en række fra før denne fase (eller
      // fra migreringen), og så tæller det som nyt.
      if ((raekke.lastRunStart ?? -1) >= maal.runStart) continue;
      oplaasninger.push({
        achievementId: def.id,
        nyCount: raekke.count + 1,
        lastRunStart: maal.runStart,
      });
      continue;
    }

    // Kumulativ: hvor mange hele tærskler er der plads til?
    const milepaele = Math.floor(vaerdi / taerskelFor(def));
    if (milepaele <= raekke.count) continue;

    // Sættes til antallet af milepæle frem for count + 1, så en enkelt stor
    // logning der springer to milepæle over ikke efterlader en oplåsning i
    // kø til næste gang brugeren rører noget.
    oplaasninger.push({ achievementId: def.id, nyCount: milepaele });
  }

  return oplaasninger;
}

export type Fremdrift = {
  achievementId: string;
  current: number;
  threshold: number;
  /** 0–100, afkortet ved 100. */
  percentage: number;
  /** Antal gange brugeren har låst den op. */
  count: number;
  unlocked: boolean;
};

/**
 * Hvor langt er brugeren mod den NÆSTE oplåsning?
 *
 * Den rå måling duer ikke som fremdrift for en kumulativ, gentagelig
 * achievement. Med 32 vine og en tærskel på 5 stod der "32 af 5" på skærmen
 * over en bjælke, der havde været fyldt siden den femte vin. Tallet var
 * sandt og sagde ingenting: det, man vil vide, er hvor tæt man er på den
 * SJETTE.
 *
 * Derfor trækkes de milepæle fra, der allerede er låst op — `count` er
 * netop antallet af dem. 32 vine med seks oplåsninger bag sig giver 2 af 5.
 *
 * Kun for de kumulative. En run-baseret måler på et run, der starter forfra
 * af sig selv, og dens `count` er antallet af runs gennem tiden — trak man
 * den fra, ville Obeerma stå på 0 af 10 efter tre øl i aften.
 *
 * Loftet gælder begge slags: er der en pukkel til gode — flere hele tærskler
 * end oplåsninger, som efter migreringen — vises "5 af 5" frem for "27 af 5".
 * Bjælken er fyldt, og det er den også: oplåsningen ligger og venter på den
 * næste logning.
 */
function fremdriftMod(
  def: Achievement,
  raa: number,
  threshold: number,
  count: number,
): number {
  const kumulativ = !erRunbaseret(def) && def.repeatable === true;
  const rest = kumulativ ? raa - count * threshold : raa;
  return Math.min(Math.max(rest, 0), threshold);
}

/** Fremdrift for alle automatiske achievements. Manuelle udelades. */
export function beregnFremdrift(
  maal: Maalinger,
  eksisterende: Readonly<Record<string, EksisterendeRaekke>>,
): Fremdrift[] {
  const ud: Fremdrift[] = [];

  for (const def of ACHIEVEMENTS) {
    if (def.type === "manual") continue;

    const threshold = taerskelFor(def);
    const count = eksisterende[def.id]?.count ?? 0;
    const current = fremdriftMod(def, maalFor(def, maal), threshold, count);

    ud.push({
      achievementId: def.id,
      current,
      threshold,
      percentage: Math.min(Math.round((current / threshold) * 100), 100),
      count,
      unlocked: count > 0,
    });
  }

  return ud;
}

/**
 * Den achievement brugeren er tættest på.
 *
 * Allerede opnåede springes over, medmindre de kan gentages. Er ingen inden
 * for rækkevidde — alt er enten opnået eller uopnåeligt — er svaret
 * `undefined`.
 */
export function naesteMilepael(
  maal: Maalinger,
  eksisterende: Readonly<Record<string, EksisterendeRaekke>>,
): Fremdrift | undefined {
  let bedst: Fremdrift | undefined;
  let mindsteAfstand = Infinity;

  for (const fremdrift of beregnFremdrift(maal, eksisterende)) {
    const def = findAchievement(fremdrift.achievementId);
    if (def === undefined) continue;
    if (fremdrift.unlocked && def.repeatable !== true) continue;

    const afstand = fremdrift.threshold - fremdrift.current;
    if (afstand <= 0) continue;
    if (afstand >= mindsteAfstand) continue;

    mindsteAfstand = afstand;
    bedst = fremdrift;
  }

  return bedst;
}

function hentVariant(aggregat: Aggregat, def: Achievement): number {
  if (def.categoryId === undefined || def.variation === undefined) return 0;
  return aggregat.perVariant[variantNoegle(def.categoryId, def.variation)] ?? 0;
}
