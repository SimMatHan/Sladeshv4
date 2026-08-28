import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { genstande } from "../lib/visning";

/**
 * Linjen under Kanalens navn i toppen.
 *
 * ## Hvorfor den ikke er ÉN linje
 *
 * Hver skærm har sin egen: stillingen ved, hvor mange der er ude, kortet ved,
 * hvor mange der deler position, chatten ved, hvor mange der er i Kanalen.
 * Det er fire forskellige tal fra fire forskellige steder.
 *
 * Fristelsen er at lade skallen hente dem alle og vælge imellem dem. Så ville
 * den fælles ramme abonnere på fire skærmes data for at tegne én linje — også
 * de tre, ingen kigger på.
 *
 * I stedet er der én lille komponent per skærm, der hver henter sit eget.
 * Samme mønster som `KanalNavn` i App.tsx: "egen komponent, så kun den henter
 * opslaget". Skallen vælger kun HVILKEN der monteres.
 *
 * ## Det koster ingen ekstra hentning
 *
 * Hver undertekst kalder den query, skærmen under den allerede kalder — med
 * de samme argumenter. Convex deler ét abonnement mellem identiske kald, så
 * `getScoreboard` hentes én gang, uanset at både stillingen og dens
 * undertekst spørger.
 *
 * ## Vis intet, du ikke ved — men behold pladsen
 *
 * `useQuery` giver `undefined`, mens den henter. Så vises INGEN tekst — ikke
 * et gæt og ikke et nul. Se docs/redesign-kontrakt.md afsnit 7.
 *
 * LINJEN er der til gengæld altid. Før returnerede de fire undertekster
 * `null`, mens de hentede, og så fandtes elementet slet ikke: headeren var
 * lav i et øjeblik og voksede så med linjens højde PLUS `.sidetitel`s gap —
 * og hele skærmen under den hoppede nedad, hver gang man skiftede fane.
 *
 * Nu rendres `<Linje>` altid, tom eller ej, og `.undertekst` har en
 * `min-height` på én linje. Pladsen er reserveret fra første tegning, og
 * teksten lander i den frem for at skubbe noget.
 *
 * Det gælder også de tomme TILSTANDE — nul ude, ingen på kortet. De havde
 * samme problem: linjen forsvandt, når det sidste menneske checkede ud.
 */

/*
 * Ingen "mig" her længere. Mig-fanen viser ikke skallens header — den har
 * sin egen profilrække med kanalnavn og ugedag, se `Profilundertekst` i
 * Mig.tsx. Denne fil dækker nu kun de fire segmenter inde i Kanal-fanen.
 */
export type Undertekstskaerm = "stilling" | "chat" | "kort" | "historik";

export function Sideundertekst({
  skaerm,
  channelId,
}: {
  skaerm: Undertekstskaerm;
  channelId: Id<"kanaler">;
}) {
  switch (skaerm) {
    case "stilling":
      return <StillingUndertekst channelId={channelId} />;
    case "chat":
      return <ChatUndertekst channelId={channelId} />;
    case "kort":
      return <KortUndertekst channelId={channelId} />;
    case "historik":
      return <HistorikUndertekst channelId={channelId} />;
  }
}

/**
 * Underteksten. Uden `children` er den en TOM linje, der holder sin plads —
 * se `.undertekst` i index.css. Kald den frem for at returnere `null`.
 */
function Linje({ children }: { children?: React.ReactNode }) {
  return <span className="hjaelp undertekst">{children}</span>;
}

function StillingUndertekst({ channelId }: { channelId: Id<"kanaler"> }) {
  const stilling = useQuery(api.scoreboard.getScoreboard, { channelId });
  if (stilling === undefined) return <Linje />;

  // Stillingen indeholder KUN dem, der er ude i dag — se linjen
  // `if (!checketIndIDag && !harLoggetIDag) continue;` i convex/scoreboard.ts.
  // Antallet er derfor listens længde, ikke et filter oveni.
  const ude = stilling.length;
  const total = stilling.reduce((sum, r) => sum + r.drinksToday, 0);

  // Ingen er ude endnu: den tomme tilstand under siger allerede hvorfor, og
  // "0 ude · 0 genstande" ville bare gentage det med tal.
  if (ude === 0) return <Linje />;

  return (
    <Linje>
      {ude} ude i aften · {genstande(total)} genstande
    </Linje>
  );
}

function ChatUndertekst({ channelId }: { channelId: Id<"kanaler"> }) {
  const kanal = useQuery(api.kanaler.getKanal, { channelId });
  if (kanal === undefined) return <Linje />;

  const antal = kanal.members.length;
  return (
    <Linje>
      {antal} {antal === 1 ? "medlem" : "medlemmer"}
    </Linje>
  );
}

function KortUndertekst({ channelId }: { channelId: Id<"kanaler"> }) {
  const svar = useQuery(api.kort.getKanalPositioner, { channelId });
  if (svar === undefined) return <Linje />;

  const antal = svar.personer.length;
  // Ingen på kortet: skærmen forklarer det selv, og en nul-linje ville stå
  // som en fejl frem for en forklaring.
  if (antal === 0) return <Linje />;

  return <Linje>{antal} deler position</Linje>;
}

function HistorikUndertekst({ channelId }: { channelId: Id<"kanaler"> }) {
  const historik = useQuery(api.historik.getKanalHistorik, { channelId });
  if (historik === undefined) return <Linje />;

  // Kun dage, hvor der SKETE noget. Aksen indeholder også tomme dage, og
  // "Seneste 7 drikkedage" ville være misvisende, hvis de fem var tomme.
  const dage = historik.filter((dag) => dag.genstande > 0).length;
  if (dage === 0) return <Linje />;

  return (
    <Linje>
      Seneste {dage} {dage === 1 ? "drikkedag" : "drikkedage"}
    </Linje>
  );
}

