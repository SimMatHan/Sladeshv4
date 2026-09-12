import { useState } from "react";
import { Ark } from "./Ark";
import { Faner } from "./Faner";
import { bestemPlatform, hjemmeskaermtrin } from "./hjemmeskaermregler";

/**
 * Hjælp — hvad appen er, og hvad den ved om dig.
 *
 * ## Hvorfor den ligger på Mig
 *
 * Mig er, hvor appen handler om ÉN selv frem for om Kanalen:
 * indstillinger, trofæhylden, admin, log ud. En forklaring af appen og en
 * redegørelse for ens egne data hører til samme sted — se
 * docs/redesign-kontrakt.md afsnit 4.
 *
 * Ikke som et sjette segment i Kanal-fanen. Fem er loftet dér, og en sjette
 * ville tvinge striben til at rulle; det står skrevet i kontrakten med
 * begrundelse.
 *
 * ## To faner, ikke to ark
 *
 * De to ting bliver læst i hver sin situation — "hvordan virker det her" og
 * "hvad gemmer I om mig" — men de er begge to "om appen", og to knapper på
 * Mig til det samme ville fylde uden at forklare noget. Samme
 * `Faner`-komponent som Admin bruger.
 *
 * ## Teksten er skrevet efter KODEN
 *
 * Ikke efter en skabelon. Hver påstand om, hvad der gemmes, hvem der ser
 * det, og hvor længe, kan slås efter i `convex/schema.ts`, `convex/kort.ts`,
 * `convex/messages.ts` og `convex/sladeshRules.ts`. Der hvor appen IKKE gør
 * det, man ville forvente, står det — en privatlivstekst, der lover mere end
 * koden holder, er værre end ingen.
 */

type Side = "sadan" | "data";

export function Hjaelp({ onLuk }: { onLuk: () => void }) {
  const [side, setSide] = useState<Side>("sadan");

  return (
    <Ark titel="Hjælp" onLuk={onLuk}>
      <Faner
        valg={[
          { id: "sadan", etiket: "Sådan virker det" },
          { id: "data", etiket: "Data" },
        ]}
        aktiv={side}
        onVaelg={setSide}
      />

      {side === "sadan" ? <SaadanVirkerDet /> : <DataOgSamtykke />}
    </Ark>
  );
}

function SaadanVirkerDet() {
  return (
    <>
      <div className="arkgruppe">
        <h3>Kort fortalt</h3>
        <p className="hjaelp">
          SladeshApp holder styr på en aften i byen sammen med dem, du er i
          Kanal med. Du logger, hvad du drikker, og alle kan se, hvordan
          aftenen står.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Kanalen</h3>
        <p className="hjaelp">
          En Kanal er din gruppe. Du melder dig ind med en invitationskode, du
          får af en, der allerede er med. Du kan være i flere og skifte mellem
          dem foroven. Alt — stilling, chat, kort — gælder den Kanal, du står
          i.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Log en genstand</h3>
        <p className="hjaelp">
          Den runde <strong>+</strong> forneden. Vælg hvad du har fået, og du
          er på. Dine fire mest brugte står øverst, så det som regel er ét
          tryk.
        </p>
        <p className="hjaelp">
          Én logning er én genstand. Fortryder du, har kvitteringen en
          Fortryd-knap i seks sekunder.
        </p>
        <p className="hjaelp">
          <strong>Tilfældig</strong> i hjørnet lader skæbnen vælge din næste
          genstand — den spørger først, og logger den, når du siger ja.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Stillingen</h3>
        <p className="hjaelp">
          Aftenens rangliste. Du kommer på, så snart du logger din første
          genstand — du behøver ikke checke ind først. Ved lige antal vinder
          den, der drak tidligst.
        </p>
        <p className="hjaelp">
          Døgnet går fra kl. 10 til kl. 10, ikke fra midnat. Klokken tre om
          natten hører stadig til aftenen før.
        </p>
        <p className="hjaelp">
          Tryk på en person for at se, hvad de har drukket, og hvilke mærker
          de har.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Sladesh</h3>
        <p className="hjaelp">
          En udfordring til én bestemt person: drik en genstand nu. Du sender
          den fra personkortet, og modtageren har <strong>ti minutter</strong>.
        </p>
        <p className="hjaelp">
          Modtageren tager to billeder undervejs — den fyldte og den tomme —
          som bevis. Se afsnittet om data for, hvem der kan se dem.
        </p>
        <p className="hjaelp">
          Du kan sende én Sladesh per halve døgn (00–12 og 12–24). Når du har
          brugt din, står det på stillingen.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Kortet</h3>
        <p className="hjaelp">
          Hvor i byen Kanalen er. Din egen position deles kun, mens du er ude
          — og kun med dem, du deler Kanal med.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Historik og mærker</h3>
        <p className="hjaelp">
          Historik viser de seneste drikkedage for hele Kanalen. Mærker er
          achievements, du låser op undervejs — nogle kan tages flere gange.
        </p>
      </div>

      <Hjemmeskaermafsnit />

      <div className="arkgruppe">
        <h3>Notifikationer</h3>
        <p className="hjaelp">
          Slå dem til under Indstillinger. Så får du besked, når nogen skriver
          i chatten, sladesher dig, går ud i aften, eller runder et rundt tal.
        </p>
        <p className="hjaelp">
          På iPhone virker de kun, når appen er føjet til hjemmeskærmen.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Drik med omtanke</h3>
        <p className="hjaelp">
          Appen tæller — den holder ikke øje med dig. Promillen er et estimat
          til underholdning og siger ingenting om, hvorvidt du må køre bil.
        </p>
      </div>
    </>
  );
}

