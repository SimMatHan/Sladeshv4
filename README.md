# SladeshApp v4

Re-arkitektur af [SladeshApp.dk](https://sladeshapp.dk) fra Firebase/Firestore
til Convex. Nyt projekt — det gamle repo (`SimMatHan/Sladesh2.0`) bruges kun som
læse-reference og ændres ikke.

**Status: fase 3 — autentificering.** Datamodel, kernefunktioner og login er
på plads. Ingen rigtig app-UI, ingen datamigrering endnu.

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
| `npm run test:logic` | Rene forretningsregler (stræk, point, drikkedag) — kræver intet deployment |
| `npm run smoke-test` | Fuld vej mod dev-deploymentet, autentificeret. Opretter selv sine testkonti |
| `npm run lint` | oxlint |

## Struktur

```
convex/
  schema.ts       Datamodellen — 8 tabeller
  auth.config.ts  Convex accepterer JWT'er fra Firebase Authentication
  identity.ts     getCurrentUser + adgangskontrol-hjælpere
  users.ts kanaler.ts checkIns.ts drinkLogs.ts   Kernemutations og -queries
  scoreboard.ts   Scoreboard som live query (IKKE en tabel)
  sladesh.ts      Opslag af aktiv Sladesh-udfordring
  streaks.ts      Stræk- og pointregler (rene funktioner)
  constants.ts    Forretningskonstanter overtaget fra det gamle repo
  _generated/     Genereret af `npx convex dev` — skal committes
docs/
  eksisterende-datamodel.md   Kortlægning af den gamle Firestore-model
scripts/
  logic-test.ts   Forretningsregler, kører lokalt
  smoke-test.ts   Ende-til-ende mod dev-deploymentet
src/              Login-skal: Firebase Auth + ConvexProviderWithAuth
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
argumenter. `users.authId` = tokenets `sub` = Firebase UID. Når data engang
migreres, skal `authId` sættes til brugerens eksisterende Firebase UID, så
login matcher automatisk.

## Konventioner

- **Danske navne bevares eksakt.** `kanaler` som tabelnavn, og dataværdier som
  `"Den Åbne Kanal"`, `"Ballade"`, `"Brøndby IF"`, `"Øl"`, `"Lille"` skrives
  ordret og oversættes aldrig.
- **Feltnavne matcher det gamle repo** (`channelId`, `activeChannelId`,
  `joinedChannelIds`, `createdAt`, `timestamp`), så migreringen i en senere fase
  bliver en 1:1-mapping.
- **Console-logs bruger bracket-prefiks:** `[Setup]`, `[Convex]`, `[Schema]`,
  `[Scoreboard]`.
- **Alle tidsfelter er epoch ms** (`v.number()`).
