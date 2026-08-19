# Produktion: deployment, migrering og cutover

Fase 9. Denne fil er en **køreplan** — kommandoerne skal køres af et menneske
med adgang til Convex, Vercel, Firebase og produktions-Firestore.

Læs afsnit 1 til ende, før du kører noget. Rækkefølgen er ikke tilfældig:
backenden skal stå, før frontenden bygges mod den, og data skal ligge, før
nogen logger ind.

---

## 0. Hvad der allerede er gjort i koden

| Ændring | Hvorfor |
|---|---|
| `vercel.json` | Byggekommando, SPA-rewrites, cache og sikkerhedsheadere i git frem for i en dashboard-indstilling ingen kan se |
| `scripts/vercel-build.sh` | Produktionsbuild deployer Convex; preview-build gør ikke. Se afsnit 4 |
| `TILLAD_TESTFUNKTIONER` | `convex/testing.ts` er død kode på deployments hvor variablen ikke er sat |
| Smoke-testens forhåndstjek | Afbryder mod et deployment uden testfunktioner, **før** den opretter noget |
| `CONVEX_URL` vinder i `scripts/migrer.ts` | Et enkelt kald kan pege mod produktion uden at `.env.local` skal redigeres og huskes tilbage |
| `--bekraeft=<vært>` ved `--ryd` | `--ryd` sletter alt. Mod et udtrykkeligt valgt deployment skal værtsnavnet skrives af |
| Personoplysninger ude af logs | Email, sted og invitationskoder skrives ikke længere til deployment-loggen |

---

## 1. Overblik

```
  ┌─ Firebase Auth ────────┐        uændret. Brugerne beholder deres logins.
  │  sladeshultimate-1     │        Kun `firebase/auth` bruges.
  └────────────┬───────────┘
               │ JWT
  ┌────────────▼───────────┐        npx convex deploy
  │  Convex (produktion)   │◄────── kører som en del af Vercels build
  │  database + funktioner │
  └────────────▲───────────┘
               │ VITE_CONVEX_URL (sat af convex deploy under buildet)
  ┌────────────┴───────────┐
  │  Vercel                │        frontenden
  └────────────────────────┘
```

Firestore indgår ikke. Den læses én sidste gang under migreringen og røres
aldrig igen.

**Fire spor, i denne rækkefølge:**

1. Opret produktions-deploymentet i Convex og giv det dets variabler.
2. Migrér produktionsdata fra Firestore ind i det.
3. Sæt Vercel op og få den til at bygge mod produktionen.
4. Skift domænet over.

---

## 2. Convex-produktion

Convex-projektet har allerede et dev-deployment. Produktionen er et **andet
deployment i samme projekt** med sin egen database — der er ingen data i den,
før du migrerer.

```bash
# 1. Push kode, schema og crons til produktion.
npx convex deploy
```

`deploy` peger på projektets **produktions**-deployment (til forskel fra
`convex dev`, der peger på dit personlige dev-deployment). Findes produktionen
ikke endnu, provisioneres den. Kommandoen skriver dens URL — **gem den**, den
bruges i afsnit 3:

```
https://<navn>.convex.cloud
```

Deployet **fejler** her, hvis `VITE_FIREBASE_PROJECT_ID` mangler. Det er med
vilje (`convex/auth.config.ts`): alternativet var et deployment der lykkedes
og derefter afviste hvert eneste login som "unauthenticated", hvilket ligner
en fejl i login-flowet frem for en manglende variabel.

```bash
# 2. Deployment-variabler. `--prod` er ikke til at springe over —
#    uden det rammer du dev.
npx convex env set --prod VITE_FIREBASE_PROJECT_ID sladeshultimate-1

# 3. Kontrollér. Der skal stå ÉN variabel.
npx convex env list --prod
```

> **`TILLAD_TESTFUNKTIONER` sættes ALDRIG på produktion.** Det er den eneste
> ting der står mellem produktionsdatabasen og en smoke-test kørt mod den
> forkerte URL. Lad den være usat, så er `convex/testing.ts` død kode.

Sæt den til gengæld på dev, ellers kan smoke-testen ikke længere køre:

