# Achievements, promille og fortrydelser — fase 8

Denne fase lukker de sidste tre huller i backenden: achievement-motoren,
den rigtige promilleberegning, og en modpart til `logDrink`.

| Ny fil | Afløser |
|---|---|
| `convex/achievementRules.ts` | `src/lib/achievements.ts` + logikken i `src/contexts/AchievementContext.tsx` |
| `convex/achievements.ts` | (ingen — motoren lå i en React-context) |
| `convex/promilleRules.ts` | `src/services/promilleService.ts` |
| `convex/promille.ts` | `src/hooks/useBAC.ts` |
| `convex/drinkRules.ts` | run-begrebet fra `src/services/drinkService.ts` |

---

## 1. Hvad et "run" er

Tre steder skulle vide det samme: scoreboardet, promillen og achievements.
Definitionen ligger derfor ét sted, i `beregnRunStart`:

> Et run starter ved drikkedagens grænse (kl. 10:00 dansk tid) og starter
> forfra hver gang brugeren nulstiller.

**Bevidst afvigelse.** Det gamle repos `resetCurrentRun` nulstillede ved at gå
tilbage og sætte `isReset: true` på alle logninger inden for de seneste 24
timer — et vindue der hverken passede med drikkedagen eller med det forrige
run. Her rører nulstillingen ikke gamle rækker: den er sin egen række, og
runnets start udledes af den seneste af dem. Billigere, historikken forbliver
uforanderlig, og grænsen er entydig.

**Fejl der er rettet undervejs:** `resetRun` skrev allerede en markør-række,
men scoreboardet sprang bare over den uden at flytte grænsen. En nulstilling
nulstillede altså ikke stillingen. Det gør den nu.

---

## 2. Achievements

### Hvad der findes nu

| Funktion | Type | Bemærkning |
|---|---|---|
| `achievements.getAchievementsForUser` | query | Definitioner + tilstand + fremdrift i ét svar. |
| `achievements.getNaesteMilepael` | query | Den man er tættest på. |
| `achievements.getDefinitions` | query | De statiske definitioner. |
| `achievements.tildelManuelt` | mutation | Admin. Kun for `manual`-typen. |
| `achievements.genberegnForBruger` | mutation | Admin. Tilføjer kun, fjerner aldrig. |

Motoren kaldes fra `logDrink` og `resetRun` i **samme transaktion**. I det
gamle repo lå den i en React-context, som kørte 300 ms efter at
brugerdokumentet havde ændret sig: havde man appen lukket, skete der
ingenting, og to åbne faner kunne låse den samme achievement op to gange.
Begge mutations returnerer nu `{ logId, nyeAchievements }`, så klienten kan
vise en animation uden først at gætte hvad der ændrede sig.

### Alt måles på `drinkLogs`

Den gamle motor læste de denormaliserede tællere på brugerdokumentet
(`currentRunDrinkCount`, `drinkVariations`, `allTimeDrinkVariations`,
`drinkTypes`). Netop dem udelod vi bevidst i fase 1, fordi de kunne komme ud
af trit med logrækkerne. Alt tælles derfor direkte på `drinkLogs`.

Livstidstallene hentes via `by_user_and_category` og kun for de kategorier
definitionerne faktisk bruger — i dag `wine` og `cocktail` — i stedet for at
læse hver eneste logning brugeren nogensinde har lavet.

### Rettede fejl fra det gamle repo

**`variationType` indeholdt en kategori.** Feltet hed noget andet end det var,
og klienten troede på navnet: den ledte efter `variationName.includes("wine")`
blandt variantnavnene. Danske vin-varianter hedder "Rødvin" og "Hvidvin", så
"Like Fine Wine" kunne reelt aldrig låses op. Cloud Function-kopien slog
rigtigt op i kategorien. Feltet hedder nu `categoryId`.

**To uenige implementeringer.** Der lå en anden, ufuldstændig motor i
`functions/src/utils/achievements.ts` — fuld af `// Let's assume`-kommentarer,
og uenig med klienten om flere regler. Hvor de var uenige, følger vi
**klienten**; den var den der faktisk kørte. Uenighederne er noteret ved hver
enkelt regel i `achievementRules.ts`.

**Gentagelse af run-baserede achievements.** Det gamle repo sammenlignede
*antallet af nulstillinger*, så man kun kunne få fx Obeerma igen ved at trykke
nulstil. Drak man 10 øl i går og 10 i dag uden at nulstille, kom den ikke igen
— selvom det var to forskellige runs. Nu sammenlignes runnets
**starttidspunkt**, som flytter sig både ved en nulstilling og ved
drikkedagens skift kl. 10:00. Feltet hedder `achievements.lastRunStart`;
mangler den (migrerede rækker), tæller det som et nyt run.

**Flere milepæle på én gang.** Kumulative achievements sættes til antallet af
passerede milepæle frem for `count + 1`, så en stor logning der springer to
milepæle ikke efterlader en oplåsning i kø til næste gang brugeren rører
noget.

