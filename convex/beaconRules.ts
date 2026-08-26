/**
 * Beacon-reglerne som rene funktioner.
 *
 * Rekonstrueret fra det gamle repos
 * functions/src/scheduled/beaconNotifications.ts (den planlagte Cloud
 * Function, som var den autoritative implementering) og
 * src/services/adminService.ts (createStressSignal).
 *
 * Ingen import fra `_generated`, så reglerne kan afprøves af
 * scripts/logic-test.ts uden et deployment.
 */

/** Radius i meter når beaconen ikke selv angiver én. */
export const BEACON_RADIUS_M = 50;

/** En beacon deaktiveres 2 timer efter oprettelsen. BEACON_EXPIRY_MS. */
export const BEACON_LEVETID_MS = 2 * 60 * 60 * 1000;

/** Højst 6 varslingsrunder per beacon, så deaktiveres den. */
export const BEACON_MAX_RUNDER = 6;

/**
 * En position ældre end 15 minutter bruges ikke.
 *
 * STALE_THRESHOLD_MS i det gamle repo. Uden den ville en bruger, der var i
 * nærheden i går, blive talt som til stede i dag.
 */
export const POSITION_FORAELDET_MS = 15 * 60 * 1000;

/** Defaults fra adminService.createStressSignal. */
export const BEACON_TYPE = "stress";
export const BEACON_STANDARD_TITEL = "Stress Beacon";
export const BEACON_STANDARD_BESKED = "Stress signal aktiveret!";
export const BEACON_UKENDT_OPRETTER = "En admin";

/** Jordens radius i meter — til Haversine. */
const JORDRADIUS_M = 6371e3;

/**
 * Afstand mellem to koordinater i meter (Haversine).
 * Overtaget uændret fra calculateDistance i det gamle repo.
 */
export function afstandIMeter(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const fi1 = (lat1 * Math.PI) / 180;
  const fi2 = (lat2 * Math.PI) / 180;
  const dFi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dFi / 2) * Math.sin(dFi / 2) +
    Math.cos(fi1) * Math.cos(fi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);

  return JORDRADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** En position med sit EGET tidsstempel. */
export type Position = { lat: number; lng: number; opdateretAt: number };

/** Delmængden af brugerdokumentet som positionsopslaget bruger. */
export type PositionsKilde = {
  location?: { lat: number; lng: number; lastUpdated: number };
  currentLocation?: {
    lat: number;
    lng: number;
    venue: string;
    timestamp: number;
  } | null;
};

/**
 * Brugerens seneste kendte position, eller `undefined`.
 *
 * `location` foretrækkes, fordi den skrives løbende af kortet;
 * `currentLocation` sættes kun ved Check In.
 *
 * BEVIDST AFVIGELSE fra det gamle repo: Cloud Functionen hentede
 * KOORDINATERNE fra `currentLocation` først, men ALDEREN fra
 * `location.lastUpdated` først. Havde en bruger checket ind i mandags og
 * siden bevæget sig med kortet åbent, parrede den altså mandagens
 * koordinater med et friskt tidsstempel — og brugeren talte som til stede et
 * sted, hun ikke var. Her følges hvert koordinatsæt af sit eget tidsstempel.
 *
 * Det gamle `lastLocation`-felt er udeladt: det er legacy og indgår ikke i
 * Convex-schemaet.
 */
export function laesPosition(bruger: PositionsKilde): Position | undefined {
  if (bruger.location !== undefined) {
    return {
      lat: bruger.location.lat,
      lng: bruger.location.lng,
      opdateretAt: bruger.location.lastUpdated,
    };
  }

  if (bruger.currentLocation !== undefined && bruger.currentLocation !== null) {
    return {
      lat: bruger.currentLocation.lat,
      lng: bruger.currentLocation.lng,
      opdateretAt: bruger.currentLocation.timestamp,
    };
  }

  return undefined;
}

/** Er positionen for gammel til at bruges? */
export function erPositionForaeldet(opdateretAt: number, now: number): boolean {
  return now - opdateretAt > POSITION_FORAELDET_MS;
}

/**
 * Er beaconen løbet ud?
 *
 * `expiresAt` respekteres hvis den er sat; ellers er grænsen 2 timer efter
 * oprettelsen, som i Cloud Functionen.
 */
