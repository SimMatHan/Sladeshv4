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
 * ## Om Leaflet
 *
 * Standardmarkøren henter billedfiler ad veje, der ikke overlever en bundler.
 * Derfor bruges `divIcon` med almindelig HTML hele vejen — det giver samtidig
 * den samme avatar som resten af appen frem for en generisk knappenål.
 *
 * Baggrundsfliserne kommer fra OpenStreetMap. De er gratis og kræver ingen
 * nøgle, men de kræver kildeangivelse — den står nederst i kortet og skal
 * blive der.
 *
 * Filen har et DEFAULT-eksport, fordi skallen henter den dovent: Leaflet og
 * dets CSS fylder omkring 45 kB gzippet, og det skal ikke koste noget for de
 * fleste sessioner, hvor kortet aldrig bliver åbnet.
 */

/** Hvor ofte egen position sendes, mens kortet er åbent. */
const HJERTESLAG_MS = 30_000;

/** Zoom når der kun er ét punkt at vise. */
const ENKELT_ZOOM = 16;

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

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(kort);

    kortet.current = kort;
    lag.current = L.layerGroup().addTo(kort);

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
        color: "#ef4444",
        weight: 1,
        fillColor: "#ef4444",
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
                    style="background:${gradientFor(person.farve)}">${
                      person.emoji ??
                      person.navn.charAt(0).toLocaleUpperCase("da-DK")
                    }</div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
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
    <div className="kortvisning">
      <div className="kortflade" ref={kortRef} />

      <p className={svar?.mig.deler === true ? "kortstatus deler" : "kortstatus"}>
        {gpsFejl ?? forklaring(svar)}
      </p>

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
      return "Din position deles ikke. Log en genstand for at komme på kortet.";
    case "position_foraeldet":
      return "Din position er for gammel til at vises. Den opdaterer sig selv.";
    default:
      return "Din position deles ikke endnu. Giv appen adgang til din position.";
  }
}
