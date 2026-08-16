# Beskeder og beacons — porteret til Convex (fase 7)

Denne fase flytter de to sidste rene datafunktioner fra det gamle repo:
kanal-chatten og stress-beacons. Begge fandtes kun som tabeller i schemaet
efter fase 1 — nu har de mutations, queries, regler og planlagte job.

Kilderne i `SimMatHan/Sladesh2.0` (læst, aldrig ændret):

| Ny fil | Afløser |
|---|---|
| `convex/messages.ts` | `src/services/messageService.ts` |
| `convex/messageRules.ts` | — (rene regler, udtrukket) |
| `convex/beacons.ts` | `src/services/adminService.ts` (`createStressSignal`), `functions/src/scheduled/beaconNotifications.ts` |
| `convex/beaconRules.ts` | `functions/src/scheduled/beaconNotifications.ts` (`calculateDistance` m.fl.) |
| `convex/crons.ts` | `functions/src/scheduled/deleteOldMessages.ts`, `sendBeaconNotifications` |

---

## 1. Chat

### Hvad der findes nu

| Funktion | Type | Bemærkning |
|---|---|---|
| `messages.sendMessage` | mutation | Kræver medlemskab. Trimmer, afviser tom og for lang tekst. |
| `messages.getMessages` | query | Ældste først. Loft på 200. |
| `messages.markerLaest` | mutation | Sætter `users.lastMessageViewedAt[channelId]`. |
| `messages.getUlaeste` | query | Ulæst-status for alle brugerens Kanaler. |
| `messages.setAktivChat` | mutation | Tilstedeværelse — hvilken chat er åben lige nu. |
| `messages.getVarslingsmodtagere` | query | Hvem der SKULLE varsles (se afsnit 3). |
| `messages.ryddGamleBeskeder` | internalMutation | 24-timers oprydning, batchet. |

`subscribeToChannelMessages` har ingen modpart: Convex-queries er reaktive af
sig selv. `getMessages` **er** abonnementet, når den kaldes med `useQuery`.

### Nye felter på `users`

- `lastMessageViewedAt: Record<Id<"kanaler">, number>` — driver ulæst-markeringen.
- `activeChatChannelId: Id<"kanaler">?` — tilstedeværelse.

Ingen af dem blev migreret. Chat-historik blev heller ikke migreret (den lever
kun 24 timer, så der var intet at flytte), og uden beskeder er der intet at
være ulæst. Første gang en bruger åbner en Kanal, sættes feltet.

### Bevidste afvigelser fra det gamle repo

**Oprydningen kører hver time, ikke dagligt.** `runDeleteOldMessages` kørte
én gang i døgnet kl. 10:00 og slettede beskeder ældre end 24 timer. En besked
skrevet kl. 10:05 blev altså først slettet efter næsten 48 timer — det
dobbelte af den lovede levetid, og løftet var begrundet i privatliv. Timevis
kørsel holder loftet på 25 timer. Sidegevinst: intervallet har intet
klokkeslæt, så cron-udtrykket skal ikke oversættes mellem UTC og dansk
sommer-/vintertid.

**Oprydningen er batchet.** 200 beskeder per kørsel, og resten planlægges som
en ny kørsel. En Convex-mutation har en øvre grænse for hvor mange dokumenter
den må røre; uden batchning ville en ophobning få hele transaktionen til at
fejle og efterlade **alt**.

**Længdegrænse på 2000 tegn.** Det gamle repo havde ingen. Hele kanalens
historik hentes i ét svar, så få lange beskeder kunne ellers sprænge svaret
for alle.

**At sende markerer også som læst.** Ellers ville ens egen besked stå som
ulæst for én selv, indtil chatten blev åbnet igen.

**Adgangskontrollen ligger i koden.** I det gamle repo lå den kun i
`firestore.rules` — altså ét sted uden for koden, som ingen test rørte.

---

## 2. Beacons

### Hvad der findes nu

| Funktion | Type | Bemærkning |
|---|---|---|
| `beacons.opretBeacon` | mutation | **Admin only.** Defaults ordret fra `createStressSignal`. |
| `beacons.getBeacons` | query | Aktive til alle Kanalens medlemmer, inaktive kun til admins. |
| `beacons.deaktiverBeacon` | mutation | Admin only. Idempotent. |
| `beacons.evaluerBeacons` | internalMutation | Cron hvert 5. minut. |

Reglerne er uændrede fra Cloud Functionen: radius 50 m som default, højst 6
varslingsrunder, levetid 2 timer, positioner ældre end 15 minutter tæller
ikke, opretteren varsles aldrig om sin egen beacon, og hver bruger varsles
højst én gang per beacon.

**Oprettelse er nu en serverregel.** Det var admin-only i praksis også før —
admin-portalen og kortets admin-tilstand var de eneste to skriveveje — men
spærren lå i UI'et.

### Bevidste afvigelser