/**
 * Vejledningen til hjemmeskærmen — det blivende sted.
 *
 * Bjælken øverst i appen (Hjemmeskaermopfordring.tsx) kan lukkes, og den
 * kommer ikke igen. Det er med vilje — et nej skal betyde nej — men det
 * efterlader et hul: den, der lukkede den i en bus og bagefter kom i
 * tanke om det, havde ingen steder at gå hen.
 *
 * Trinene hentes fra samme rene funktion som bjælken, så de to aldrig kan
 * komme til at sige noget forskelligt.
 *
 * Vises ikke, når appen allerede kører fra hjemmeskærmen, og ikke på en
 * computer — begge steder ville den forklare noget, der ikke er der.
 */
function Hjemmeskaermafsnit() {
  if (typeof window === "undefined") return null;

  const installeret =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  if (installeret) return null;

  const platform = bestemPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  const trin = hjemmeskaermtrin(platform);
  if (trin.length === 0) return null;

  return (
    <div className="arkgruppe">
      <h3>Føj den til hjemmeskærmen</h3>
      <p className="hjaelp">
        Så åbner Sladesh i fuld skærm med sit eget ikon
        {platform === "ios"
          ? " — og notifikationer virker, hvilket de ikke gør fra en Safari-fane."
          : ", i stedet for i en fane."}
      </p>
      <ol className="trinliste">
        {trin.map((linje) => (
          <li key={linje}>{linje}</li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Data og samtykke.
 *
 * Hver påstand herunder svarer til noget, der står i koden. Sker der
 * ændringer i, hvad der gemmes eller hvem der ser det, skal denne tekst
 * med — det er hele grunden til, at den er skrevet konkret frem for i
 * almindeligheder.
 */
function DataOgSamtykke() {
  return (
    <>
      <div className="arkgruppe">
        <h3>Kort fortalt</h3>
        <p className="hjaelp">
          Appen gemmer det, der skal til for at holde en stilling: hvem du er,
          hvad du logger, og — mens du er ude — hvor du er. Intet af det deles
          med andre end dem, du er i Kanal med.
        </p>
        <p className="hjaelp">
          Der er ingen annoncer, ingen sporing på tværs af websteder, og
          ingenting sælges videre.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Hvad der gemmes</h3>
        <p className="hjaelp">
          <strong>Din konto.</strong> Email og adgangskode håndteres af
          Firebase Authentication. Appen selv gemmer dit navn, din email, din
          emoji og din farve.
        </p>
        <p className="hjaelp">
          <strong>Hvad du logger.</strong> Hver genstand med tidspunkt,
          kategori og hvilken Kanal. Det er stillingen, historikken og dine
          mærker bygget af.
        </p>
        <p className="hjaelp">
          <strong>Position.</strong> Kun hvis du giver lov. Den sendes, når du
          logger, og mens kortet er åbent.
        </p>
        <p className="hjaelp">
          <strong>Promille.</strong> Kun hvis du selv slår det til. Så gemmes
          køn og vægt, fordi beregningen kræver dem.
        </p>
        <p className="hjaelp">
          <strong>Beskeder og billeder.</strong> Chatbeskeder, og de to
          bevisbilleder fra en gennemført Sladesh.
        </p>
        <p className="hjaelp">
          <strong>Notifikationer.</strong> Slår du dem til, gemmes en
          abonnementsnøgle per enhed. Den indeholder ikke dit telefonnummer
          eller din identitet.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Hvem kan se hvad</h3>
        <p className="hjaelp">
          <strong>Dem du deler Kanal med</strong> ser dit navn, din avatar,
          hvad du har logget i dag, dine mærker og — hvis du har slået den til
          — din promille.
        </p>
        <p className="hjaelp">
          <strong>Din position</strong> vises kun på kortet, mens du er ude i
          dag. Er du ikke ude, udleveres den ikke til nogen.
        </p>
        <p className="hjaelp">
          <strong>Bevisbillederne</strong> fra en Sladesh kan ses af Kanalen
          resten af drikkedagen. Derefter kun af de to, der var med i
          udfordringen.
        </p>
        <p className="hjaelp">
          <strong>Admins</strong> i appen kan se medlemslister, registrere
          donationer og styre kataloget. De kan ikke læse dine private
          beskeder — chatten er Kanalens, ikke privat.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Hvor længe</h3>
        <p className="hjaelp">
          <strong>Chatbeskeder slettes automatisk efter et døgn.</strong> Det
          er der ikke noget at gøre ved — også for dig selv.
        </p>
        <p className="hjaelp">
          Logninger, mærker og Sladesh-historik bliver stående, så længe din
          konto findes. Det er dem, dine livstidstal er lavet af.
        </p>
        <p className="hjaelp">
          Din sidst kendte position bliver liggende i databasen, indtil den
          overskrives af en ny. Den <em>vises</em> ikke, når du ikke er ude,
          men den bliver ikke slettet ved udcheckning.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Dine rettigheder</h3>
        <p className="hjaelp">
          Du har ret til at få indsigt i dine data, få rettet det, der er
          forkert, og få det slettet.
        </p>
        <p className="hjaelp">
          Navn, emoji, farve, promilleindstilling og notifikationer kan du
          selv rette under <strong>Indstillinger</strong>.
        </p>
        <p className="hjaelp">
          <strong>Sletning af din konto sker ikke i appen endnu.</strong> Skriv
          til en admin i din Kanal, så bliver den fjernet manuelt. Vi siger det
          ligeud frem for at love en knap, der ikke findes.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Samtykke</h3>
        <p className="hjaelp">
          Du giver samtykke ved at bruge appen. De tre ting, der kræver et
          aktivt ja, spørger hver for sig, og du kan sige nej til dem alle og
          stadig bruge appen:
        </p>
        <p className="hjaelp">
          <strong>Position</strong> — browserens egen dialog, første gang du
          logger.
          <br />
          <strong>Notifikationer</strong> — slås til i Indstillinger.
          <br />
          <strong>Kamera</strong> — kun når du gennemfører en Sladesh.
        </p>
        <p className="hjaelp">
          Du kan trække hvert af dem tilbage i din browsers eller telefons
          indstillinger for webstedet.
        </p>
      </div>

      <div className="arkgruppe">
        <h3>Hvor det ligger</h3>
        <p className="hjaelp">
          Data ligger hos Convex (database og filer) og Firebase (login).
          Begge er amerikanske udbydere, som behandler data på vegne af
          appen.
        </p>
      </div>
    </>
  );
}
