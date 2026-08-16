import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Planlagte job.
 *
 * Sladesh-udløb håndteres primært af `ctx.scheduler.runAt()` i sendSladesh,
 * som fyrer præcis på fristen. Dette cron-job er kun et sikkerhedsnet for
 * udfordringer, hvis planlagte kørsel aldrig skete — fx fordi de blev
 * oprettet før scheduleren fandtes.
 *
 * Det gamle repo havde det omvendt: ingen præcis planlægning, men et job
 * hvert 5. minut som eneste mekanisme. Det betød at en udfordring kunne stå
 * op til 5 minutter over tid, før den blev lukket.
 */
const crons = cronJobs();

crons.interval(
  "luk efterladte sladesh-udfordringer",
  { minutes: 10 },
  internal.sladesh.fejlEfterladte,
  {},
);

export default crons;
