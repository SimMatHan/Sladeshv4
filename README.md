# SladeshApp v4

Re-arkitektur af [SladeshApp.dk](https://sladeshapp.dk) fra Firebase/Firestore
til Convex. Nyt projekt — det gamle repo (`SimMatHan/Sladesh2.0`) bruges kun som
læse-reference og ændres ikke.

**Status: trin 1 er bygget.** Backenden er komplet, produktionsdata er migreret,
og appen kører på Vercel. Alle skærme fra kortlægningen er der: log en genstand,
se stillingen, skift Kanal, se en profil, hele Sladesh-livscyklussen, chatten,
historikken, kortet, indstillingerne og førstegangsforløbet.

Appen er en **installerbar PWA**: den åbner uden dækning, trykkene reagerer
med det samme, og den siger til, når forbindelsen er væk — se
[`docs/offline.md`](docs/offline.md).

Tilbage er det, der er bevidst udskudt — push-levering, donationer, broadcasts,
temaer og admin-skærme — og selve redesignet.

Domænet `sladeshapp.dk` peger stadig på det gamle site og skifter først, når
appen kan det, brugerne bruger den til.

- Udrulning og cutover: **[`docs/produktion.md`](docs/produktion.md)**
- Beskeden til brugerne ved skiftet: **[`docs/besked-til-brugerne.md`](docs/besked-til-brugerne.md)**
- Appen på dårligt net: **[`docs/offline.md`](docs/offline.md)**
- Hvad UI'et skal dække: **[`docs/skaermkortlaegning.md`](docs/skaermkortlaegning.md)**
- Hvordan det skal hænge sammen: **[`docs/brugerrejser.md`](docs/brugerrejser.md)**

## Kom i gang

```bash
npm install        # SKAL køres først — se nedenfor
cp .env.example .env.local        # udfyld Firebase-værdierne
npx convex dev                    # forbinder projektet og skriver Convex-værdierne
npx convex env set VITE_FIREBASE_PROJECT_ID <dit-firebase-projekt-id>
npm run dev
```

`npx convex env set` er ikke til at springe over: `convex/auth.config.ts` kører
på Convex-serveren og kan ikke læse den lokale `.env`. Mangler variablen,
fejler deployet med en besked om netop det.

`npm install` skal køres **før** `npx convex dev`. Convex bundler funktionerne i
`convex/` med esbuild, og bundleren slår `convex/server` op i projektets eget
`node_modules`. Mangler det, provisionerer CLI'en godt nok deploymentet, men
bundlingen fejler bagefter med:

```
✘ [ERROR] Could not resolve "convex/server"
    convex-virtual-config:./convex/convex.config.js:1:26
```

`npx convex dev` skal køres mindst én gang før `npm run dev`: den skriver
`VITE_CONVEX_URL` til `.env.local` og regenererer `convex/_generated/`.

## Scripts

| Script | Gør |
|---|---|
| `npm run dev` | Convex-backend og Vite-frontend samtidig |
| `npm run dev:frontend` | Kun Vite |
| `npm run dev:backend` | Kun `convex dev` (watch + deploy af schema) |
| `npm run build` | Typecheck + produktionsbuild |
| `npm run check` | `tsc --noEmit` for frontend, Convex-funktioner og scripts |
| `npm run test:logic` | Rene forretningsregler — kræver intet deployment |
| `npm run smoke-test` | Fuld vej mod dev-deploymentet, autentificeret. Opretter selv sine testkonti |
| `npm run migrer` | Firestore → Convex. Tørkørsel som default |
| `npm run datarevision` | Læser produktions-Firestore og rapporterer afvigelser |
| `npm run katalog` | Drikkekataloget fra den skrevne liste. Tørkørsel som default |
| `npm run lint` | oxlint |

## Struktur

```
convex/
  schema.ts        Datamodellen — 8 tabeller
  auth.config.ts   Convex accepterer JWT'er fra Firebase Authentication
  identity.ts      getCurrentUser + adgangskontrol-hjælpere
  crons.ts         Planlagte job: sladesh-udløb, beacons, chat-oprydning

  users.ts kanaler.ts checkIns.ts drinkLogs.ts   Kernemutations og -queries
  drinkVariations.ts  Kataloget over drikkevarianter
  messages.ts      Kanal-chat
  beacons.ts       Stress-signaler
  sladesh.ts       Sladesh-livscyklussen
  achievements.ts  Achievement-motoren
  promille.ts      Promille efter Widmark
  scoreboard.ts    Scoreboard som live query (IKKE en tabel)
  historik.ts      Kanalens aktivitet dag for dag
  kort.ts          Hvem er ude, og hvor

  *Rules.ts        Rene regler uden database — afprøves af test:logic
  streaks.ts       Stræk- og pointregler
  constants.ts     Forretningskonstanter overtaget fra det gamle repo
  migrering.ts     Engangsfunktioner til datamigreringen. Slettes efter cutover
  testing.ts       Smoke-testens hjælpere. Slås fra på produktion. Slettes med
  _generated/      Genereret af `npx convex dev` — skal committes
docs/
  eksisterende-datamodel.md    Kortlægning af den gamle Firestore-model
  datarevision.md              Revision af produktionsdata før migrering
  beskeder-og-beacons.md       Fase 7
  achievements-og-promille.md  Fase 8
  produktion.md                Udrulning og cutover
  skaermkortlaegning.md        Alle 20 skaerme i den gamle app, og hvad backenden mangler
  brugerrejser.md              Ny informationsarkitektur og brugerrejser
  offline.md                   PWA, cache og optimistiske opdateringer
  besked-til-brugerne.md       Udkast til det, brugerne skal have at vide ved cutover
scripts/
  logic-test.ts    Forretningsregler, kører lokalt
  smoke-test.ts    Ende-til-ende mod dev-deploymentet
  migrer.ts        Firestore → Convex
  vercel-build.sh  Byggekommandoen Vercel kører
  sw-skabelon.js   Service workeren. Fillisten udfyldes af pluginet i vite.config.ts
src/
  App.tsx          Skallen: to faner, ( + )-knappen, arkene
  index.css        Designtokens og grundstil — bevidst uden CSS-framework
  ui/              Stilling, Chat, Historik, Kort, LogArk, KanalVaelger,
                   Personkort, Mig, Indstillinger, Onboarding, ProfilFelter,
                   SladeshOvertagelse, Forbindelse, Ark, Avatar
  lib/             firebase.ts (kun Auth), visning.ts (farver og formatering),
                   oejebliksbillede.ts (sidst kendte svar), optimistisk.ts +
                   optimistiskeKald.ts (svar foer serveren), serviceworker.ts
  contexts/        AuthContext
  hooks/           useFirebaseAuthForConvex — broen mellem Firebase og Convex
```

## Autentificering

Firebase Authentication beholdes som identitetsudbyder, så de eksisterende
brugerkonti bevares 1:1. Convex verificerer selv de JWT'er Firebase udsteder —
Convex Auth-biblioteket bruges ikke.

**Firestore bruges ikke.** Kun `firebase/auth` importeres; databasen er Convex.

Smoke-testen kræver ingen opsætning: den bruger to faste konti
(`smoke-test+a@` og `smoke-test+b@`) og opretter dem i Firebase Auth første
gang. Der skal to til, fordi adgangskontrollen mellem brugere ikke kan
afprøves med én — B skal være logget ind og alligevel afvises på A's Kanal.

Identiteten kommer altid fra det verificerede token, aldrig fra klientens
argumenter. `users.authId` = tokenets `sub` = Firebase UID. Migreringen satte
`authId` til brugerens eksisterende Firebase UID, så login matcher automatisk
og ingen skal oprette sig på ny.

## Deployments

Dev og produktion deler **ingenting** — hver har sin egen database og sit eget
sæt deployment-variabler. To ting følger af det:

- `VITE_FIREBASE_PROJECT_ID` skal sættes begge steder, ellers afvises hvert
  eneste token.
- `TILLAD_TESTFUNKTIONER=ja` sættes **kun** på dev. Uden den er
  `convex/testing.ts` død kode, og smoke-testen kan ikke røre produktionsdata,
  uanset hvad man kommer til at pege den mod.

Hele udrulningen, inklusive cutover og tilbagerulning, står i
[`docs/produktion.md`](docs/produktion.md).

## Konventioner

- **Danske navne bevares eksakt.** `kanaler` som tabelnavn, og dataværdier som
  `"Den Åbne Kanal"`, `"Ballade"`, `"Brøndby IF"`, `"Øl"`, `"Lille"` skrives
  ordret og oversættes aldrig.
- **Feltnavne matcher det gamle repo** (`channelId`, `activeChannelId`,
  `joinedChannelIds`, `createdAt`, `timestamp`), så migreringen i en senere fase
  bliver en 1:1-mapping.
- **Console-logs bruger bracket-prefiks:** `[Setup]`, `[Convex]`, `[Schema]`,
  `[Scoreboard]`, `[UI]`, `[Admin]`.
- **Alle tidsfelter er epoch ms** (`v.number()`).
