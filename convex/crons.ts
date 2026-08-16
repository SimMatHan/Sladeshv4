import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Planlagte job.
 *
 * Alle er `interval` frem for faste klokkeslæt. Convex-crons regnes i UTC, og
 * appens grænser er danske — et fast klokkeslæt ville ramme en time forkert
 * det halve år. De job der findes her har ingen grund til at ligge på et
 * bestemt tidspunkt, så problemet undgås helt.
 */
const crons = cronJobs();

/**
 * Sladesh-udløb håndteres primært af `ctx.scheduler.runAt()` i sendSladesh,
 * som fyrer præcis på fristen. Dette job er kun et sikkerhedsnet for
 * udfordringer, hvis planlagte kørsel aldrig skete — fx fordi de blev
 * oprettet før scheduleren fandtes.
 *
 * Det gamle repo havde det omvendt: ingen præcis planlægning, men et job
 * hvert 5. minut som eneste mekanisme. Det betød at en udfordring kunne stå
 * op til 5 minutter over tid, før den blev lukket.
 */
crons.interval(
  "luk efterladte sladesh-udfordringer",
  { minutes: 10 },
  internal.sladesh.fejlEfterladte,
  {},
);

/**
 * Beacon-evaluering. Samme 5-minutters kadence som det gamle repo — den er
 * en del af oplevelsen, ikke bare en implementeringsdetalje: varslingsteksten
 * lover selv brugeren at "næste tjek er om 5 minutter".
 */
crons.interval("evaluer beacons", { minutes: 5 }, internal.beacons.evaluerBeacons, {});

/**
 * Chat-oprydning. Beskeder lever 24 timer. Se convex/messages.ts for hvorfor
 * jobbet kører hver time frem for dagligt som i det gamle repo.
 */
crons.interval(
  "ryd gamle chatbeskeder",
  { hours: 1 },
  internal.messages.ryddGamleBeskeder,
  {},
);

export default crons;
