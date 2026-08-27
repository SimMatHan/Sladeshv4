import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { gradientFor, klokken } from "../lib/visning";

/**
 * Kortet.
 *
 * Viser hvem i Kanalen der er ude lige nu, og hvor — plus aktive beacons.
 *
 * ## Positionen deles kun, mens man er ude
 *
 * Reglen håndhæves på serveren, ikke her: `users.opdaterPosition` skriver
 * ingenting, når man ikke er ude, og `kort.getKanalPositioner` udleverer
 * ingenting. Denne skærm kan altså ikke omgå den — men den skal FORTÆLLE om
 * den, for en tom prik uden forklaring ligner en fejl.
 *
 * ## Der er ingen Check In-knap
 *
 * Her stod en formular: skriv hvor du er, tryk Check ind. Den er væk. Den
 * fandtes for dem, der ville markere "jeg er ude", FØR de havde logget
 * noget — men aftenens første genstand gør allerede præcis det samme, og
 * så var formularen et ekstra sted at gøre en ting, appen selv gør.
 *
 * `checkIn` i convex/checkIns.ts står stadig; den kaldes bare ikke herfra
 * længere. `logDrink` tæller nu `checkInCount` op, så tallet på Mig ikke
 * fryser, når den ene, der talte det, ikke længere kaldes.
 *
 * ## Om Leaflet
 *
 * Standardmarkøren henter billedfiler ad veje, der ikke overlever en bundler.
 * Derfor bruges `divIcon` med almindelig HTML hele vejen — det giver samtidig
 * den samme avatar som resten af appen frem for en generisk knappenål.
 *
 * Baggrundsfliserne er gråtone og følger appens tema. De er gratis og
 * kræver ingen nøgle, men de kræver kildeangivelse — se `FLISER` nedenfor.
 *
 * Filen har et DEFAULT-eksport, fordi skallen henter den dovent: Leaflet og
 * dets CSS fylder omkring 45 kB gzippet, og det skal ikke koste noget for de
 * fleste sessioner, hvor kortet aldrig bliver åbnet.
 */

/** Hvor ofte egen position sendes, mens kortet er åbent. */
const HJERTESLAG_MS = 30_000;

/**
 * Zoom når der kun er ÉT punkt at ramme ind — egen position, eller den ene
 * nål der er.
 *
 * Den var 16, altså få karréer. Det er for tæt på til det, kortet skal
 * bruges til: man åbner det for at se, om de andre er i nærheden, og ved 16
 * ligger de uden for kanten, uden at man kan se det. 14 rummer en bydel, og
 * så kan man zoome IND, hvis man vil se en gade — det er den vej rundt, der
 * er nem på en telefon.
 */
const ENKELT_ZOOM = 14;

/**
 * Kortnålens diameter i pixels.
 *
 * Den ENE kilde til tallet. Leaflet skal kende det i JavaScript for at
 * placere ikonet rigtigt (`iconSize`/`iconAnchor` nedenfor), og CSS'en
 * (`.kortnaal` i index.css) kan ikke levere det til Leaflet — så i stedet
 * for at have tallet stående to steder, sætter markørens egen inline style
 * målet, og CSS-klassen holder sig til udseendet.
 */
const KORTNAAL_STOERRELSE = 38;

/**
 * Beacon-farven i cirklen på kortet.
 *
 * Leaflet tegner cirklen selv og forstår ikke CSS-variabler — værdien skal
 * derfor stå som en literal streng. Skal MATCHE `--fare` i index.css.
 */
const BEACON_FARVE = "#ef4444";

