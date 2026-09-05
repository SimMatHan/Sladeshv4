# Notifikationer (Web Push)

Denne fil beskriver, hvordan rigtige push-notifikationer virker i appen —
dem der når frem, selv når telefonen er låst og appen lukket — og hvad der
skal gøres for at tænde dem på et deployment.

De blev bygget som en bevidst undtagelse fra `docs/redesign-kontrakt.md`s
filgrænser (se kontraktens afsnit 1): funktionen kræver en ny tabel i
schemaet, nye Convex-funktioner, en ændring i service workeren, og én ny
npm-pakke. Det var et eksplicit, efterspurgt skifte i scope — ikke noget et
UI-redesign skal kunne gøre af sig selv.

---

## 1. Hvad der faktisk sender en notifikation i dag

Syv. Seks af dem udløses af, at nogen GØR noget; den syvende af, at der ikke
sker noget.

| # | Hvad udløser den | Hvor | Hvem får den | Tag |
|---|---|---|---|---|
| 1 | En ny chatbesked | `messages.ts`, `sendMessage` | Kanalens medlemmer, minus afsenderen, minus dem der har chatten åben lige nu (`activeChatChannelId`) | `chat-<kanal>` |
| 2 | En ny broadcast | `broadcasts.ts`, `opretBroadcast` | Kanalens medlemmer — eller alle, hvis broadcasten er global | `broadcast` |
| 3 | Aftenens FØRSTE genstand, eller et Check In | `kanaler.ts`, `varslingUdeIAften` | Resten af Kanalen | `ude-<kanal>-<person>` |
| 4 | En Sladesh sendes | `sladesh.ts`, `sendSladesh` | Kun modtageren | `sladesh-<id>` |
| 5 | En Sladesh afgøres | `sladesh.ts`, `varslAfsender` | Kun afsenderen | `sladesh-<id>` |
| 6 | Beacon-evaluering (hvert 5. min) | `beacons.ts`, `evaluerAlleBeacons` | Indcheckede inden for radius, som ikke allerede er varslet for den beacon | `beacon-<id>` |
| 7 | Fredag og lørdag kl. 20 | `paamindelser.ts`, `mindOmAtLogge` | Alle, der IKKE er ude endnu i aften | `paamindelse` |

Nummer 3 har to veje ind i samme tilstand — aftenens første genstand
(`drinkLogs.ts`) og et manuelt Check In på kortet (`checkIns.ts`) — og begge
kalder `varslingUdeIAften`, så teksten og reglen kun findes ét sted.

### Den syvende er anderledes

De seks første er reaktioner. Nummer 7 er den eneste, der findes for dem, der
ikke har åbnet appen, og den er derfor også den eneste, der har brug for
**et klokkeslæt** og **en spærre mod at sende to gange**.

- **Klokkeslættet.** Convex-crons regnes i UTC, og kl. 20 dansk tid er 18:00
  UTC om sommeren og 19:00 om vinteren. Cron'en kører derfor hver time på
  minut 0, og `erPaamindelsestid` i `paamindelseRules.ts` afgør, om timen er
  den rigtige — regnet i dansk tid med den samme `lokalDele`, som resten af
  appens døgngrænser bruger. De 22 kørsler i døgnet, der ikke rammer,
  returnerer uden at røre databasen.
- **Spærren.** `users.sidstePaamindelse` gemmer drikkedagens start for den
  seneste påmindelse. Fredag og lørdag kl. 20 ligger i hver sin drikkedag
  (10:00 → 10:00), så de to skelnes af sig selv. Afløser det gamle repos
  `lastUsageReminderAt` + `lastUsageReminderSlot`, som var to felter om det
  samme.
- **Hvem der slipper.** `erUdeIDag` er appens ene definition af "med i
  aften", og påmindelsen genbruger den frem for at spørge om logrækker for
  sig. Det betyder, at også den, der har checket ind på kortet uden at logge
  endnu, slipper — hun sidder allerede i appen.