### Ikke porteret

Typerne `total_all_drinks`, `time_specific` og `streak` stod i det gamle
repos type-union og havde hver sin gren i klienten, men **ingen definition
brugte dem** — grenene kunne aldrig køre. De er udeladt frem for at stå som
utestet kode. Skal en af dem bruges, er det en ny gren i `maalFor` og en post
i `ACHIEVEMENTS`.

---

## 3. Promille

Formlen var **allerede rigtig** i det gamle repo
(`src/services/promilleService.ts`, Widmark med kategori-specifikke
gramtal). Det var kun *scoreboardet* der brugte pladsholderen
`genstande × 0,18` fra `useLeaderboard.ts` — samme tal for alle, uanset vægt
og køn.

```
promille (‰) = alkoholgram / (vægt_kg × r) − (0,15 × timer siden første genstand)
r = 0,68 (mand) / 0,55 (kvinde)
```

Gramtallene per kategori er overtaget uændret: øl, cider, vin og shot 12 g,
cocktail 16 g, skaleret med `sizeMultiplier`. Fortrydelser bærer negativ
multiplier og trækker sig selv fra.

| Funktion | Bemærkning |
|---|---|
| `promille.getMinPromille` | Egen promille. ALLE ens logninger i runnet, uanset Kanal. |
| `promille.setPromilleIndstilling` | Vægt og køn. Kun ens egne. |

**Scoreboardets promille er `undefined`** for brugere der ikke har slået
promille til eller ikke har udfyldt vægt og køn. At vise et opdigtet tal ved
siden af et rigtigt ville være værre end at vise ingenting.

To ting adskiller scoreboardets promille fra `getMinPromille`: den regnes kun
på logninger i **den pågældende Kanal**, og kun fra drikkedagens start.
Forskellen er bevidst — at hente hvert medlems fulde logbog for at fylde én
kolonne ud ville koste et opslag per medlem ved hver eneste opdatering af
stillingen.

**Om persondata:** vægt og køn skrives kun af brugeren selv og udleveres
aldrig. Kun det *beregnede* tal forlader serveren, og indstillingerne logges
ikke.

> Beregningen er et estimat til underholdning. Widmark tager ikke højde for
> mavesæk, optagelsestid eller individuel forbrænding.

---

## 4. `removeDrink`

`logDrink` havde ingen modpart. Den findes nu, og den bevarer det gamle repos
form: historikken slettes ikke, der indsættes en modpost med
`action: "remove"` og en **negativ** `sizeMultiplier`, så enhver aggregering
trækker den fra af sig selv.

**To nye spærrer.** Den gamle `removeDrink` tog kategori og variantnavn løst
og skrev en negativ række uden reference til noget:

1. Man fortryder en **bestemt** logning (`logId`). Modposten peger tilbage
   med `removesLogId`.
2. Den samme logning kan ikke fortrydes to gange, og kun logninger i det
   **igangværende run** kan fortrydes.

Uden dem kunne man skrive negative rækker i det uendelige og trække både
stillingen og livstidspointene under nul.

Strækken røres ikke ved en fortrydelse: at fortryde en genstand gør ikke
gårsdagens stræk ugyldig, og `computeStreak` afviser i forvejen at forlænge en
stræk på en negativ multiplier (fase 5).

---

## 5. Skema

- `achievements.lastRunStart` — valgfri, se afsnit 2.
- `drinkLogs.removesLogId` — valgfri, se afsnit 4.
- `constants.PROMILLE_PER_DRINK` er **fjernet**. Pladsholderen har ingen
  brugere længere.

Begge nye felter er valgfrie, så migreret data er urørt.

---

## 6. Test

`npm run test:logic`: **185 grønne** (67 nye). Run-grænsen, aggregeringens
vægtning og fortrydelser, Widmark mod håndregnede tal, forbrænding over tid,
beruselsesniveauer, samt hver enkelt achievement-type, gentagelsesreglerne og
næste-milepæl.

Smoke-testen har et nyt afsnit der kører hele kæden mod dev-deploymentet:
oplåsning fra en logning, kumulativ gen-oplåsning, run-baseret gen-oplåsning
efter en nulstilling, promille i det forventede leje, at en nulstilling
nulstiller både stilling og promille, og alle fire afvisninger omkring
`removeDrink`.

---

## 7. Tilbage efter denne fase

Backenden er nu færdig i den forstand, at alle datafunktioner fra det gamle
repo har en modpart. Det der mangler er ikke længere forretningslogik:

- **Levering af varslinger** (Web Push — se `docs/beskeder-og-beacons.md`, afsnit 3).
- **Frontend.** `src/` er stadig et skelet.
- **Produktions-deployment, Vercel og cutover.**
- **Oprydning:** `convex/migrering.ts` og `convex/testing.ts` skal slettes,
  og `MIGRATION_SECRET` fjernes, når produktionen er skiftet over.
