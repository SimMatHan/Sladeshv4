# SladeshApp v4

Re-arkitektur af [SladeshApp.dk](https://sladeshapp.dk) fra Firebase/Firestore
til Convex. Nyt projekt — det gamle repo (`SimMatHan/Sladesh2.0`) bruges kun som
læse-reference og ændres ikke.

**Status: fase 1 — fundament.** Kun projektopsætning og datamodel. Ingen UI,
ingen forretningslogik, ingen datamigrering endnu.

## Kom i gang

```bash
npm install        # SKAL køres først — se nedenfor
npx convex dev     # opretter/forbinder Convex-projektet og skriver .env.local
npm run dev
```

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
| `npm run check` | `tsc --noEmit` for både frontend og Convex-funktioner |
| `npm run lint` | oxlint |

## Struktur

```
convex/
  schema.ts       Datamodellen — 8 tabeller
  scoreboard.ts   Scoreboard som live query (IKKE en tabel)
  constants.ts    Forretningskonstanter overtaget fra det gamle repo
  _generated/     Genereret af `npx convex dev` — skal committes
docs/
  eksisterende-datamodel.md   Kortlægning af den gamle Firestore-model
src/              Frontend-skal med ConvexProvider
```

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
