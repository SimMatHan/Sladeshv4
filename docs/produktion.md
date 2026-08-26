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

Efter cutover findes migreringsfunktionerne ikke længere. Kataloget
vedligeholdes derfra af `scripts/lib/katalog.ts` — den skrevne liste over
varianter — og lægges ind med:

```bash
export KATALOG_EMAIL=<admin-konto>
export KATALOG_PASSWORD=...

# Tørkørsel: viser hvad der mangler, hvad der er ændret, og hvad der kun
# findes i deploymentet. Skriver intet.
CONVEX_URL=https://<produktion>.convex.cloud npm run katalog

CONVEX_URL=https://<produktion>.convex.cloud npm run katalog -- --skriv
```

Kontoen skal have `isAdmin` sat i dashboardet — `opretVariant` er spærret af
`requireAdmin`. Scriptet er idempotent og **sletter aldrig noget**: varianter,
der kun findes i deploymentet, bliver stående og bliver blot rapporteret, så
de kan skrives ind i filen (eller fjernes i hånden).

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
- **CSP kører som `Report-Only`.** En forkert Content-Security-Policy slår
  login ud på en måde, der er svær at gennemskue — den skal kende både
  Firebase Auth' og Convex' endpoints, og de sidste varierer med deploymentet.
  `Content-Security-Policy-Report-Only` **blokerer ingenting**; den skriver i
  stedet en linje i browserkonsollen, hver gang noget ville være blevet
  blokeret. Sådan kan politikken justeres på levende brug uden risiko.

  Politikken åbner for det, appen faktisk bruger: Convex over både HTTPS og
  websocket, Firebases token-endpoints, Google-login i en frame,
  `https://tile.openstreetmap.org` til kortets fliser, og `blob:`/`data:` til
  bevisbilleder undervejs. `style-src` har `'unsafe-inline'`, fordi både
  Leaflet og Reacts `style`-attributter skriver stil direkte på elementer.

  **Sådan strammes den til sidst:** brug appen igennem — log ind med både
  adgangskode og Google, log en genstand, skriv i chatten, åbn kortet,
  gennemfør en Sladesh med billede — og hold øje med konsollen. Er der ingen
  `Report Only`-linjer, omdøbes nøglen i `vercel.json` til
  `Content-Security-Policy`, og så håndhæver den. Er der linjer, siger de
  præcis hvilket direktiv der mangler hvad.
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

### 6a. Gennemgang på `<projekt>.vercel.app` — FØR domænet peger derhen

Alt herunder skal gøres på en **telefon**, ikke en computer. Appen er en
telefonapp, og halvdelen af punkterne findes ikke på et skrivebord.

**Virker den overhovedet**

- [ ] Log ind med en rigtig konto — både adgangskode og Google.
- [ ] Profilen kender sin historik, og stillingen viser noget.
- [ ] Log en genstand. Stillingen flytter sig **med det samme**, ikke efter et
      øjebliks venten.
- [ ] Fortryd den igen. Den forsvinder ligeså hurtigt.
- [ ] Skriv i chatten, åbn kortet, gennemfør en Sladesh med billede.

**Er den en app**

- [ ] Chrome/Android: menuen tilbyder "Installer app" eller "Føj til
      startskærm". Safari/iOS: Del → Føj til hjemmeskærm.
- [ ] Ikonet på hjemmeskærmen er den hvide shaka på flaskegrøn — ikke et
      skærmbillede af siden.

      Baggrunden var koral indtil redesignet. Retning A valgte flaskegrøn
      (`#1B4D3E`) som accent netop FRAVALGT koral, og ikonet blev
      liggende — appen og dens eget ikon var to forskellige farver.
      Håndens hvide og dens skygge er uændrede; kun baggrundens kulør er
      byttet.
- [ ] Åbnet fra hjemmeskærmen er der **ingen adresselinje**.

**Holder den uden net**

- [ ] Åbn appen, slå flytilstand til, genindlæs. Der skal komme en app frem —
      ikke en hvid skærm og ikke dinosauren.
- [ ] Stillingen står der stadig, med sidste kendte tal.
- [ ] Efter et par sekunder står der *"Ingen forbindelse · det du logger,
      sendes når der er dækning"*.
- [ ] Log en genstand i flytilstand. Den lægger sig på stillingen.
- [ ] Slå flytilstand fra igen. Genstanden bliver **liggende** — den er nu
      sendt for alvor. Tjek den er der efter en genindlæsning.

**CSP**

- [ ] Gør alt ovenstående med browserkonsollen åben og noter eventuelle
      `Content Security Policy ... Report Only`-linjer. Se afsnit 4.

Går et af punkterne galt, så **stop her**. Alt kan rettes, mens domænet stadig
peger det gamle sted hen; bagefter retter man det med brugerne kiggende på.