**Position og tidsstempel følges ad.** Cloud Functionen hentede
*koordinaterne* fra `currentLocation` først, men *alderen* fra
`location.lastUpdated` først. Havde en bruger checket ind i mandags og siden
bevæget sig med kortet åbent, parrede den mandagens koordinater med et frisk
tidsstempel — og brugeren talte som til stede et sted, hun ikke var. Nu
foretrækkes `location` (som kortet skriver løbende), og hvert koordinatsæt
følges af sit eget tidsstempel.

**Beacons kan bindes til en Kanal.** `beacons.channelId` fandtes i schemaet
fra fase 1, men blev aldrig brugt. Er den sat, gælder beaconen kun Kanalens
medlemmer — både når der varsles, og når kortet henter dem. `isAdmin` styrer
kun om *slukkede* beacons er med i svaret, ikke om man må se på tværs af
Kanaler; admins slipper bevidst ikke uden om kanalspærren, jf.
`convex/identity.ts`.

**Sidste runde slukker med det samme.** Før blev den 6. runde skrevet, og
beaconen først slukket ved næste kørsel 5 minutter senere.

**`lastLocation` er væk.** Legacy-felt, indgår ikke i Convex-schemaet.

### Om `notifiedUsers` på migrerede rækker

Map'et er nøglet på **Convex-bruger-id** for alt denne app selv skriver, men
de migrerede rækker bærer **Firebase-UID'er**, fordi migreringen kopierede
map'et ordret. De to kan ikke forveksles i praksis: evalueringen slukker en
udløbet beacon **før** den ser på `notifiedUsers`, og hver migreret beacon er
for længst ældre end 2 timer. Ingen migreret række kan nå varslingsstien.
Derfor er feltet `v.record(v.string(), …)` — så begge former rummes uden at
skulle omskrive migreret data.

### Nyt index

`users.by_check_in` på `["checkInStatus"]`. Evalueringen skal finde alle
indcheckede brugere på tværs af Kanaler; uden index ville den scanne hele
`users` hvert 5. minut.

---

## 3. Det der IKKE er bygget: selve leveringen

Push-notifikationer gik gennem Web Push og collectionen `pushSubscriptions`,
som bevidst ligger uden for migreringens afgrænsning
(`docs/eksisterende-datamodel.md`, afsnit 7.6). Der er derfor **ingen
levering** i denne fase.

Det der ER bygget, er hele **udvælgelsen** — den del hvor reglerne bor:

- `messages.getVarslingsmodtagere` → Kanalens medlemmer minus afsenderen,
  minus dem der har chatten åben.
- `beacons.evaluerBeacons` → returnerer per beacon en titel, en tekst og en
  liste af modtagere.

Begge steder er der ét sted at koble en leveringskanal på, den dag der er en.
Teksterne er ordret fra det gamle repo, inklusive emojis — brugerne kender
dem.

Bemærk at `evaluerBeacons` **markerer** modtagerne i `notifiedUsers`, selvom
intet sendes. Det er med vilje: alternativet ville få alle til at blive
varslet på én gang, den dag levering kobles på. I praksis er der ingen
forskel, fordi enhver beacon slukkes efter to timer.

---

## 4. Test

**`npm run test:logic`** (kræver intet deployment) dækker de rene regler:
tekstvalidering, ulæst-detektionens grænsetilfælde, oprydningsgrænsen,
Haversine mod kendte afstande, positionsopslagets forrang, forældelse, udløb,
runder, titel-fallbacks og rækkefølgen af varslingsspærrerne.

**`npm run smoke-test`** dækker resten mod dev-deploymentet: adgangskontrol
begge veje, snapshots, ulæst-status, tilstedeværelses-signalet, beacon-
defaults, en varslingsrunde, deduplikering i anden runde, radius og udløb.

To ting i `convex/testing.ts` gør beacon-afsnittet muligt, begge spærret til
`smoke-test+`-emails og kun for den kaldende bruger selv:

- `setSmokeTestAdmin` — beacons kan kun oprettes af admins, og uden dette
  kunne testen kun afprøve at oprettelse bliver *afvist*.
- `koerBeaconEvaluering` — kalder præcis den samme funktion som cron-jobbet,
  så det der afprøves er produktionsstien. At vente på næste 5-minutters
  kørsel ville gøre testen både langsom og upålidelig.

> `convex/testing.ts` bør slettes sammen med `convex/migrering.ts`, når
> produktionen er skiftet over.

**Advarsel:** beacon-evalueringen ser på **alle** aktive beacons i
deploymentet, ikke kun testens egne, og sidste kørsel bruger et `now` tre
timer frem. Det er den samme oprydning cron-jobbet foretager af sig selv, men
kør aldrig smoke-testen mod produktion.

---

## 5. Tilbage efter denne fase

- **Levering af varslinger** (afsnit 3).
- **Produktions-deployment, Vercel og cutover.**

> Achievements-motoren, promilleberegningen og `removeDrink` stod også på
> denne liste. De kom med i fase 8 — se `docs/achievements-og-promille.md`.
