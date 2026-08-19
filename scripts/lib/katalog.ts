/**
 * Standardkataloget over drikkevarianter.
 *
 * Det, ( + )-arket lader dig vælge imellem. Rækkerne herfra lægges ind i
 * tabellen `drinkVariations` af scripts/katalog.ts.
 *
 * HVORFOR EN FIL, OG IKKE BARE DATA I DATABASEN: kataloget kom oprindeligt
 * med fra Firestore ved migreringen, og siden er varianter blevet tilføjet i
 * hånden. Så snart et deployment skal sættes op igen — et nyt dev-deployment,
 * en gendannelse, et andet miljø — er der ikke noget at kopiere fra. Listen
 * her er den skrevne kilde: den kan læses, rettes i en pull request, og køres
 * ind igen uden at nogen skal huske hvad der stod.
 *
 * `categoryId` skal være en af id'erne i DRINK_CATEGORIES (convex/constants.ts):
 * beer, cider, wine, cocktail, shot, other. Serveren afviser resten.
 *
 * Navnet er nøglen sammen med kategorien — to varianter må ikke hedde det
 * samme inden for samme kategori. Beskrivelsen er valgfri; udelad den frem
 * for at skrive en tom streng.
 *
 * Rettes et NAVN her, opfattes den som en ny variant, og den gamle bliver
 * stående (kataloget ryddes aldrig af scriptet — se scripts/katalog.ts).
 * Rettes en BESKRIVELSE, kan ændringen køres ud med `--opdater`.
 *
 * Historikken påvirkes ikke af noget af det: `drinkLogs.variationName` er et
 * snapshot fra logtidspunktet, ikke en reference hertil.
 */

export type Katalogvariant = {
  name: string;
  description?: string;
  categoryId: string;
};

/**
 * Cocktails.
 *
 * De syv første er dem, kataloget kom med fra Firestore; resten er tilføjet
 * i appen siden. Rækkefølgen her betyder intet — arket sorterer selv efter
 * kategori og derefter navn, med dansk sortering.
 */
const COCKTAILS: Katalogvariant[] = [
  { name: "Gin & Tonic", description: "Botanisk gin balanceret med tonic." },
  { name: "Mojito", description: "Rom, mynte og lime over knust is." },
  { name: "Espresso Martini", description: "Espresso rystet med vodka og likør." },
  { name: "Smirnoff Ice", description: "Vodkadrik med citruskick." },
  { name: "Dark 'n Stormy", description: "Mørk rom og ginger beer med bid." },
  { name: "White Russian", description: "Vodka, kaffelikør og fløde." },
  { name: "Vermouth Tonic", description: "Aperitif serveret langt med tonic." },
  { name: "Aperol Spritz", description: "Sommerdrinken" },
  { name: "Champagne", description: "Orale" },
  { name: "Frozen Whote", description: "Kold hvid russer fra Bremen" },
  { name: "Margarita", description: "En rigtig hygge cocktail" },
  { name: "Mimosa", description: "Brunch alkohol, sygt" },
  { name: "Monster mango loco", description: "Fuck that shit" },
  { name: "Negroni", description: "Italiensk sprit" },
  { name: "Old irish coffee", description: "Kaffe drikke m alko" },
  { name: "Whiskey Sour", description: "Det er den med æggehvider" },
].map((variant) => ({ ...variant, categoryId: "cocktail" }));

/** Shots. */
const SHOTS: Katalogvariant[] = [
  { name: "Tequila", description: "Serveres med salt og lime." },
  { name: "Fisk", description: "Nordisk lakridsshot med mentol." },
  { name: "Jägermeister", description: "Urte-likør serveret iskold." },
  { name: "Bailey", description: "Cremet irsk likør i et hurtigt skud." },
  { name: "Snaps", description: "Traditionel akvavit bedst iskold." },
  { name: "Gammel Dansk", description: "Bitter urtelikør fra Danmark." },
  { name: "Fernet", description: "Det italienske pis" },
  { name: "Fireball", description: "Ild i mund, ild i nums" },
  { name: "Flügerl", description: "Kitzlochs bedste" },
  { name: "Jägerbombs" },
  { name: "Minttu", description: "Frisk ånde ja tak" },
  { name: "Sambuca", description: "Eller som andre kalder det, buca" },
  { name: "Underberg", description: "Lille glas, lille pik" },
  { name: "Vodka", description: "Ubeskriveligt dumt shot" },
].map((variant) => ({ ...variant, categoryId: "shot" }));

/**
 * Andet.
 *
 * Kategorien tæller IKKE som genstande (`isDrink: false` i DRINK_CATEGORIES),
 * og den har ingen størrelse. Det er hele pointen med den: en cigaret eller
 * et toiletbesøg kan logges uden at flytte promille, stilling eller stræk.
 */
const ANDET: Katalogvariant[] = [
  {
    name: "Cigaret",
    description: "Hold styr på smøgerne uden at tælle dem som genstande.",
  },
  { name: "Toiletbesøg", description: "Log pauser uden at påvirke promille og stats." },
  { name: "Vand", description: "Husk at drik vand!" },
  { name: "Pufbar", description: "Pppppppfffffff 💨" },
  { name: "Snus" },
  { name: "Sodavand", description: "Lidt lækker læskedrik" },
].map((variant) => ({ ...variant, categoryId: "other" }));

/** Hele kataloget, samlet. */
export const STANDARD_KATALOG: readonly Katalogvariant[] = [
  ...COCKTAILS,
  ...SHOTS,
  ...ANDET,
];

/** Nøglen der afgør om to varianter er den samme. Samme regel som serveren. */
export function katalogNoegle(variant: {
  categoryId: string;
  name: string;
}): string {
  return `${variant.categoryId}::${variant.name}`;
}
