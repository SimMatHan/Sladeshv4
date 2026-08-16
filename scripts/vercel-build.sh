#!/bin/sh
#
# Byggekommandoen Vercel kører. Peget på fra vercel.json.
#
# Den findes, fordi der er to slags builds, og de skal ikke gøre det samme:
#
#   PRODUKTION — CONVEX_DEPLOY_KEY er sat i Vercels miljø.
#     `npx convex deploy` pusher backenden (schema, funktioner, crons) til
#     produktions-deploymentet OG sætter VITE_CONVEX_URL for det indre
#     byggetrin. Frontend og backend kommer derfor altid fra samme commit —
#     det er hele pointen i at lade Convex køre buildet.
#
#   PREVIEW / lokalt — ingen deploy-nøgle.
#     Der pushes ingenting. Frontenden bygges mod den VITE_CONVEX_URL der
#     allerede står i miljøet (typisk dev-deploymentet). En preview-build må
#     ALDRIG kunne skrive til produktionens backend.
#
# Nøglen styrer altså hvilken gren der køres, og den sættes i Vercel kun for
# miljøet "Production". Se docs/produktion.md.

set -e

if [ -n "$CONVEX_DEPLOY_KEY" ]; then
  echo "[Build] CONVEX_DEPLOY_KEY fundet — deployer Convex-backenden og bygger"
  # --cmd-url-env-var-name sættes udtrykkeligt. Convex kan selv gætte den ud
  # fra frameworket, men et gæt der rammer forkert giver en frontend uden
  # VITE_CONVEX_URL — og den fejl viser sig først i browseren.
  exec npx convex deploy \
    --cmd-url-env-var-name VITE_CONVEX_URL \
    --cmd 'npm run build'
fi

echo "[Build] ingen CONVEX_DEPLOY_KEY — bygger kun frontenden"
echo "[Build] VITE_CONVEX_URL skal pege på det deployment denne build skal bruge"
exec npm run build