```bash
npx convex env set TILLAD_TESTFUNKTIONER ja   # BEMÆRK: uden --prod
npx convex dev --once                          # dev skal have fase 9-koden
npm run smoke-test                             # skal stadig være grøn
```

> `npx convex dev --once` er ikke til at springe over. **`convex deploy`
> pusher til produktion; dev opdateres kun af `convex dev`.** Efter et
> produktions-deploy er dev altså stadig på den forrige kode, og smoke-testen
> afbryder med at den ikke kan finde `testing:testmiljoStatus`.

---

## 3. Migrering af produktionsdata

Samme script som til dev, peget et andet sted hen. Det **læser kun** fra
Firestore og skriver aldrig til Firebase.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/.config/sladesh/datarevision-key.json
export CONVEX_URL=https://<produktion>.convex.cloud

# Hemmeligheden: generér ÉN gang, brug begge steder.
export MIGRATION_SECRET=$(openssl rand -hex 32)
npx convex env set --prod MIGRATION_SECRET "$MIGRATION_SECRET"

# Tørkørsel FØRST. Læser, transformerer, rapporterer — skriver intet.
npm run migrer

# Rækketallene skal matche docs/datarevision.md. Gør de det:
npm run migrer -- --skriv
```

`CONVEX_URL` vinder over `VITE_CONVEX_URL`, netop så `.env.local` kan blive
liggende urørt og pege på dev. Scriptet skriver måldeploymentet ud, før det
gør noget — **læs den linje** før du taster videre.

Efter kørslen:

```bash
# Spærren fjernes med det samme. Den skal kun være åben mens migreringen kører.
npx convex env remove --prod MIGRATION_SECRET
npx convex env list --prod          # der skal igen kun stå projekt-id'et
```

### Drikkevarianter (tilføjet i fase 10)

Kataloget over drikkevarianter kom først med efter hovedmigreringen. Det
tilføjes for sig, uden at røre noget andet:

```bash
npm run migrer -- --skriv --kun-varianter
```

`migrering.opretDrinkVariations` springer varianter over, der allerede findes
i samme kategori, så kommandoen kan køres igen uden at give dubletter.

### Skal migreringen køres om

`--ryd` sletter **alt** i måldeploymentet. Mod et deployment valgt med
`CONVEX_URL` kræver den, at værtsnavnet skrives af — man rammer den ikke ved
et uheld:

```bash
npm run migrer -- --skriv --ryd --bekraeft=<produktion>.convex.cloud
```

### Kontrollér

```bash
npx convex run migrering:status '{"secret":"'"$MIGRATION_SECRET"'"}' --prod
npx convex run migrering:findBrudteReferencer '{"secret":"'"$MIGRATION_SECRET"'"}' --prod
```

Kør den **før** du fjerner `MIGRATION_SECRET`. Tallene skal svare til
`docs/datarevision.md`, og `migrering:findBrudteReferencer` skal give nul.

> Bemærk fra fase 4: 20 af 32 brugere havde en `totalDrinks` der ikke stemte
> med deres egne logrækker (største afvigelse: 76). Migreringen genberegner
> fra logrækkerne, så tallene bliver rigtige — men de **ændrer sig** for de
> brugere. Overvej at sige det til dem, frem for at lade dem opdage det.

---

## 4. Vercel

### Projektet

Importér repoet i Vercel. Framework-detektion siger Vite, hvilket er rigtigt.
`vercel.json` overtager resten, så der er intet at klikke i byggeindstillinger.

### Miljøvariabler

Vercel har tre miljøer. **Det er her det kan gå galt** — en preview-build med
en produktionsnøgle ville kunne pushe backend-kode til produktion fra en
vilkårlig gren.

| Variabel | Production | Preview | Hvorfor |
|---|:--:|:--:|---|
| `CONVEX_DEPLOY_KEY` | ✅ | ❌ | En rigtig hemmelighed. Sættes den på Preview, kan enhver gren deploye til produktion |
| `VITE_CONVEX_URL` | ❌ | ✅ | På Production sættes den af `convex deploy` under buildet. På Preview skal den pege på dev |
| `VITE_FIREBASE_API_KEY` | ✅ | ✅ | |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✅ | ✅ | |
| `VITE_FIREBASE_PROJECT_ID` | ✅ | ✅ | |
| `VITE_FIREBASE_STORAGE_BUCKET` | ✅ | ✅ | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ✅ | ✅ | |
| `VITE_FIREBASE_APP_ID` | ✅ | ✅ | |

`CONVEX_DEPLOY_KEY` hentes i Convex-dashboardet under produktions-deploymentet
→ *Generate Production Deploy Key*.

`VITE_*` indlejres i klient-bundlet ved build og er derfor per definition
offentlige. Firebase-web-nøgler ER offentlige identifikatorer — adgang styres
af reglerne og af authorized domains, ikke af nøglen. `CONVEX_DEPLOY_KEY` er
det stik modsatte og må aldrig få `VITE_`-præfiks.

> **Markér ikke `VITE_*` som Sensitive i Vercel.** Flaget beskytter ingenting
> her — værdierne ender alligevel i bundlet, hvor enhver besøgende kan læse
> dem — og det forhindrer dig i at læse dem tilbage, når du skal fejlsøge.
> Ved den første produktionsudrulning nåede de seks Firebase-variabler ikke
> frem til Vite, og resultatet var et build uden en eneste fejl, som først gik
> i stykker i browseren med `auth/invalid-api-key`. `CONVEX_DEPLOY_KEY` skal
> til gengæld blive Sensitive: den er en rigtig hemmelighed og indlejres ikke
> nogen steder.

`scripts/vercel-build.sh` tjekker nu de seks navne, før den bygger, og
afbryder med en liste over hvad der mangler. Et build kan altså ikke længere
lykkes og alligevel udrulle en app, hvor login er dødt fra start.

### Hvordan buildet forgrener sig

`scripts/vercel-build.sh` ser efter `CONVEX_DEPLOY_KEY`:

- **Findes den** → `npx convex deploy --cmd 'npm run build'`. Convex pusher
  backenden og sætter `VITE_CONVEX_URL` for det indre byggetrin. Frontend og
  backend kommer derfor altid fra samme commit. Variabelnavnet sættes
  udtrykkeligt med `--cmd-url-env-var-name`; Convex kan selv gætte det ud fra
  frameworket, men et forkert gæt giver en frontend uden URL, og den fejl
  viser sig først i browseren.
- **Findes den ikke** → kun `npm run build`, mod den `VITE_CONVEX_URL` der
  allerede står i miljøet.

Nøglen styrer altså grenen, og fordi den kun findes på Production, kan en
preview-build ikke røre produktionens backend.

### Om `vercel.json`

JSON kan ikke bære kommentarer, så valgene står her:

- **`rewrites`** sender alt undtagen `/assets/` til `index.html`. Der er ingen
  router endnu, men den kommer med UI'et, og uden reglen giver et genindlæst
  dybt link en 404.
- **`Permissions-Policy`** åbner `geolocation` og `camera` for appen selv
  (Check In, kort og Sladesh-bevisbilleder bruger dem) og lukker `microphone`
  helt.
- **Ingen CSP endnu.** En Content-Security-Policy skal kende Firebase Auth'
  og Convex' endpoints, og de sidste varierer med deploymentet. En forkert
  CSP slår login ud på en måde der er svær at gennemskue. Den hører til, når
  UI'et er på plads og kan afprøves — noteret i afsnit 7. Bemærk at kortet
  henter baggrundsfliser fra `https://tile.openstreetmap.org`, så en CSP skal
  også åbne for den.