export function erBeaconUdloebet(
  beacon: { createdAt: number; expiresAt?: number },
  now: number,
): boolean {
  const udloeb = beacon.expiresAt ?? beacon.createdAt + BEACON_LEVETID_MS;
  return now > udloeb;
}

/** Er runderne brugt op? */
export function erRunderOpbrugt(notificationsSent: number | undefined): boolean {
  return (notificationsSent ?? 0) >= BEACON_MAX_RUNDER;
}

/** Titlen falder tilbage til stedet og derefter til standardtitlen. */
export function beaconTitel(
  title: string | undefined,
  venue: string | undefined,
): string {
  return title?.trim() || venue?.trim() || BEACON_STANDARD_TITEL;
}

/**
 * Teksten i varslingen.
 *
 * ## Admins egen besked bliver brugt nu
 *
 * `opretBeacon` har altid gemt et `message`-felt, og admin-formularen har
 * altid haft et felt til det. Ingen af delene nåede nogensinde frem:
 * funktionen her tog kun opretterens navn og returnerede den samme faste
 * tekst hver gang. Man kunne skrive hvad som helst i feltet, og modtagerne
 * fik det aldrig at se.
 *
 * ## Hvorfor standarden ikke bare blev erstattet
 *
 * Den faste tekst er ordret fra det gamle repo, inklusive emojis, og
 * brugerne kender den. Skriver admin INTET, gemmer `opretBeacon`
 * standardbeskeden — og så skal varslingen se ud, som den altid har.
 *
 * Har admin derimod skrevet noget, er det dét, der skal stå. At hænge
 * "Log en drink NU – næste tjek er om 5 minutter" på enden af en besked,
 * nogen har formuleret selv, ville begrave den: den, der skrev "Sidste
 * omgang inden vi går", mente ikke også det andet.
 */
export function beaconVarsling(
  opretterNavn: string,
  besked?: string,
): { titel: string; tekst: string } {
  const titel = "🚨 STRESS BEACON AKTIVERET! 🚨";
  const egen = besked?.trim();

  if (egen !== undefined && egen.length > 0 && egen !== BEACON_STANDARD_BESKED) {
    // Navnet står stadig med. En besked uden afsender er en besked, man
    // ikke ved, om man skal tage alvorligt.
    return { titel, tekst: `${opretterNavn}: ${egen}` };
  }

  return {
    titel,
    tekst:
      `${opretterNavn} har aktiveret en Stress Beacon i dit område! ` +
      `Log en drink NU – næste tjek er om 5 minutter! 🍻🔥`,
  };
}

/**
 * Skal denne bruger varsles om denne beacon?
 *
 * Samlet i én funktion, så rækkefølgen af spærrer kan afprøves isoleret.
 * Returnerer en årsag frem for bare `false`, så evalueringen kan tælle hvorfor
 * brugere blev sprunget over — uden at logge hvem.
 */
export type Varslingsbeslutning =
  | { varsl: true; afstand: number }
  | {
      varsl: false;
      aarsag:
        | "er_opretter"
        | "allerede_varslet"
        | "ingen_position"
        | "position_foraeldet"
        | "uden_for_radius";
      afstand?: number;
    };

export function beslutVarsling(input: {
  erOpretter: boolean;
  alleredeVarslet: boolean;
  position: Position | undefined;
  beaconLat: number;
  beaconLng: number;
  radius: number;
  now: number;
}): Varslingsbeslutning {
  if (input.erOpretter) return { varsl: false, aarsag: "er_opretter" };
  if (input.alleredeVarslet) return { varsl: false, aarsag: "allerede_varslet" };
  if (input.position === undefined) {
    return { varsl: false, aarsag: "ingen_position" };
  }
  if (erPositionForaeldet(input.position.opdateretAt, input.now)) {
    return { varsl: false, aarsag: "position_foraeldet" };
  }

  const afstand = afstandIMeter(
    input.beaconLat,
    input.beaconLng,
    input.position.lat,
    input.position.lng,
  );

  if (afstand > input.radius) {
    return { varsl: false, aarsag: "uden_for_radius", afstand };
  }

  return { varsl: true, afstand };
}
