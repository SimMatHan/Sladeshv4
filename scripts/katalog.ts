/**
 * Kataloget over drikkevarianter → Convex.
 *
 * Lægger varianterne fra convex/drikkekatalog.ts ind i tabellen
 * `drinkVariations`, så ( + )-arket har noget at vise. Kørslen er idempotent:
 * en variant, der allerede findes i samme kategori, springes over, og
 * scriptet SLETTER aldrig noget — varianter, der kun findes i deploymentet,
 * bliver stående og rapporteres til sidst.
 *
 * Kør — tørkørsel er DEFAULT:
 *
 *   # Admin-konto. `opretVariant` er spærret af requireAdmin, så kontoen skal
 *   # have isAdmin sat i Convex-dashboardet.
 *   export KATALOG_EMAIL=dig@example.dk
 *   export KATALOG_PASSWORD=...
 *
 *   npm run katalog                        # tørkørsel: viser hvad der ville ske
 *   npm run katalog -- --skriv             # opretter de manglende varianter
 *   npm run katalog -- --skriv --opdater   # retter også ændrede beskrivelser
 *
 * Mod produktion sættes CONVEX_URL udtrykkeligt for det ene kald — ellers
 * arves dev-url'en fra .env.local, som `npx convex dev` skriver:
 *
 *   CONVEX_URL=https://<produktion>.convex.cloud npm run katalog -- --skriv
 *
 * Der logges ind via Firebase Auth REST-API'et, som i scripts/smoke-test.ts:
 * det giver det samme ID-token, uden at scriptet skal simulere en browser.
 * Til forskel fra smoke-testen oprettes kontoen ALDRIG — findes den ikke,
 * stopper scriptet. Et katalogscript skal ikke kunne komme til at lave
 * brugere i produktion.
 *
 * PRIVATLIV: outputtet indeholder kun variantnavne og tal — aldrig emails
 * eller andet fra brugerne.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { STANDARD_KATALOG, katalogNoegle } from "../convex/drikkekatalog.ts";
import type { Katalogvariant } from "../convex/drikkekatalog.ts";

const skriv = process.argv.includes("--skriv");
const opdater = process.argv.includes("--opdater");

/** CONVEX_URL vinder over VITE_CONVEX_URL — se kommentaren i scripts/migrer.ts. */
const convexUrl = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
const apiKey = process.env.VITE_FIREBASE_API_KEY;
const email = process.env.KATALOG_EMAIL;
const password = process.env.KATALOG_PASSWORD;

const mangler = Object.entries({
  "CONVEX_URL eller VITE_CONVEX_URL": convexUrl,
  VITE_FIREBASE_API_KEY: apiKey,
  KATALOG_EMAIL: email,
  KATALOG_PASSWORD: password,
})
  .filter(([, vaerdi]) => !vaerdi)
  .map(([navn]) => navn);

if (mangler.length > 0) {
  console.error(
    `[Katalog] mangler: ${mangler.join(", ")}\n` +
      "  Se kommentaren øverst i scripts/katalog.ts.",
  );
  process.exit(1);
}

if (opdater && !skriv) {
  console.error("[Katalog] --opdater kræver --skriv. Afbryder.");
  process.exit(1);
}

/**
 * To rækker med samme (kategori, navn) i filen ville sende den samme variant
 * to gange: den første ville blive oprettet, den anden afvist af serveren
 * midt i kørslen. Bedre at fange det her, hvor intet er skrevet endnu.
 */