- **`Cache-Control: immutable`** på `/assets/` er sikkert, fordi Vite giver
  hver fil et indholds-hash i navnet. `index.html` får det bevidst ikke.

---

## 5. Firebase

Firebase Authentication rører vi ikke — brugerne beholder deres logins. Der er
kun ét hul at lukke:

**Authentication → Settings → Authorized domains.** Tilføj:

- `<projekt>.vercel.app`
- domænet fra afsnit 6

Uden dem afviser Firebase login fra det nye site, og fejlen (`auth/
unauthorized-domain`) dukker først op når nogen prøver at logge ind.

---

## 6. Cutover

1. Verificér på `<projekt>.vercel.app`, **før** domænet peger derhen: log ind
   med en rigtig konto, kontrollér at profilen kender sin historik, og at
   scoreboardet viser noget.
2. Peg `sladeshapp.dk` mod Vercel (Vercel → Domains giver de nødvendige
   DNS-poster).
3. Tilføj domænet til Firebases authorized domains, hvis det ikke allerede er
   gjort.
4. Hold det gamle site kørende et par dage. Det læser Firestore, som er
   uændret — de to kan sameksistere.

> **Fra det øjeblik brugerne skriver i den nye app, divergerer de to
> databaser.** Firestore er stadig sandheden for det gamle site, Convex for
> det nye. Der findes ingen synkronisering, og det er ikke meningen at der
> skal være. Beslut ét tidspunkt hvor det gamle site slukkes, og hold det.

