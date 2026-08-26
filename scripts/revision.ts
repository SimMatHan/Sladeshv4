/**
 * Statisk revision af designsystemet.
 *
 * Kører uden deployment, uden netværk og uden browser. Den findes, fordi de
 * fejl, den leder efter, ALLE er sluppet igennem `tsc`, `oxlint` og
 * logiktestene mindst én gang:
 *
 *   - en 15px skriftstørrelse i en fil, hvor der kun må være fem trin
 *   - `--tekst-svag` på en flade, hvor den lander på 4,29:1
 *   - `.kanalknap` og `.pil`, som blev forældreløse, da titlen holdt op med
 *     at være en knap
 *
 * Ingen af dem er syntaksfejl. Alle tre kræver, at nogen tæller efter — og
 * det er præcis dét, mennesker holder op med at gøre.
 *
 * Køres med `npm run revision`. Se .claude/agents/tester.md.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CSS_STI = "src/index.css";

/**
 * KOMMENTARER BLANKES, før der læses noget som helst.
 *
 * index.css er tung med forklaringer, og de forklaringer citerer den kode,
 * de handler om. Første udgave af denne fil greppede den rå tekst og
 * ramte derfor:
 *
 *   - `:root[data-tema="…"]` i en kommentar linje 273 — et falsk tema
 *   - en kommentar linje 3363, hvis match løb hen over HELE Copenhell-
 *     blokken og slugte den, så temaet aldrig blev målt
 *
 * Det sidste er det farlige: revisionen sagde grønt, fordi den ikke kunne
 * se det, den skulle måle. Et værktøj, der overser i stilhed, er værre end
 * intet værktøj.
 *
 * Erstatningen bevarer linjeskift og længde, så linjenumre og positioner
 * er præcis de samme som i filen på disken.
 */
const raaCss = readFileSync(CSS_STI, "utf8");
const css = raaCss.replace(/\/\*[\s\S]*?\*\//g, (blok) =>
  blok.replace(/[^\n]/g, " "),
);

let fejl = 0;
let advarsler = 0;

function overskrift(tekst: string): void {
  console.log(`\n[Revision] ${tekst}`);
}

function ok(tekst: string): void {
  console.log(`  ✓ ${tekst}`);
}

function daarligt(tekst: string): void {
  console.log(`  ✗ ${tekst}`);
  fejl++;
}

function advarsel(tekst: string): void {
  console.log(`  ! ${tekst}`);
  advarsler++;
}

// ---------------------------------------------------------------------------
// 1. Skalaerne
// ---------------------------------------------------------------------------

/**
 * Regel 2 og 3 i toppen af index.css: fem skriftstørrelser, seks afstande.
 * "Bruger du 15px ét sted, er systemet brudt."
 *
 * Kanter og radier er UNDTAGET. En 1px streg er ikke en afstand, og en
 * søjles hjørne er geometri — begge dele står forklaret i filen.
 */
