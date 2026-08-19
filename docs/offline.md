# Appen på dårlig forbindelse

SladeshApp bruges i en bar, i en kælder, til en festival. Det er præcis de
steder, hvor der er to bjælker dækning — og en app, der står stille, når man
trykker på den, føles ikke som en app, der er installeret på telefonen.

Denne fil samler, hvad der sker på et dårligt net: hvad Convex selv klarer,
hvad vi har bygget ovenpå, og hvad der stadig ikke virker.

---

## 1. Hvad Convex allerede gør

Det er værd at slå fast først, fordi det ændrer, hvad der overhovedet er et
problem. Convex er ikke en REST-klient, der fyrer et kald af og håber.

**Queries blanker ikke ud, når forbindelsen ryger.** `RemoteQuerySet` i
klienten er et `Map`, der kun opdateres af transitions fra serveren og aldrig
ryddes ved genforbindelse. Så længe appen er åben, bliver stillingen stående
med sidste kendte værdi i stedet for at falde tilbage til `undefined`.

**Mutations står i kø og bliver sendt igen.** `RequestManager.restart()`
samler alle mutations, der ikke har fået svar, og sender dem påny, når
websocket'en er oppe. En øl, man logger uden dækning, kommer altså igennem,
når der bliver hul.

**Actions gør ikke.** De droppes med "Connection lost while action was in
flight". Det rammer os ikke: `convex/` indeholder nul actions, alt er queries
og mutations. **Det er en begrænsning, der skal huskes, hvis der nogensinde
kommer en action til** — den skal i så fald kunne tåle at fejle.

---

## 2. Hvad vi har bygget ovenpå

### Service worker — appen åbner uden dækning

Før: en genindlæsning uden net gav en **hvid skærm**. Ikke langsom, tom.

`scripts/sw-skabelon.js` lægger skallen — `index.html`, JS, CSS, ikoner — i
cachen ved installation og serverer den derfra. Listen over indholdshashede
filnavne udfyldes ved bygning af et lille plugin i `vite.config.ts`; det er
det eneste, en service worker skal vide, som ikke kan skrives i hånden.

Alt under `/assets/` er indholdshashet, så cache-først kan ikke tage fejl:
ændrer indholdet sig, ændrer navnet sig.

Kortfliser fra OpenStreetMap caches også, med et loft på 400 og ældste-først
oprydning. Uden loftet ville et par aftener med kortet åbent æde lageret.

Convex og Firebase røres **aldrig** af service workeren. Data må ikke komme
fra en cache, der ikke ved, hvad der er forældet.

**Opdateringer.** Service workeren tager ikke over af sig selv. Gjorde den
det, kunne en kørende side komme til at hente `Kort-<gammel hash>.js`, som
hverken er i cachen eller på serveren mere. Den nye version venter, appen
siger "Ny version klar" i statusbjælken, og brugeren trykker selv.

### Optimistiske opdateringer — trykket slipper med det samme

Før ventede ( + )-arket på serverens svar, før det lukkede. På to bjælker
betød det, at man trykkede på en knap, der ikke gjorde noget, i flere
sekunder — og så trykkede igen.

`src/lib/optimistiskeKald.ts` bruger Convex' `withOptimisticUpdate` til at
skrive gættet ind i klientens egen kopi af queryresultaterne. Stillingen
flytter sig i samme frame, som man trykker. Gættet ryger af sig selv, når
serverens svar lander — **også hvis mutationen fejler**, så skærmen kan ikke
blive stående i en løgn.

To handlinger har det: **at logge en genstand** og **at sende en besked**.
Resten af appen er ting, man gør sjældent.

Reglerne for, hvad gættet ER, ligger i `src/lib/optimistisk.ts` som rene
funktioner, så `npm run test:logic` kan holde dem op mod serverens. Det, der
kan gøre ondt, er ikke et tal, der er lidt forkert — serveren retter det —
men en **rækkefølge**, der afviger fra `convex/scoreboard.ts`. Så ville rækker
hoppe rundt, hver gang et svar landede. Sorteringen er derfor testet mod
samme tie-breaker som serveren.

Fortryd hører med: kvitteringen kender vægten af det, den lige har vist, og
trækker den fra igen med det samme.

### Øjebliksbillede — koldstart maler straks

Convex' hukommelse holder kun, mens appen er **åben**. Ved en koldstart er
hver query `undefined`, indtil websocket'en står, og det er dér, man får
skeletter i stedet for tal.

