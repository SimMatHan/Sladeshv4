import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Filer fra public/, som skallen skal have med i cachen.
 *
 * Vite kopierer public/ udenom bundtet, så de dukker ikke op i `generateBundle`
 * og skal nævnes her. Holdes listen ikke ved lige, mangler ikonet, første gang
 * appen åbnes uden dækning — derfor står den lige her ved siden af pluginet
 * og ikke i en fjern konstantfil.
 */
const OFFENTLIGE_FILER = [
  "/manifest.webmanifest",
  "/ikon-192.png",
  "/ikon-512.png",
  "/apple-touch-icon.png",
];

/**
 * Bygger service workeren.
 *
 * Egen ~40 linjers plugin frem for `vite-plugin-pwa`. Det eneste, en
 * genereret service worker skal vide, som vi ikke kan skrive i hånden, er
 * listen over indholdshashede filnavne — og den ligger i `generateBundle`.
 * Resten står i scripts/sw-skabelon.js, hvor den kan læses.
 *
 * Versionen er en hash af selve listen, ikke et tidsstempel: en genbygning
 * med samme resultat giver samme service worker, så brugerne ikke får en
 * "ny version"-besked for ingenting.
 */
function serviceWorker(): Plugin {
  return {
    name: "sladesh-service-worker",
    apply: "build",

    generateBundle(_indstillinger, bundt) {
      const skabelon = readFileSync("scripts/sw-skabelon.js", "utf8");

      const filer = [
        "/index.html",
        ...Object.keys(bundt)
          .filter((navn) => navn !== "index.html")
          .map((navn) => `/${navn}`),
        ...OFFENTLIGE_FILER,
      ].sort();

      const version = createHash("sha256")
        .update(filer.join("\n"))
        .digest("hex")
        .slice(0, 12);

      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        // `replaceAll`, ikke `replace`: skulle en pladsholder komme til at stå
        // to steder i skabelonen, ville kun den første blive udfyldt, og
        // resultatet ville fejle først ude i browseren.
        source: skabelon
          .replaceAll("__PRECACHE__", JSON.stringify(filer, null, 2))
          .replaceAll("__VERSION__", version),
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
});
