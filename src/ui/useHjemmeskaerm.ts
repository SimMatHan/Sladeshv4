import { useEffect, useState } from "react";
import {
  bestemPlatform,
  boerOpfordre,
  type Hjemmeskaermplatform,
} from "./hjemmeskaermregler";

/**
 * "Læg mig på hjemmeskærmen" — browserdelen.
 *
 * Beslutningen om HVORNÅR ligger i hjemmeskaermregler.ts, som er ren og
 * testet. Her ligger kun det, der kræver en browser: er vi installeret,
 * hvilken slags enhed står vi på, hvor mange gange er appen åbnet, og —
 * på Android — findes der en rigtig installationsprompt at kalde.
 *
 * ## Hvorfor der ikke findes et "har de bookmarket"-svar
 *
 * Det gør der ikke. Ingen browser udleverer "denne person har appen på
 * hjemmeskærmen". Det eneste, der kan aflæses, er, om DENNE fane kører
 * installeret lige nu — `display-mode: standalone`, eller Safaris ældre
 * `navigator.standalone`. Det er nok til formålet: kører vi installeret,
 * skal der ikke opfordres, og kører vi ikke, må der gerne.
 *
 * Det betyder også, at nogen kan have appen på hjemmeskærmen OG åbne et
 * link i Safari og få opfordringen dér. Det er prisen, og den er lille —
 * krydset husker svaret bagefter.
 */

/** Koerer vi lige nu fra hjemmeskaermen? */
function erInstalleret(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safaris egen, aeldre variant. Kun den findes paa iOS.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/*
 * ── Aabningstaelleren ────────────────────────────────────────────────
 *
 * Taelles ÉN GANG per indlaesning af modulet, ikke per montering af
 * komponenten. To komponenter, der begge spurgte hooket, ville ellers
 * taelle to aabninger for én — og saa ville opfordringen komme allerede
 * foerste gang, praecis det den er bygget for at undgaa.
 */
const AABNINGSNOEGLE = "hjemmeskaermAabninger";
const LUKKENOEGLE = "hjemmeskaermLukket";

const aabninger = taelOp();

function taelOp(): number {
  if (typeof window === "undefined") return 0;
  try {
    const foer = Number(localStorage.getItem(AABNINGSNOEGLE) ?? "0");
    const nu = Number.isFinite(foer) && foer > 0 ? foer + 1 : 1;
    localStorage.setItem(AABNINGSNOEGLE, String(nu));
    return nu;
  } catch {
    /*
     * Privat vindue eller lagring slaaet fra. Saa kan vi ikke vide, om de
     * har vaeret her foer — og vi svarer 0, saa opfordringen holder sig
     * vaek. Et privat vindue er i forvejen det sted, hvor "laeg mig paa
     * hjemmeskaermen" giver mindst mening.
     */
    return 0;
  }
}

function erLukket(): boolean {
  try {
    return localStorage.getItem(LUKKENOEGLE) === "1";
  } catch {
    return false;
  }
}

function gemLukket(): void {
  try {
    localStorage.setItem(LUKKENOEGLE, "1");
  } catch {
    // Ingen lagring. Opfordringen kommer igen ved genindlaesning.
  }
}

/*
 * ── Chromes egen installationsprompt ─────────────────────────────────
 *
 * `beforeinstallprompt` fyrer TIDLIGT — som regel foer React overhovedet
 * er monteret — og den kommer kun én gang. Fangede vi den foerst inde i
 * en `useEffect`, ville den for laengst vaere kastet vaek, og Android
 * ville ende med den samme menuvejledning som alle andre.
 *
 * Derfor gribes den ved modulindlaesning og gemmes. Abonnenterne findes,
 * fordi haendelsen kan komme baade foer og efter, at hooket er monteret.
 *
 * iOS har den ikke. Det er ikke en fejl — Safari tilbyder ingen prompt,
 * og derfor er vejledningen den eneste vej dér.
 */
type Installationshaendelse = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let gemtPrompt: Installationshaendelse | undefined;
const abonnenter = new Set<() => void>();

function sigTil(): void {
  for (const lyt of abonnenter) lyt();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (haendelse) => {
    // Uden det her viser Chrome sin egen bjaelke oven i vores. Én
    // opfordring ad gangen — og vores kan forklare hvorfor.
    haendelse.preventDefault();
    gemtPrompt = haendelse as Installationshaendelse;
    sigTil();
  });

  window.addEventListener("appinstalled", () => {
    gemtPrompt = undefined;
    gemLukket();
    sigTil();
  });
}

export function useHjemmeskaerm(): {
  /** Skal bjaelken staa? */
  vis: boolean;
  platform: Hjemmeskaermplatform;
  /**
   * Chromes rigtige installationsknap, hvis browseren tilbyder den.
   * `undefined` betyder "vis vejledningen i stedet".
   */
  installer: (() => void) | undefined;
  luk: () => void;
} {
  const [lukket, setLukket] = useState(erLukket);

  // Én taeller, der bare skal aendre sig, naar `gemtPrompt` goer. Selve
  // vaerdien er ligegyldig; den findes for at faa React til at tegne igen.
  const [, gentegn] = useState(0);

  useEffect(() => {
    const lyt = () => gentegn((n) => n + 1);
    abonnenter.add(lyt);
    return () => {
      abonnenter.delete(lyt);
    };
  }, []);

  const platform =
    typeof navigator === "undefined"
      ? "anden"
      : bestemPlatform({
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints,
        });

  const vis = boerOpfordre({
    installeret: erInstalleret(),
    platform,
    lukket,
    aabninger,
  });

  const prompt = gemtPrompt;

  return {
    vis,
    platform,
    installer:
      prompt === undefined
        ? undefined
        : () => {
            // Prompten kan kun bruges én gang. Efter den er kaldt, er
            // haendelsen brugt op, uanset hvad personen svarede.
            gemtPrompt = undefined;
            void prompt.prompt().then(() => {
              sigTil();
            });
          },
    luk: () => {
      setLukket(true);
      gemLukket();
    },
  };
}