`src/lib/oejebliksbillede.ts` gemmer sidst kendte svar i localStorage og maler
det, indtil det rigtige lander. Ét lag, ingen synkronisering: localStorage
skrives **kun** af serverens svar og læses **kun**, når der endnu ikke er et.

Fire queries er med — dem skallen ikke kan vise noget uden:

| Query | Hvad det redder |
|---|---|
| `users.getMe` | Hele skallen. Uden den står appen på "Henter din profil …" |
| `scoreboard.getScoreboard` | Stillingen, appens forside |
| `kanaler.getKanal` | Kanalens navn i toppen |
| `drinkVariations.getDrinkVariations` | ( + )-arket er fyldt ud, når det åbner |

Tre spærrer:

- **Ejerskab.** Hver pakke bærer Firebase-uid'et på den, der gemte den. En
  telefon, hvor to har været logget ind, kan ikke vise den forriges stilling.
  Ved logud ryddes det hele.
- **Holdbarhed, 12 timer.** En stilling fra i går ville være direkte
  misvisende — drikkedagen er en ny.
- **Ingen positioner.** Kortet gemmes ikke. Et kort over, hvem der var hvor i
  går aftes, liggende i klartekst på telefonen, har vi ikke brug for.

### Statusbjælken — man skal kunne se forskel på i stykker og i gang

Det værste ved dårlig dækning er ikke ventetiden, men ikke at vide, om noget
gik galt. `src/ui/Forbindelse.tsx` viser tre ting, og kun når der er noget at
sige:

- **Ingen forbindelse** — efter 3,5 sekunder. Websocket'en falder kortvarigt
  ned ved helt almindelige ting (skift mellem wifi og mobil, fornyelse af
  login-tokenet); sagde vi det med det samme, ville bjælken blinke hele
  aftenen og betyde ingenting.
- **Gemmer …** — efter 1,2 sekunder med mutations undervejs.
- **Ny version klar** med en Opdater-knap.

Ordlyden er en forsikring, ikke en fejl: *"det du logger, sendes når der er
dækning"*. Skreg den i rødt, ville folk holde op med at logge.

---

## 3. Hvad der stadig ikke virker

Ærligt, fordi det er det, der afgør, hvad næste skridt er.

**Køen overlever ikke, at appen lukkes.** Convex' kø ligger i hukommelsen.
Logger man en øl uden dækning, og telefonen dræber fanen, før der kommer hul
igennem, er øllen væk — lydløst. Det kræver en holdbar kø, en klientnøgle på
`drinkLogs` mod dubletter ved genafspilning, og et klient-tidsstempel,
serveren klamper, så en øl logget 09:50 og sendt 10:30 ikke lander på den
forkerte drikkedag og skubber både stræk, promille og achievements. Det er
sit eget skridt.

**Optimistiske opdateringer virker ikke ved helt offline koldstart.** Gættet
skrives ind i Convex' egen kopi af queryresultaterne, og den er tom, når
socket'en aldrig har været oppe. Øjebliksbilledet er et **billede**, ikke
levende tilstand: stillingen står der, men den flytter sig ikke, før der er
forbindelse. I det almindelige tilfælde — dårligt, men eksisterende net — er
socket'en oppe, og alt virker.

**Firebase-tokenet kan ikke fornyes uden net.** Brugeren gemmes i IndexedDB,
så login-skærmen dukker ikke op igen, men et ID-token, der er over en time
gammelt, kan ikke fornyes. Appen kan altså vise cachede data og ikke
forbinde. Det er netop derfor, øjebliksbilledet er forskellen på "appen
husker mig" og en hvid skærm.

**Push-varslinger leveres stadig ikke.** Uændret — se `README.md`.

---

## 4. Hvad man skal huske, når man ændrer noget

- **Nye filer i `public/`** skal med i `OFFENTLIGE_FILER` i `vite.config.ts`.
  Vite kopierer `public/` uden om bundtet, så de dukker ikke op af sig selv,
  og uden dem mangler filen, første gang appen åbnes uden dækning.
- **Ændrer `convex/scoreboard.ts` sin sortering**, skal `sorter()` i
  `src/lib/optimistisk.ts` følge med. Testene fanger det.
- **En ny action i `convex/`** skal kunne tåle at fejle på en genforbindelse.
- **Cachede queries skal have en nøgle, der bærer alt, hvad der ændrer
  svaret** — typisk Kanalens id. To Kanaler under samme nøgle ville vise den
  forkerte stilling i et øjeblik.
