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

# ---------------------------------------------------------------------------
# Forhåndstjek: er Firebase-konfigurationen der overhovedet?
#
# Vite indlejrer `import.meta.env.VITE_*` i bundlet på BYGGETIDSPUNKTET. En
# variabel der ikke er sat, bliver til `undefined` — og `initializeApp`
# accepterer glad seks undefined-værdier. Resultatet er et build der udrulles
# uden en eneste fejl, og som først går i stykker i brugerens browser med
# `auth/invalid-api-key`.
#
# Det skete i praksis ved første produktionsudrulning. Buildet skal fejle her
# i stedet, hvor beskeden kan sige hvad der mangler.
#
# Kun NAVNE skrives ud, aldrig værdier. De ender ganske vist i bundlet og er
# dermed offentlige, men en byggelog er stadig ikke stedet at gengive dem.
# ---------------------------------------------------------------------------
manglende=""
for navn in \
  VITE_FIREBASE_API_KEY \
  VITE_FIREBASE_AUTH_DOMAIN \
  VITE_FIREBASE_PROJECT_ID \
  VITE_FIREBASE_STORAGE_BUCKET \
  VITE_FIREBASE_MESSAGING_SENDER_ID \
  VITE_FIREBASE_APP_ID
do
  # Indirekte opslag, POSIX-kompatibelt: `eval` er den eneste vej til at slå
  # en variabel op ud fra dens navn i /bin/sh.
  eval "vaerdi=\${$navn:-}"
  if [ -z "$vaerdi" ]; then
    manglende="$manglende $navn"
  fi
done

if [ -n "$manglende" ]; then
  echo "[Build] AFBRUDT — Firebase-konfigurationen mangler i byggemiljøet."
  echo "[Build] Uden dem bygger Vite en app hvor login er dødt fra start."
  echo ""
  echo "[Build] Ikke sat:"
  for navn in $manglende; do
    echo "[Build]   $navn"
  done
  echo ""
  echo "[Build] I Vercel: Settings -> Environment Variables. De skal gælde for"
  echo "[Build] det miljø denne build kører i, og de må IKKE være markeret"
  echo "[Build] Sensitive — de indlejres alligevel i klient-bundlet og er"
  echo "[Build] dermed offentlige, så flaget beskytter ingenting."
  exit 1
fi

echo "[Build] Firebase-konfiguration fundet (6 variabler)"

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