const dubletter = findDubletter(STANDARD_KATALOG);
if (dubletter.length > 0) {
  console.error("[Katalog] samme variant står flere gange i filen:");
  for (const noegle of dubletter) console.error(`  ${noegle}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const convex = new ConvexHttpClient(convexUrl!);
  convex.setAuth(await firebaseIdToken());

  console.log(`[Katalog] deployment: ${new URL(convexUrl!).host}`);
  console.log(`[Katalog] tilstand:   ${skriv ? "SKRIVER" : "tørkørsel"}`);

  // --- Sammenlign filen med deploymentet -----------------------------------
  const eksisterende = await convex.query(
    api.drinkVariations.getDrinkVariations,
    {},
  );
  const efterNoegle = new Map(eksisterende.map((v) => [katalogNoegle(v), v]));

  const manglende: Katalogvariant[] = [];
  /** Findes begge steder, men med forskellig beskrivelse. */
  const aendrede: { variant: Katalogvariant; nuvaerende?: string }[] = [];

  for (const variant of STANDARD_KATALOG) {
    const fundet = efterNoegle.get(katalogNoegle(variant));

    if (fundet === undefined) {
      manglende.push(variant);
      continue;
    }

    if (fundet.description !== variant.description) {
      aendrede.push({ variant, nuvaerende: fundet.description });
    }
  }

  /** Står i deploymentet, men ikke i filen. Røres ALDRIG — kun rapporteret. */
  const kunIDeployment = eksisterende.filter(
    (v) =>
      !STANDARD_KATALOG.some((k) => katalogNoegle(k) === katalogNoegle(v)),
  );

  console.log(
    `\n[Katalog] ${STANDARD_KATALOG.length} varianter i filen, ` +
      `${eksisterende.length} i deploymentet`,
  );
  console.log(`  mangler:            ${manglende.length}`);
  console.log(`  ændret beskrivelse: ${aendrede.length}`);
  console.log(`  kun i deploymentet: ${kunIDeployment.length}`);

  if (manglende.length > 0) {
    console.log("\n[Katalog] oprettes:");
    for (const v of manglende) console.log(`  ${v.categoryId}: ${v.name}`);
  }

  if (aendrede.length > 0) {
    console.log(
      `\n[Katalog] beskrivelse ændret${opdater ? "" : " (rettes kun med --opdater)"}:`,
    );
    for (const { variant, nuvaerende } of aendrede) {
      console.log(`  ${variant.categoryId}: ${variant.name}`);
      console.log(`      i deploymentet: ${nuvaerende ?? "(ingen)"}`);
      console.log(`      i filen:        ${variant.description ?? "(ingen)"}`);
    }
  }

  if (kunIDeployment.length > 0) {
    console.log("\n[Katalog] findes kun i deploymentet — røres ikke:");
    for (const v of kunIDeployment) console.log(`  ${v.categoryId}: ${v.name}`);
    console.log(
      "  Skal de blive, hører de hjemme i convex/drikkekatalog.ts. Skal de væk,\n" +
        "  slettes de i hånden — dette script sletter aldrig noget.",
    );
  }

  if (!skriv) {
    console.log("\n[Katalog] tørkørsel — intet skrevet. Kør med --skriv.");
    return;
  }

  // --- Skriv ---------------------------------------------------------------
  let oprettet = 0;
  for (const variant of manglende) {
    await convex.mutation(api.drinkVariations.opretVariant, {
      name: variant.name,
      categoryId: variant.categoryId,
      description: variant.description,
    });
    oprettet++;
  }

  let rettet = 0;
  if (opdater) {
    for (const { variant } of aendrede) {
      const fundet = efterNoegle.get(katalogNoegle(variant))!;
      await convex.mutation(api.drinkVariations.opdaterVariant, {
        variationId: fundet._id,
        // `null` rydder feltet; `undefined` ville betyde "rør det ikke", og
        // så kunne en beskrivelse aldrig fjernes igen ved at slette den i
        // filen.
        description: variant.description ?? null,
      });
      rettet++;
    }
  }

  console.log(`\n[Katalog] oprettet: ${oprettet}, rettet: ${rettet}`);
}

/**
 * ID-token til admin-kontoen.
 *
 * Kontoen SKAL findes i forvejen — modsat smoke-testen oprettes den ikke.
 */
async function firebaseIdToken(): Promise<string> {
  const svar = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  const krop = (await svar.json()) as {
    idToken?: string;
    error?: { message?: string };
  };

  if (!svar.ok || !krop.idToken) {
    throw new Error(
      `login mislykkedes: ${krop.error?.message ?? svar.status}. ` +
        "KATALOG_EMAIL/KATALOG_PASSWORD skal være en eksisterende konto med isAdmin.",
    );
  }

  return krop.idToken;
}

function findDubletter(varianter: readonly Katalogvariant[]): string[] {
  const set = new Set<string>();
  const fundet = new Set<string>();

  for (const variant of varianter) {
    const noegle = katalogNoegle(variant);
    if (set.has(noegle)) fundet.add(noegle);
    else set.add(noegle);
  }

  return [...fundet];
}

main().catch((fejl) => {
  console.error("\n[Katalog] fejlede:", fejl instanceof Error ? fejl.message : fejl);
  process.exit(1);
});