Reglerne er rene funktioner netop fordi tiden er det, der kan gå galt: de
femten prøver i `scripts/logic-test.ts` kører den samme fredag kl. 20 på
begge sider af sommertidsskiftet.

**Bevidst stadig udeladt:** achievement-oplåsning. Den har allerede en
tilstand i appen, der viser den, mens man kigger (fejringen fra
`AchievementOplaasning.tsx`), og en oplåsning sker altid, mens man selv står
med telefonen — push ville aldrig nå frem på et tidspunkt, hvor den kunne
fortælle én noget nyt.

---

## 2. Arkitekturen

```
Browser                          Convex                        Push-tjenesten
--------                         ------                        --------------
Indstillinger.tsx
  "Slå notifikationer til"
  → Notification.requestPermission()
  → registration.pushManager
      .subscribe({ applicationServerKey })  ◄── pushAbonnementer.getVapidPublicKey
  → pushAbonnementer.gemAbonnement()  ────────► pushAbonnementer (tabel)


sendMessage / opretBroadcast  ──────────────►  ctx.scheduler.runAfter(0, …)
                                                      │
                                                      ▼
                                                convex/push.ts
                                                "use node"-action
                                                webpush.sendNotification()  ──►  endpoint
                                                                                     │
sw-skabelon.js                                                                      │
  self.addEventListener("push", …)  ◄─────────────────────────────────────────────┘
  → self.registration.showNotification()
```

**Hvorfor en "use node"-action.** Kryptering af selve beskeden (RFC 8291) og
JWT-signering af VAPID-headeren (RFC 8292) kræver Node'ens `crypto`-modul.
Convex' almindelige runtime er et V8-isolat, ikke Node, og har det ikke.
`convex/push.ts` starter derfor med `"use node"` — den eneste fil i
backend'en, der gør det.

**Hvorfor `web-push` er den ene nye afhængighed.** Håndrullet Web
Push-kryptografi (ECDH-nøgleudveksling, HKDF, aes128gcm) er der intet
korrekturlæst i denne app, og en fejl i den slags fejler stille — beskeden
leveres bare aldrig, uden et fejlsignal nogen ser. `web-push` er
standardbiblioteket til præcis dette. Den lever KUN i `convex/push.ts` og
bliver aldrig bundlet til klienten — samme kategori som `firebase-admin`,
der allerede er en Node-only afhængighed i dette repo, ikke en ny slags
undtagelse.

**Hvorfor den offentlige nøgle ikke er en `VITE_`-variabel.** Den udleveres
via `pushAbonnementer.getVapidPublicKey` i stedet. To grunde: nøgleparret kan
roteres ved kun at ændre en Convex-deploymentvariabel, uden en ny
frontend-bygning — og klienten har garanteret den nøgle, serveren rent
faktisk signerer med, i stedet for to kopier der kan komme ud af sync.

**Hvorfor abonnementer gemmes med `endpoint` som nøgle, ikke `userId`.** Én
bruger kan have flere enheder (telefon, bærbar); hver har sit eget
`endpoint`. Se `convex/schema.ts` for tabellen.

---

## 3. Sådan kobler du en ny hændelse på

1. Find mutation'en, der opretter hændelsen.
2. Efter den er skrevet til databasen (aldrig før — hændelsen skal stå,
   uanset om push lykkes), byg listen af modtager-id'er.
3. `await ctx.scheduler.runAfter(0, internal.push.sendTilBrugere, { userIds, title, body, tag })`.

`tag` er valgfri, men bør sættes til noget stabilt for kilden (`"chat-<id>"`,
`"broadcast"`) — en ny notifikation med samme tag ERSTATTER den forrige på
telefonen i stedet for at lægge sig oveni, så en telefon der har været væk
længe ikke ender med ti pip på én gang.