### Tilbagerulning

Indtil DNS er skiftet, er tilbagerulning at lade være med at skifte det.
Bagefter er det at pege domænet tilbage — Firestore står urørt, så det gamle
site virker stadig. Alt hvad brugerne har lavet i den nye app i mellemtiden,
bliver dog liggende i Convex og kommer ikke med tilbage. Derfor: kort vindue,
og en beslutning på forhånd om hvornår tilbagerulning ikke længere er en
mulighed.

---

## 7. Efter cutover

Rydder op, når det gamle site er slukket:

```bash
# Migreringsfunktionerne er kun til én ting, og den er overstået.
git rm convex/migrering.ts scripts/migrer.ts
# Testfunktionerne følger med, når smoke-testen ikke længere skal bruges.
```

Kontrollér til sidst, at hverken `MIGRATION_SECRET` eller
`TILLAD_TESTFUNKTIONER` står på produktion:

```bash
npx convex env list --prod
```

Der skal stå **én** variabel: `VITE_FIREBASE_PROJECT_ID`.

**Åbne punkter, som hører til UI-fasen:**

- Content-Security-Policy (se afsnit 4).
- Levering af push-varslinger. Udvælgelsen er bygget og testet
  (`docs/beskeder-og-beacons.md`, afsnit 3); selve kanalen mangler.
- PWA/service worker. Det gamle site var installérbart; det er dette ikke
  endnu.

---

## 8. Fejl du kan løbe ind i

| Symptom | Årsag |
|---|---|
| `convex deploy` fejler med `VITE_FIREBASE_PROJECT_ID mangler` | Variablen er ikke sat på deploymentet. `npx convex env set --prod …` |
| Alt fejler som "unauthenticated" efter login | Projekt-id'et på deploymentet matcher ikke tokenets `aud`. Sammenlign med `VITE_FIREBASE_PROJECT_ID` i frontenden |
| `auth/unauthorized-domain` ved login | Domænet mangler i Firebases authorized domains (afsnit 5) |
| `auth/invalid-api-key` i browseren, og `[Auth] Firebase-config er ufuldstændig` i konsollen | `VITE_FIREBASE_*` nåede ikke frem til buildet. Fjern Sensitive-flaget og byg igen — buildet fanger det nu selv |
| Buildet afbryder med "Firebase-konfigurationen mangler" | Netop det. Variablerne gælder ikke for det miljø, buildet kører i |
| Smoke-testen afbryder med "tillader ikke testfunktioner" | Den peger på produktion — eller `TILLAD_TESTFUNKTIONER` mangler på dev |
| Smoke-testen kender ikke `testing:testmiljoStatus` | Dev er bagud. `convex deploy` rammer produktion; kør `npx convex dev --once` |
| `migrering:status` findes ikke | Koden er ikke deployet til det deployment du spørger. `npx convex deploy` |
| `MIGRATION_SECRET er ikke sat` | Fjernet efter migreringen, som den skal være. Sæt den igen hvis du skal køre om |
| Vercel-buildet deployer ikke Convex | `CONVEX_DEPLOY_KEY` mangler på miljøet Production |
| Preview-build fejler på manglende `VITE_CONVEX_URL` | Sæt den på miljøet Preview, pegende på dev |