/**
 * Kortfliserne — OpenStreetMaps egne, gjort grå i CSS.
 *
 * ## Hvorfor ikke CARTO længere
 *
 * Her stod CARTOs Positron og Dark Matter. De var gråtone fra fabrikken og
 * passede appens palet perfekt — men CARTO er begyndt at kræve en API-nøgle
 * på `basemaps.cartocdn.com`, og fliser uden nøgle kommer nu tilbage med
 * teksten "API KEY REQUIRED" BAGT IND I BILLEDET. Kortet var altså ikke i
 * stykker på en måde, nogen fejl kunne fortælle om: det hentede fliser, fik
 * 200 OK, og tegnede en reklame for en nøgle vi ikke har.
 *
 * `vercel.json` fangede det heller ikke: dens CSP tillader
 * `https://tile.openstreetmap.org` og har ALDRIG tilladt cartocdn. Politikken
 * kører som Report-Only og blokerer derfor ingenting — men den dag den
 * strammes (docs/produktion.md, afsnit 4), ville kortet være gået fra
 * "forkerte fliser" til "ingen fliser". Nu peger koden samme sted som
 * politikken.
 *
 * ## Gråtonen er flyttet til CSS
 *
 * OSM's egne fliser er FARVEDE: grønne parker, gule veje, blåt vand. På en
 * skærm hvor alt andet er creme og én accent, var det det eneste sted appen
 * tabte sin palet — og de farvede veje trak øjet væk fra det, kortet handler
 * om, nemlig prikkerne. Grunden til at vælge Positron var altså rigtig nok.
 *
 * `filter` på `.leaflet-tile-pane` gør det samme uden en nøgle: grå i lys,
 * grå og inverteret i mørk. Se `.kortflade` i index.css. Filteret ligger på
 * FLISE-panelet alene, så nåle, beacons og kildeangivelsen bliver ved med at
 * have deres egne farver.
 *
 * Bonus: temaskiftet kræver ikke længere JavaScript. Fliserne er de samme i
 * begge temaer, så CSS'en kan klare det selv, og lytteren på
 * `prefers-color-scheme` kunne ryge ud.
 *
 * KILDEANGIVELSEN er et vilkår og står nederst i kortet. Den skal blive der.
 */