overskrift("skalaerne");
{
  const linjer = css.split("\n");

  const raaSkrift = linjer
    .map((linje, nr) => ({ linje, nr: nr + 1 }))
    .filter(({ linje }) => /font-size:\s*[0-9]/.test(linje));

  if (raaSkrift.length === 0) {
    ok("ingen rå skriftstørrelser");
  } else {
    for (const { linje, nr } of raaSkrift) {
      daarligt(`${CSS_STI}:${nr} rå skriftstørrelse — ${linje.trim()}`);
    }
  }

  const raaAfstand = linjer
    .map((linje, nr) => ({ linje, nr: nr + 1 }))
    .filter(
      ({ linje }) =>
        /(margin|padding|gap)[a-z-]*:\s*[^;]*[0-9]+px/.test(linje) &&
        !linje.includes("var(--luft") &&
        !/\b1px\b/.test(linje) &&
        !linje.includes("border"),
    );

  if (raaAfstand.length === 0) {
    ok("ingen rå afstande");
  } else {
    for (const { linje, nr } of raaAfstand) {
      daarligt(`${CSS_STI}:${nr} rå afstand — ${linje.trim()}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Kontrast
// ---------------------------------------------------------------------------

/**
 * Finder slutningen på blokken, der åbner ved `{` på position `start`.
 *
 * Nødvendigt, fordi temaerne er indlejrede: det lyse tema er et `:root`
 * inde i en `@media`, og festivaltemaerne står i toppen af filen ved siden
 * af. Skærer man bare fra en markør og til filens ende — som første udgave
 * af denne fil gjorde — læser man det lyse temas `--tekst-svag` som
 * Copenhells, fordi den står længere nede og overskriver.
 *
 * Den fejl meldte ni falske kontrastfejl på tal, jeg selv havde målt i
 * hånden og set passere. Den slags er værre end ingen revision: et værktøj,
 * der råber forkert, bliver slukket.
 */
function blokSlut(kilde: string, start: number): number {
  let dybde = 0;
  for (let i = start; i < kilde.length; i++) {
    if (kilde[i] === "{") dybde++;
    else if (kilde[i] === "}") {
      dybde--;
      if (dybde === 0) return i;
    }
  }
  return kilde.length;
}

/**
 * Kun rene hex-værdier. `color-mix()` kan ikke regnes uden en browser, og
 * en halvgennemsigtig hvid har ingen fast værdi at måle.
 */
function laesTokens(kilde: string): Map<string, string> {
  const kort = new Map<string, string>();
  for (const [, navn, vaerdi] of kilde.matchAll(
    /(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g,
  )) {
    kort.set(navn, vaerdi.toLowerCase());
  }
  return kort;
}

/**
 * Alle temaer i filen, hvert med sine egne tokens.
 *
 * Festivaltemaerne tages MED. De er rigtige temaer, appen sender, de har
 * deres egne `--tekst-svag` og `--accent`, og ingen har nogensinde målt
 * dem — de blev overtaget som hex-værdier fra det gamle repo.
 */
function temablokke(kilde: string): Array<{ navn: string; tokens: Map<string, string> }> {
  const lysStart = kilde.indexOf("@media (prefers-color-scheme: light)");
  const lysSlut =
    lysStart === -1 ? -1 : blokSlut(kilde, kilde.indexOf("{", lysStart));

  const fundne: Array<{ navn: string; tokens: Map<string, string> }> = [];

  for (const traef of kilde.matchAll(/:root(\[data-tema="([a-z0-9-]+)"\])?[^{;]*\{/g)) {
    const start = traef.index;
    const tema = traef[2];
    const slut = blokSlut(kilde, kilde.indexOf("{", start));
    const tokens = laesTokens(kilde.slice(start, slut));
    if (tokens.size === 0) continue;

    const navn =
      tema !== undefined
        ? tema
        : lysStart !== -1 && start > lysStart && start < lysSlut
          ? "lys"
          : "mørk";

    // Samme tema kan have flere `:root`-blokke. Den første med tokens er
    // paletten; senere er lokale overstyringer og skal ikke tælle med.
    if (!fundne.some((b) => b.navn === navn)) fundne.push({ navn, tokens });
  }

  return fundne;
}

function relativLuminans(hex: string): number {
  const kanaler = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = kanaler.map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontrast(a: string, b: string): number {
  const x = relativLuminans(a);
  const y = relativLuminans(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Parrene der SKAL holde.
 *
 * Kravet er 4,5:1, fordi appens mindste tekst — `--tekst-svag` på 11px
 * versaler — er almindelig tekst efter WCAG. Der er ingen store-tekst-
 * undtagelse at læne sig op ad her.
 */
const PAR: Array<[string, string]> = [
  ["--tekst", "--bund"],
  ["--tekst", "--flade"],
  ["--tekst-daempet", "--bund"],
  ["--tekst-daempet", "--flade"],
  ["--tekst-daempet", "--flade-saenket"],
  ["--tekst-daempet", "--flade-brik"],
  ["--tekst-svag", "--bund"],
  ["--tekst-svag", "--flade"],
  ["--tekst-svag", "--flade-brik"],
  ["--accent-tekst", "--accent"],
  ["--fare", "--flade"],
  ["--medgang", "--flade"],
  ["--guld", "--flade"],
  ["--soelv", "--flade"],
  ["--bronze", "--flade"],
];

const GRAENSE = 4.5;

overskrift("kontrast");
{
  const temaer = temablokke(css);
  const moerk = temaer.find((t) => t.navn === "mørk")?.tokens ?? new Map();

  for (const { navn, tokens } of temaer) {
    let faldt = 0;

    for (const [forgrund, baggrund] of PAR) {
      // Et tema overskriver kun DET, det ændrer; resten arves fra `:root`,
      // altså fra det mørke. Slås en manglende værdi ikke op dér, måler man
      // på et hul.
      const f = tokens.get(forgrund) ?? moerk.get(forgrund);
      const b = tokens.get(baggrund) ?? moerk.get(baggrund);

      if (f === undefined || b === undefined) {
        advarsel(`${navn}: kunne ikke slå ${forgrund} på ${baggrund} op`);
        continue;
      }

      const maalt = kontrast(f, b);
      if (maalt >= GRAENSE) continue;

      daarligt(
        `${navn}: ${forgrund} på ${baggrund} — ${maalt.toFixed(2)}:1 (under ${GRAENSE})`,
      );
      faldt++;
    }

    if (faldt === 0) ok(`${navn}: alle ${PAR.length} par over ${GRAENSE}:1`);
  }
}

// ---------------------------------------------------------------------------
// 3. Forældreløse klasser
// ---------------------------------------------------------------------------

/**
 * Klasser defineret i CSS, som ingen komponent nævner.
 *
 * Kun DEN retning. Den modsatte — en klasse brugt i JSX uden en regel —
 * ville kræve at vide, hvilke strenge der er klassenavne, og et gæt på dét
 * larmer mere, end det gavner. Denne retning er til gengæld præcis den, der
 * bider: en klasse bliver liggende, når markup'en, der brugte den, laves om.
 *
 * Sammenligningen sker mod ALLE strenglitteraler i `src/**`, ikke kun mod
 * `className`. Det er groft med vilje: en klasse, der optræder i en
 * skabelonstreng eller sættes sammen af dele, må ikke meldes som ubrugt.
 */
overskrift("forældreløse klasser");
{
  const filer: string[] = [];
  const gaa = (mappe: string): void => {
    for (const navn of readdirSync(mappe)) {
      const sti = join(mappe, navn);
      if (statSync(sti).isDirectory()) gaa(sti);
      else if (/\.(tsx|ts)$/.test(sti)) filer.push(sti);
    }
  };
  gaa("src");

  const kilde = filer.map((sti) => readFileSync(sti, "utf8")).join("\n");

  // Alt der ligner et ord i en streng. Bevidst bredt.
  const nævnt = new Set<string>();
  for (const [, indhold] of kilde.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
    for (const ord of indhold.split(/[\s.]+/)) {
      if (ord.length > 0) nævnt.add(ord);
    }
  }

  /**
   * Klasser der er defineret for at blive brugt af LEAFLET eller af
   * browseren selv — ikke af vores egen JSX. De ville altid stå som
   * forældreløse.
   */
  const UNDTAGET = [/^leaflet/, /^kortnaal$/];

  const definerede = new Set<string>();
  // Kun selektorlinjer, altså dem der ender på `{` eller `,`.
  for (const linje of css.split("\n")) {
    if (!/[{,]\s*$/.test(linje)) continue;
    for (const [, klasse] of linje.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) {
      definerede.add(klasse);
    }
  }

  const ubrugte = [...definerede]
    .filter(
      (klasse) => !nævnt.has(klasse) && !UNDTAGET.some((m) => m.test(klasse)),
    )
    .sort();

  if (ubrugte.length === 0) {
    ok(`${definerede.size} klasser, ingen forældreløse`);
  } else {
    for (const klasse of ubrugte) {
      advarsel(`.${klasse} er defineret, men nævnes ingen steder i src/`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Kontraktens grænser
// ---------------------------------------------------------------------------

/**
 * Filer på forbudslisten i docs/redesign-kontrakt.md må kun være ændret,
 * hvis der står en undtagelse i kontrakten. Revisionen kan ikke afgøre, om
 * en ændring er dækket — den kan MINDE om at slå efter.
 */
overskrift("kontraktens grænser");
{
  const kontrakt = readFileSync("docs/redesign-kontrakt.md", "utf8");
  const undtagelser = (kontrakt.match(/\*\*Bevidst undtagelse/g) ?? []).length;
  ok(`${undtagelser} dokumenterede undtagelser i kontrakten`);
  console.log(
    "    Rører din ændring convex/**, src/lib/**, src/main.tsx, scripts/**\n" +
      "    eller package.json, skal den svare til en af dem — ellers skal der\n" +
      "    skrives en ny, før den merges.",
  );
}

// ---------------------------------------------------------------------------

console.log(
  `\n[Revision] ${fejl} fejl, ${advarsler} advarsler\n`,
);

// Advarsler vælter ikke kørslen. En forældreløs klasse kan være en klasse,
// der venter på markup, og et kontrastpar kan mangle, fordi et token er
// omdøbt — begge dele skal ses på, ingen af dem skal stoppe en commit.
if (fejl > 0) process.exit(1);