### 6b. Sig det til brugerne, før du skifter

Migreringen genberegnede `totalDrinks` fra logrækkerne, fordi 20 af 32 brugere
havde et tal, der ikke stemte med deres egen historik (største afvigelse: 76).
Tallene er rigtige nu — men de **har ændret sig**, og det opdager folk selv,
hvis de ikke får det at vide. Udkast til beskeden ligger i
[`docs/besked-til-brugerne.md`](besked-til-brugerne.md).

Seks brugere har `promille.gender = null` og ser ingen promille, før de vælger
et køn under Mig → Indstillinger. Det står også i udkastet.

### 6c. Selve skiftet

1. Peg `sladeshapp.dk` mod Vercel (Vercel → Domains giver de nødvendige
   DNS-poster).
2. Tilføj domænet til Firebases authorized domains, hvis det ikke allerede er
   gjort. **Uden dette fejler alt login** med `auth/unauthorized-domain`.
3. Åbn `sladeshapp.dk` på din egen telefon. Ser du den **gamle** app, er det
   ikke DNS — det er den gamle service worker. Se afsnittet nedenfor.
4. Hold det gamle site kørende et par dage. Det læser Firestore, som er
   uændret — de to kan sameksistere.

> **Fra det øjeblik brugerne skriver i den nye app, divergerer de to
> databaser.** Firestore er stadig sandheden for det gamle site, Convex for
> det nye. Der findes ingen synkronisering, og det er ikke meningen at der
> skal være. Beslut ét tidspunkt hvor det gamle site slukkes, og hold det.

### Den gamle service worker skal fortrænges

**Det her er den fælde, der kan få DNS-skiftet til at se ud, som om det ikke
virkede.**

Det gamle site kører `vite-plugin-pwa` med `scope: "/"` og
`registerType: "prompt"`. Alle, der har besøgt eller installeret
`sladeshapp.dk`, har altså allerede en service worker registreret på domænet,
og den serverer den gamle app fra sin egen cache. Når DNS peger et nyt sted
hen, ændrer det **ikke** noget for dem: browseren spørger service workeren,
ikke serveren.

Heldigt sammenfald: `vite-plugin-pwa` lægger sin worker på `/sw.js`, og det
gør vores også. Registreringer slås op på (origin, scope), så browseren
opdager ved sit næste tjek, at scriptet på `/sw.js` er et andet, og
installerer vores i stedet. Men — også vores venter, til alle faner er lukket,
og en installeret PWA lukkes sjældent helt. Der kan gå dage.

Så gør det her:

1. **Tjek det på din egen telefon først.** Åbn `sladeshapp.dk` efter skiftet.
   Ser du den gamle app, er det netop det her, og ikke DNS.
   Chrome: `chrome://inspect/#service-workers`. Safari/iOS: afinstallér appen
   fra hjemmeskærmen og tilføj den igen.
2. **Sig det til brugerne.** "Luk appen helt og åbn den igen" er den ene
   handling, der løser det for alle. På iOS: swipe den væk fra
   app-skifteren — ikke bare tryk hjem.
3. Vores workers `activate` sletter alle andre cacher end sine egne, så
   workbox' precache ryger med, i samme øjeblik den tager over. Der bliver
   ikke to sæt liggende.

Overvej at slå DNS om **på en hverdag om formiddagen** frem for en fredag
aften. Ikke fordi noget går i stykker, men fordi vinduet, hvor nogen kan sidde
med den gamle app uden at vide det, så ikke falder sammen med den aften, de
faktisk skal bruge den.

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

**Åbne punkter:**

- **Stram CSP'en.** Den kører som `Report-Only` og blokerer derfor ingenting.
  Når appen har været brugt igennem uden violations i konsollen, omdøbes
  nøglen i `vercel.json` til `Content-Security-Policy`. Se afsnit 4.
- **Levering af push-varslinger.** Udvælgelsen er bygget og testet
  (`docs/beskeder-og-beacons.md`, afsnit 3); selve kanalen mangler.
- **Holdbar skrivekø.** Convex' kø ligger i hukommelsen. Lukkes appen, mens en
  logning stadig venter på dækning, er den væk. Se `docs/offline.md`, afsnit 3.

**Lukket siden fase 9:** PWA og service worker — appen er installérbar og
åbner uden dækning. Se `docs/offline.md`.

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
| Efter DNS-skiftet vises stadig den GAMLE app | Den gamle service worker. Luk appen helt og åbn igen — se afsnit 6 |
| Appen kan ikke installeres på hjemmeskærmen | `/manifest.webmanifest` eller ikonerne når ikke frem. Åbn dem direkte i browseren |
| `Content Security Policy ... Report Only` i konsollen | Forventet, og hele pointen med Report-Only. Noter direktivet og udvid politikken |
