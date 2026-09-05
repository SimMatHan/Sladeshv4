import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Planlagte job.
 *
 * De fleste er `interval` frem for faste klokkeslæt. Convex-crons regnes i
 * UTC, og appens grænser er danske — et fast klokkeslæt ville ramme en time
 * forkert det halve år. De job der bare skal køre jævnligt, har ingen grund
 * til at ligge på et bestemt tidspunkt, så problemet undgås helt.
 *
 * ÉN skal ligge på et klokkeslæt: fredags- og lørdagspåmindelsen kl. 20.
 * Den er derfor `hourly` og afgør SELV, om timen er den rigtige — regnet i
 * dansk tid, hvor sommertiden er kendt. Se paamindelser.ts.
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

/**
 * Fredags- og lørdagspåmindelsen.
 *
 * Kører hver time på minut 0; `mindOmAtLogge` returnerer med det samme de 22
 * gange i døgnet, hvor timen ikke er kl. 20 dansk tid, og de fem dage om
 * ugen, der ikke er fredag eller lørdag. Det er billigere end at have en
 * cron, der rammer forkert to gange om året.
 *
 * `minuteUTC: 0` er hele UTC-timen, ikke et dansk klokkeslæt — dansk tid er
 * altid et helt antal timer fra UTC, så minut 0 i UTC er også minut 0 i
 * København.
 */
// BEMÆRK: cron-navne skal være printbar ASCII — Convex validerer dem mod
// /^[ -~]*$/ og AFVISER hele pushet, hvis et navn indeholder æ, ø eller å.
// Det er den ene slags dansk i dette repo, der ikke må skrives dansk. Der er
// en prøve på det i scripts/logic-test.ts, så det ikke skal opdages af et
// mislykket deploy igen.
crons.hourly(
  "mind om at logge i weekenden",
  { minuteUTC: 0 },
  internal.paamindelser.mindOmAtLogge,
  {},
);

/**
 * Aktivitetspåmindelsen — spejlbilledet af den ovenfor.
 *
 * Hver time fra 14 til 02 dansk tid, og kun til dem der ER ude. Samme
 * konstruktion og af samme grund: timen afgøres i dansk tid inde i
 * funktionen, ikke af et UTC-klokkeslæt her.
 *
 * De to job kunne have delt én kørsel, men de deler ikke andet end klokken:
 * hver sin modtagerkreds, hver sin spærre og hver sin tekst. To navne i
 * Convex-dashboardet, der siger hvad de gør, er mere værd end ét kald sparet
 * i timen.
 */
crons.hourly(
  "mind om at logge videre, mens man er ude",
  { minuteUTC: 0 },
  internal.paamindelser.mindOmAktivitet,
  {},
);

export default crons;
