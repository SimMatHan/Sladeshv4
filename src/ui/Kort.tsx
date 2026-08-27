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

/** Zoom når der kun er ét punkt at vise. */
const ENKELT_ZOOM = 16;

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
  const kortRef = useRef<HTMLDivElement>(null);
  const kortet = useRef<L.Map | undefined>(undefined);
  const lag = useRef<L.LayerGroup | undefined>(undefined);
  const harZoomet = useRef(false);

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

    // Zoom kun ved FØRSTE indhold. Gjorde vi det hver gang nogen flytter sig,
    // ville kortet rykke sig under fingeren, mens man kigger.
    if (!harZoomet.current && punkter.length > 0) {
      harZoomet.current = true;
      if (punkter.length === 1) kort.setView(punkter[0], ENKELT_ZOOM);
      else kort.fitBounds(L.latLngBounds(punkter), { padding: [50, 50] });
    }
  }, [svar, beacons, onVaelgPerson]);

  return (
    <div className="kortvisning skaerm-ind">
      <div className="kortflade" ref={kortRef} />

      <p className={svar?.mig.deler === true ? "kortstatus deler" : "kortstatus"}>
        {gpsFejl ?? forklaring(svar)}
      </p>

      {svar !== undefined && svar.mig.deler === true && <CheckOutKnap />}

      {svar !== undefined && svar.personer.length === 0 && (
        <p className="hjaelp">
          Ingen deler deres position lige nu. Man kommer på kortet ved at være
          ude — ikke ved at have appen åben.
        </p>
      )}
    </div>
  );
}

/**
 * Ud af kortet igen.
 *
 * ## Knappen hed "Meld dig ud"
 *
 * Det er det samme ord, som Kanalvælgeren bruger om at melde sig IND i en
 * Kanal med en invitationskode — så "Meld dig ud" lige her læste som "forlad
 * Kanalen". På dansk er "at melde sig ud" af noget netop dét. Handlingen
 * hedder `checkOut` i convex/checkIns.ts, vejen tilbage hedder "Check ind",
 * og der var ingen grund til, at knappen skulle hedde en tredje ting.
 *
 * ## Hvad den faktisk gør
 *
 * `checkInStatus` bliver falsk, og `currentLocation` ryddes. Kortet kræver
 * `erUdeIDag` (se convex/kort.ts), så man forsvinder derfra med det samme.
 *
 * Stillingen gør IKKE det samme: den beholder alle, der har logget noget i
 * dag, uanset markeringen — `if (!checketIndIDag && !harLoggetIDag) continue`
 * i convex/scoreboard.ts. Har man drukket, bliver man altså stående på
 * listen og forsvinder kun fra kortet. Det er den forskel, hjælpelinjen
 * fortæller, for den er ikke til at gætte.
 *
 * Ingen bekræftelse — i modsætning til Nulstil run rører den ingen historik
 * og er trivielt at fortryde: man checker bare ind igen.
 */
function CheckOutKnap() {
  const checkOut = useMutation(api.checkIns.checkOut);
  const [arbejder, setArbejder] = useState(false);

  const send = async () => {
    setArbejder(true);
    try {
      await checkOut({});
    } finally {
      setArbejder(false);
    }
  };

  return (
    <div className="kortaktion">
      <button className="knap" disabled={arbejder} onClick={() => void send()}>
        Check ud
      </button>
      <p className="hjaelp">
        Du forsvinder fra kortet. Har du logget noget i aften, bliver du
        stående på stillingen — og næste genstand sætter dig på kortet igen.
      </p>
    </div>
  );
}

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
    case "ikke_ude":
      return "Din position deles ikke. Log en genstand, så kommer du på kortet.";
    case "position_foraeldet":
      return "Din position er for gammel til at vises. Den opdaterer sig selv.";
    default:
      return "Din position deles ikke endnu. Giv appen adgang til din position.";
  }
}