const FLISER = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const FLISEKILDE =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export default function Kort({
  channelId,
  onVaelgPerson,
}: {
  channelId: Id<"kanaler">;
  onVaelgPerson: (userId: Id<"users">) => void;
}) {
  const svar = useQuery(api.kort.getKanalPositioner, { channelId });
  const beacons = useQuery(api.beacons.getBeacons, { channelId });
  const opdaterPosition = useMutation(api.users.opdaterPosition);

  const [gpsFejl, setGpsFejl] = useState<string | undefined>();

  /**
   * Telefonens EGEN position — uafhængig af, om serveren kender den.
   *
   * Her lå fejlen: kortet blev udelukkende rammet ind efter de punkter,
   * serveren svarede med, altså beacons og de personer der er ude. Og din
   * egen position når kun serveren, hvis du er ude — `users.opdaterPosition`
   * skriver ingenting og svarer `{ delt: false }`, når du ikke er.
   *
   * Konsekvensen var, at "tillad position" ikke flyttede kortet en meter.
   * Var der ingen beacons, blev det stående på standardvisningen (København);
   * var der en enkelt beacon oprettet fra en telefon i England, sad kortet i
   * Chester, uanset hvor i verden man selv stod.
   *
   * Browseren har hele tiden haft koordinaterne i `watchPosition` nedenfor —
   * de blev bare kastet væk, hvis hjerteslaget ikke lige skulle sende.
   *
   * Kun det FØRSTE fix gemmes (`forrige ?? …`). Det er alt, indramningen
   * skal bruge, og det holder antallet af gentegninger på præcis én: GPS'en
   * rapporterer flere gange i sekundet, og en `setState` per fix ville
   * gentegne kortet lige så ofte.
   */
  const [minPosition, setMinPosition] = useState<
    { lat: number; lng: number } | undefined
  >();
  const kortRef = useRef<HTMLDivElement>(null);
  const kortet = useRef<L.Map | undefined>(undefined);
  const lag = useRef<L.LayerGroup | undefined>(undefined);
  /** Er kortet rammet ind overhovedet? Sat af den foreløbige indramning. */
  const harZoomet = useRef(false);
  /** Er det rammet ind efter EGEN position? Så ligger det stille for altid. */
  const rammetEfterEgen = useRef(false);

  // --- Egen position ------------------------------------------------------
  // Sendes med et fast mellemrum, mens kortet er åbent, frem for ved hver
  // eneste GPS-opdatering: telefonen rapporterer flere gange i sekundet, og
  // det ville blive til en skrivning per sekund per bruger.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsFejl("Din browser kan ikke dele position.");
      return;
    }

    let sidsteSendt = 0;

    const vagt = navigator.geolocation.watchPosition(
      (position) => {
        setGpsFejl(undefined);

        // Gemmes FØR hjerteslagets spærre nedenfor. Indramningen må ikke
        // vente på, at der er gået et helt interval, og den må slet ikke
        // afhænge af, om positionen bliver delt — det er to forskellige
        // ting, og det var netop sammenblandingen, der var fejlen.
        setMinPosition((forrige) =>
          forrige ?? {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        );

        const nu = Date.now();
        if (nu - sidsteSendt < HJERTESLAG_MS) return;
        sidsteSendt = nu;

        void opdaterPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (fejl) => {
        setGpsFejl(
          fejl.code === fejl.PERMISSION_DENIED
            ? "Du har ikke givet appen adgang til din position."
            : "Kunne ikke finde din position.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(vagt);
  }, [opdaterPosition]);

  // --- Kortet selv --------------------------------------------------------
  useEffect(() => {
    if (kortRef.current === null || kortet.current !== undefined) return;

    const kort = L.map(kortRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([55.6761, 12.5683], 12); // København, indtil vi ved bedre

    // `detectRetina` er BEVIDST ude. Den beder om @2x-fliser, og
    // tile.openstreetmap.org har dem ikke — Leaflet ville hente dobbelt op i
    // zoom og få en 404 for hver flise. CARTO havde dem, deraf `{r}` i den
    // gamle URL.
    L.tileLayer(FLISER, {
      maxZoom: 19,
      attribution: FLISEKILDE,
    }).addTo(kort);

    kortet.current = kort;
    lag.current = L.layerGroup().addTo(kort);

    // Ingen lytter på `prefers-color-scheme` længere: fliserne er de samme i
    // begge temaer, og gråtonen sættes af CSS på `.leaflet-tile-pane`. Et
    // temaskifte midt i en session følger derfor med af sig selv.

    return () => {
      kort.remove();
      kortet.current = undefined;
      lag.current = undefined;
    };
  }, []);

  // --- Markører -----------------------------------------------------------
  useEffect(() => {
    const kort = kortet.current;
    const gruppe = lag.current;
    if (kort === undefined || gruppe === undefined) return;

    gruppe.clearLayers();
    const punkter: L.LatLngExpression[] = [];

    for (const beacon of beacons ?? []) {
      punkter.push([beacon.lat, beacon.lng]);

      L.circle([beacon.lat, beacon.lng], {
        radius: beacon.radius ?? 50,
        color: BEACON_FARVE,
        weight: 1,
        fillColor: BEACON_FARVE,
        fillOpacity: 0.18,
      })
        .bindPopup(`🚨 ${beacon.title ?? "Beacon"}`)
        .addTo(gruppe);
    }

    for (const person of svar?.personer ?? []) {
      punkter.push([person.lat, person.lng]);

      const naal = L.divIcon({
        className: "",
        html: `<div class="kortnaal${person.erMig ? " mig" : ""}"
                    style="width:${KORTNAAL_STOERRELSE}px;height:${KORTNAAL_STOERRELSE}px;background:${gradientFor(person.farve)}">${
                      person.emoji ??
                      person.navn.charAt(0).toLocaleUpperCase("da-DK")
                    }</div>`,
        iconSize: [KORTNAAL_STOERRELSE, KORTNAAL_STOERRELSE],
        iconAnchor: [KORTNAAL_STOERRELSE / 2, KORTNAAL_STOERRELSE / 2],
      });

      L.marker([person.lat, person.lng], { icon: naal })
        .on("click", () => onVaelgPerson(person.userId))
        .bindTooltip(`${person.navn} · ${klokken(person.opdateretAt)}`)
        .addTo(gruppe);
    }

    // Ram kortet ind ÉN gang. Gjorde vi det, hver gang nogen flytter sig,
    // ville kortet rykke sig under fingeren, mens man kigger.
    //
    // EGEN POSITION VINDER, når telefonen har givet os en. Den er det, man
    // åbner kortet for at få svar på, og den kan ikke trækkes skæv af data
    // et helt andet sted: en enkelt beacon oprettet fra en telefon i England
    // sendte tidligere hele visningen til Chester. De andres nåle og
    // beacons er der stadig — de skal bare ikke bestemme, hvor man lander.
    //
    // Uden et GPS-fix er det som før: ét punkt centreres, flere rammes ind.
    // Så er alternativet nemlig standardvisningen over København, og et
    // vilkårligt punkt i Kanalen er bedre end et vilkårligt punkt i Danmark.
    //
    // TO flag, ikke ét. Convex svarer typisk hurtigere, end GPS'en får fat,
    // så en beacon nåede at ramme kortet ind, før positionen fandtes — og
    // et enkelt `harZoomet` ville så spærre for den rigtige indramning et
    // sekund senere. Det er præcis den rækkefølge, der efterlod kortet i
    // Chester. Derfor må egen position ramme ind ÉN gang oven i en
    // foreløbig indramning; bagefter ligger kortet stille.
    if (rammetEfterEgen.current) return;

    if (minPosition !== undefined) {
      rammetEfterEgen.current = true;
      harZoomet.current = true;
      kort.setView([minPosition.lat, minPosition.lng], ENKELT_ZOOM);
      return;
    }

    if (!harZoomet.current && punkter.length > 0) {
      harZoomet.current = true;
      if (punkter.length === 1) kort.setView(punkter[0], ENKELT_ZOOM);
      else kort.fitBounds(L.latLngBounds(punkter), { padding: [50, 50] });
    }
  }, [svar, beacons, minPosition, onVaelgPerson]);

  return (
    <div className="kortvisning skaerm-ind">
      <div className="kortflade" ref={kortRef} />

      {/* Tomt betyder INGEN linje, ikke en tom linje: et `<p>` uden tekst
          har stadig sin margin, og kortet ville få et spring under sig,
          der ikke hørte til noget. Se `forklaring`. */}
      {(gpsFejl ?? forklaring(svar)) !== "" && (
        <p className={svar?.mig.deler === true ? "kortstatus deler" : "kortstatus"}>
          {gpsFejl ?? forklaring(svar)}
        </p>
      )}

      {svar !== undefined && svar.personer.length === 0 && (
        <p className="hjaelp">Ingen deler deres position lige nu.</p>
      )}
    </div>
  );
}

/*
 * HER LÅ "CHECK UD".
 *
 * En knap der kaldte `checkIns.checkOut`, ryddede `currentLocation` og tog
 * dig af kortet med det samme. Den er fjernet efter ønske.
 *
 * Det efterlader ingen manuel vej AF kortet — men heller ikke en blivende
 * tilstand: `erUdeIDag` (convex/drinkRules.ts) kræver, at `lastCheckIn`
 * ligger inde i den aktuelle drikkedag, så man falder af helt af sig selv
 * ved næste dagsskifte kl. 10:00. Positionen deles altså aftenen ud og ikke
 * længere.
 *
 * `checkIns.checkOut` står stadig på serveren. Den er ikke fjernet med, for
 * det er en anden beslutning end at tage knappen ud af skærmen — og skulle
 * vejen ud vise sig at mangle, er den så et kald væk frem for en ny
 * mutation.
 */

/**
 * Hvorfor deler jeg (ikke) min position?
 *
 * En prik der bare mangler, ligner en fejl. Derfor står grunden skrevet ud —
 * og kun for én selv: at fortælle hvorfor en ANDEN ikke er på kortet, ville i
 * sig selv være en oplysning om vedkommende.
 */
function forklaring(svar: { mig: { deler: boolean; grund?: string } } | undefined): string {
  if (svar === undefined) return "Henter kortet …";
  if (svar.mig.deler) return "📍 Din position deles med Kanalen";

  switch (svar.mig.grund) {
    // TOM efter ønske. Her stod "Log en genstand, så kommer du på kortet" —
    // en opfordring til at drikke, hver gang man åbnede kortet uden at være
    // ude. De øvrige grene bliver: de melder om noget, der er GALT (adgang
    // nægtet, position forældet), og som brugeren kan gøre noget ved. Den
    // her meldte kun om en tilstand, der er helt i orden.
    case "ikke_ude":
      return "";
    case "position_foraeldet":
      return "Din position er for gammel til at vises. Den opdaterer sig selv.";
    default:
      return "Din position deles ikke endnu. Giv appen adgang til din position.";
  }
}