**Planlagt, aldrig afventet.** `ctx.scheduler.runAfter(0, …)` returnerer med
det samme; selve afsendelsen sker efter mutationen er færdig og committed.
En mutation kan ikke kalde en action og vente på svaret, og skal heller
ikke — hændelsen (beskeden, broadcasten) er allerede sket, uanset om nogens
telefon får et pip om det.

---

## 4. Opsætning på et deployment

Uden VAPID-nøglesættet returnerer `getVapidPublicKey` en tom streng,
`Indstillinger.tsx` viser "Notifikationer er ikke sat op på serveren
endnu", og `convex/push.ts` springer stille over. Appen fungerer helt fint
uden — det er den samme "fail closed, ikke fail loud"-holdning som resten
af appen.

### Generér nøgleparret

Kør dette **selv, lokalt** — nøglerne må ikke stå i en chatlog, en commit
-besked eller nogen anden delt tekst, for den private halvdel er en rigtig
hemmelighed:

```bash
npx web-push generate-vapid-keys
```

Det giver et offentligt og et privat nøglepar (begge URL-safe base64).

### Sæt dem på deploymentet

Som alle andre deployment-variabler (se `docs/produktion.md`) sættes de
PER DEPLOYMENT — dev og produktion deler ingenting:

```bash
# Dev (BEMÆRK: uden --prod)
npx convex env set VAPID_PUBLIC_KEY "<den offentlige nøgle>"
npx convex env set VAPID_PRIVATE_KEY "<den private nøgle>"
npx convex env set VAPID_SUBJECT "mailto:kontakt@sladesh.app"

# Produktion
npx convex env set --prod VAPID_PUBLIC_KEY "<den offentlige nøgle>"
npx convex env set --prod VAPID_PRIVATE_KEY "<den private nøgle>"
npx convex env set --prod VAPID_SUBJECT "mailto:kontakt@sladesh.app"
```

`VAPID_SUBJECT` skal være enten `mailto:` eller en `https://`-URL — det er
push-tjenesternes kontaktpunkt, hvis de har brug for at nå den, der sender.
Uden den bruges en indbygget standardværdi i `convex/push.ts`, men den bør
sættes til noget rigtigt før produktion.

### Test

1. Sæt nøglerne på DEV.
2. Åbn appen, gå til Indstillinger, tryk "Slå notifikationer til" — giv
   tilladelse i browserens dialog.
3. Send en besked i chatten fra en ANDEN bruger (eller et andet vindue), og
   luk fanen/lås telefonen. Notifikationen skal komme, selv med appen lukket.
4. Tjek Convex-logs (`npx convex logs`) for `[Push] sendt` — den viser
   antal modtagere og hvor mange der fejlede.

---

## 5. Kendte begrænsninger

- **iPhone/Safari:** Web Push virker kun, når appen er "Føjet til
  hjemmeskærmen" — en almindelig Safari-fane har intet `PushManager`, uanset
  hvad koden gør. `src/lib/push.ts`s `pushStoettet()` kan ikke skelne dette
  fra "understøttes slet ikke"; den melder kun, om API'et findes i den
  kontekst, appen kører i lige nu.
- **Nej tak er permanent** i browserens øjne: siger man nej til
  tilladelsen, kan appen ikke spørge igen. Brugeren skal selv nulstille den
  i browserens side-indstillinger.
- **Døde abonnementer rydder sig selv.** Svarer push-tjenesten 404 eller
  410 (afinstalleret, browserdata ryddet), sletter `convex/push.ts` rækken.
  Andre fejl (midlertidigt udfald) rører ikke abonnementet.

---

## 6. Selvtjek ved ændringer her

- [ ] Nye hændelser sender EFTER deres data er skrevet, aldrig før
- [ ] `ctx.scheduler.runAfter`, aldrig et direkte action-kald fra en mutation
- [ ] `tag` sat til noget stabilt, hvis hændelsen kan gentages tit
- [ ] `web-push` importeres kun i filer med `"use node"` — aldrig noget der
      kan ende i klientbundlet
- [ ] Ingen nøgle, hverken offentlig eller privat, hardkodet i kildekoden
