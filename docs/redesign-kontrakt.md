# Kontrakt for redesign af UI

Denne fil er skrevet til et værktøj, der skal lave appens UI om — og til
mennesker, der skal vurdere resultatet bagefter.

Baggrunden er, at appen netop er migreret fra Firebase til Convex. Alt
forretningslogik ligger nu på serveren i `convex/`, og hele frontenden er ren
præsentation. Det gør et redesign billigt: skærmene kan skiftes ud, uden at
noget går i stykker — så længe reglerne herunder holdes.

---

## 1. Hvad der må ændres

**Må ændres frit:**

- `src/ui/**` — alle komponenter
- `src/index.css` — al styling
- `index.html` — kun `<title>`, meta-farver og skrifttyper

**Må IKKE ændres. Ikke i nogen form, heller ikke "kun lige":**

| Sti | Hvorfor |
|---|---|
| `convex/**` | Schemaet og funktionerne. 32 migrerede brugeres data ligger i dette schema |
| `src/contexts/AuthContext.tsx` | Firebase Auth-flowet |
| `src/hooks/useFirebaseAuthForConvex.ts` | Broen Firebase-token → Convex. Svær at fejlsøge, nem at bryde |
| `src/lib/**` | Optimistiske opdateringer, snapshot-cache, service worker, visning |
| `src/main.tsx` | Opsætningen af Convex-klienten |
| `scripts/**` | Migrering, datarevision, katalog, smoke-test |
| `package.json` | Se afsnit 2 |

**Ændres en fil på forbudslisten, er leverancen forkert** — også selvom
resultatet ser rigtigt ud i browseren.

**Bevidst undtagelse:** rigtige push-notifikationer (2026) krævede at bryde
denne grænse — en ny tabel i schemaet, nye Convex-funktioner, service
workerens `push`-handler, og npm-pakken `web-push` (kun i en Convex
"use node"-action, aldrig i klientbundlet). Det var et eksplicit,
efterspurgt skifte i scope, ikke en glidning under et redesign — se
docs/notifikationer.md. Grænserne herover gælder fortsat for alt andet.

**Bevidst undtagelse 2:** størrelserne (Lille · Mellem · Stor) er fjernet
fra logningen efter eksplicit ønske. Én genstand tæller én. Det krævede
`convex/constants.ts` og `convex/drinkLogs.ts`, fordi størrelsen var en
del af MODELLEN og ikke af skærmen — den blev ganget på både point,
stilling og promille.

Det er gjort på den ene måde, der ikke rører de 32 migrerede brugeres
data: `sizeMultiplier` gemmes på hver enkelt logrække og læses derfra ved
optælling, ikke slås op i en tabel. Nye logninger skriver ingen
størrelsesfelter; gamle rækker bliver ved med at tælle med deres egen
vægt. **Der er ingen migrering, og ingen historiske tal ændrer sig.**
Felterne i `schema.ts` er derfor bevaret — de skal stadig kunne læses, og
`removeDrink` bruger stadig en negativ `sizeMultiplier` som fortegn på
sin modpost.

**Bevidst undtagelse 3:** kortets fliser er skiftet fra OpenStreetMaps
egne til CARTOs gråtone-basemaps, så kortet følger appens tema. Det
krævede én linje i `scripts/sw-skabelon.js`, som cacher fliser på
VÆRTSNAVN. Uden den ville fliserne falde igennem til "alt andet udefra"
og holde op med at blive gemt — og et kort i en kælder ville blive tomt
igen. Ingen anden logik i service workeren er rørt.

---

## 2. Afhængigheder

Appen kører i dag på **fem** runtime-afhængigheder: `convex`, `firebase`,
`leaflet`, `react`, `react-dom`.

Det er et bevidst valg, ikke en mangel. Den tidligere udgave af denne app
havde omkring halvtreds, heraf tredive Radix-pakker, og migrationen fjernede
dem.

**Tilføj ingen npm-pakker.** Ingen komponentbibliotek, ingen
CSS-framework, ingen animationsbibliotek, ingen ikonpakke, ingen router.
Alt kan laves med CSS og React alene, og det er sådan appen er bygget i dag.

Ikoner: brug emoji eller inline SVG, som appen allerede gør.

---

## 3. Styling

Styling er ren CSS i `src/index.css` med semantiske klassenavne på dansk
(`.skal`, `.kort`, `.knap`, `.raekke`, `.ark`). Ingen utility-klasser.

Farver, radier og mål ligger som CSS-variabler i `:root`, ét sted, netop så
appen kan omtemaes uden at røre en komponent. **Brug variablerne — skriv
aldrig en farve direkte i en komponent.** Tilføj gerne nye variabler.

```css
--bund: #0e0f13;            /* sideflade */
--flade: #17191f;           /* kort og felter */
--flade-hvaelvet: #1f222a;  /* hævet flade */
--kant: #2a2e38;

--tekst: #f2f3f5;
--tekst-daempet: #9ba1ad;
--tekst-svag: #6b7280;

--accent: #f59e0b;          /* ravgul — appens signaturfarve */
--accent-mork: #d97706;
--accent-tekst: #1a1206;

--fare: #ef4444;
--medgang: #34d399;
--guld: #fbbf24;
--soelv: #cbd5e1;
--bronze: #d08c60;

--radius: 14px;
--radius-lille: 9px;
--navhoejde: 64px;
--bund-sikker: env(safe-area-inset-bottom, 0px);
--top-sikker: env(safe-area-inset-top, 0px);
```

Der findes et lyst tema under `@media (prefers-color-scheme: light)`. Det skal
blive ved med at virke.

**Mørk er udgangspunktet med vilje:** appen bruges om aftenen, i en bar, på en
telefon, ofte af nogen der har fået et par stykker. Kontrast og
trykflade-størrelse er ikke pynt her.

---

## 4. Navigation

Der er **ingen router**, og der skal ikke være en. To faner og seks ark er
tilstand, ikke adresser.

```
[ Kanal ]        ( + )        [ Mig ]
   │                             │
   ├ Stilling                    ├ Indstillinger
   ├ Chat                        ├ Trofæhylden      (ark)
   ├ Kort                        └ Admin            (ark, kun admins)
   └ Historik
```

`( + )` åbner log-arket fra hvor som helst. Kanalvælgeren, personkortet og
Sladesh-overtagelsen er også ark. Ét arkmønster, man lærer én gang:
lukkes ved tryk ved siden af, på krydset, eller med Escape.

Strukturen må gerne forbedres visuelt. Den må ikke laves om til ruter.

---

## 5. Sprog

Appen er dansk, og en række navne er **kanoniske** — de er data, ikke
oversættelig UI-tekst. Skriv dem ordret:

> Kanal · Ballade · Brøndby IF · Den Åbne Kanal · Check In · Sladesh ·
> Stilling · Øl · Cider · Vin · Cocktails · Shots · Andet ·
> Lille · Mellem · Stor

Al brugervendt tekst er på dansk. Komponentnavne og CSS-klasser er også på
dansk — følg det mønster.

Console-logs bruger bracket-præfiks: `[UI]`, `[Admin]`, `[Setup]`, `[Convex]`.

---

## 6. Data

**Opfind aldrig et endpoint.** Frontenden må kun kalde funktionerne herunder,
med præcis disse navne og argumenter. Mangler der noget til en skærm, du vil
bygge — så byg ikke skærmen, og skriv det i stedet i leverancen.

Mønsteret er altid:

```tsx
const data = useQuery(api.modul.funktion, { ...args });   // undefined = henter
const gør = useMutation(api.modul.funktion);
```

`useQuery` returnerer `undefined`, mens den henter — vis en hentetilstand, ikke
et tomt skelet der ligner data. Mutations kaster `ConvexError`; brug
`fejltekst()` fra `src/lib/visning.ts` til at vise fejlen — beskederne er
allerede skrevet på dansk til et menneske.

🔒 = kræver admin. Serveren håndhæver det; at skjule knappen er kosmetik.


### `achievements`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `getDefinitions` | query | `—` | |
| `getAchievementsForUser` | query | `userId: v.optional(v.id("users")), now: v.optional(v.number())` | |
| `getNaesteMilepael` | query | `now: v.optional(v.number())` |  ⚠️ INGEN UI I DAG |
| `tildelManuelt` | mutation | `userId: v.id("users"), achievementId: v.string()` | 🔒admin |
| `genberegnForBruger` | mutation | `userId: v.id("users"), now: v.optional(v.number())` | 🔒admin |

### `admin`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `nulstilRunForBruger` | mutation | `userId: v.id("users")` | 🔒admin |
| `nulstilSladeshForBruger` | mutation | `userId: v.id("users")` | 🔒admin |
| `nulstilAchievementsForBruger` | mutation | `userId: v.id("users")` | 🔒admin |
| `setAdmin` | mutation | `userId: v.id("users"), isAdmin: v.boolean()` | 🔒admin |

### `beacons`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `opretBeacon` | mutation | `lat: v.number(), lng: v.number(), title: v.optional(v.string()), venue: v.optional(v.string()), message: v.optional(v.string()), radius: v.optional(v.number()), channelId: v.optional(v.id("kanaler"))` | 🔒admin |
| `getBeacons` | query | `channelId: v.optional(v.id("kanaler"))` | |
| `deaktiverBeacon` | mutation | `beaconId: v.id("beacons")` | 🔒admin |

### `broadcasts`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `opretBroadcast` | mutation | `title: v.string(), body: v.string(), channelId: v.optional(v.id("kanaler")), timer: v.optional(v.number())` | 🔒admin |
| `getMineBroadcasts` | query | `now: v.optional(v.number())` | |
| `getAlleBroadcasts` | query | `limit: v.optional(v.number())` | 🔒admin |
| `deaktiverBroadcast` | mutation | `broadcastId: v.id("broadcasts")` | 🔒admin |

### `checkIns`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `checkIn` | mutation | `venue: v.string(), channelId: v.optional(v.id("kanaler")), location: v.optional(v.object({ lat: v.number(), lng: v.number() }))` | UI i Kort.tsx (kun `venue`+`channelId` bruges — `location` sendes af Kortets egen GPS-loop) |
| `checkOut` | mutation | `—` | UI i Kort.tsx |
| `getCheckInsForUser` | query | `userId: v.optional(v.id("users")), limit: v.optional(v.number())` |  ⚠️ INGEN UI I DAG |

### `donations`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `opretDonation` | mutation | `userId: v.id("users"), amount: v.number(), message: v.optional(v.string()), date: v.optional(v.number())` | 🔒admin |
| `getDonorer` | query | `limit: v.optional(v.number())` | |
| `sletDonation` | mutation | `donationId: v.id("donations")` | 🔒admin |

### `drinkLogs`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `logDrink` | mutation | `categoryId: v.string(), variationName: v.string(), channelId: v.optional(v.id("kanaler")), sizeId: v.optional(v.string()), location: v.optional(v.object({ lat: v.number(), lng: v.number() }))` | |
| `removeDrink` | mutation | `logId: v.id("drinkLogs"), now: v.optional(v.number())` | |
| `resetRun` | mutation | `channelId: v.optional(v.id("kanaler"))` | |
| `getDrinkLogsForUser` | query | `userId: v.optional(v.id("users")), limit: v.optional(v.number())` | |

### `drinkVariations`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `getDrinkVariations` | query | `categoryId: v.optional(v.string())` | |
| `opretVariant` | mutation | `name: v.string(), categoryId: v.string(), description: v.optional(v.string())` | 🔒admin |
| `opdaterVariant` | mutation | `variationId: v.id("drinkVariations"), name: v.optional(v.string()), categoryId: v.optional(v.string()), description: v.optional(v.union(v.string(), v.null()))` | 🔒admin |
| `sletVariant` | mutation | `variationId: v.id("drinkVariations")` | 🔒admin |

### `historik`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `getKanalHistorik` | query | `channelId: v.id("kanaler"), dage: v.optional(v.number()), now: v.optional(v.number())` | |
| `getKanalDag` | query | `channelId: v.id("kanaler"), dayStart: v.number()` | |

### `indstillinger`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `getBalladeTema` | query | `—` | |
| `setBalladeTema` | mutation | `tema: v.string()` | 🔒admin |

### `kanaler`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `createKanal` | mutation | `name: v.string(), code: v.string(), description: v.optional(v.string())` | |
| `joinKanal` | mutation | `code: v.string()` | |
| `getKanal` | query | `channelId: v.id("kanaler")` | |
| `getMineKanaler` | query | `—` | |
| `getKanalByCode` | query | `code: v.string()` |  ⚠️ INGEN UI I DAG |
| `getAlleKanaler` | query | `inkluderArkiverede: v.optional(v.boolean())` | 🔒admin |
| `arkiverKanal` | mutation | `channelId: v.id("kanaler")` | 🔒admin |
| `genaktiverKanal` | mutation | `channelId: v.id("kanaler")` | 🔒admin |

### `kort`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `getKanalPositioner` | query | `channelId: v.id("kanaler"), now: v.optional(v.number())` | |

### `messages`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `sendMessage` | mutation | `channelId: v.id("kanaler"), text: v.string()` | |
| `getMessages` | query | `channelId: v.id("kanaler"), limit: v.optional(v.number())` | |
| `markerLaest` | mutation | `channelId: v.id("kanaler"), now: v.optional(v.number())` | |
| `getUlaeste` | query | `—` | |
| `setAktivChat` | mutation | `channelId: v.optional(v.id("kanaler"))` | |
| `getVarslingsmodtagere` | query | `messageId: v.id("messages")` |  ⚠️ INGEN UI I DAG |

### `promille`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `getMinPromille` | query | `now: v.optional(v.number())` | |
| `setPromilleIndstilling` | mutation | `enabled: v.boolean(), gender: v.optional(, weight: v.optional(v.union(v.number(), v.null())), height: v.optional(v.union(v.number(), v.null()))` | |

### `pushAbonnementer`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `getVapidPublicKey` | query | `—` | tom streng = ikke sat op på deploymentet endnu |
| `gemAbonnement` | mutation | `endpoint: v.string(), p256dh: v.string(), auth: v.string()` | |
| `sletAbonnement` | mutation | `endpoint: v.string()` | |

### `scoreboard`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `getScoreboard` | query | `channelId: v.id("kanaler"), now: v.optional(v.number())` | |

### `sladesh`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `getActiveSladeshForUser` | query | `userId: v.optional(v.id("users"))` | |
| `hasActiveSladesh` | query | `userId: v.optional(v.id("users"))` | |
| `getCooldown` | query | `now: v.optional(v.number())` | |
| `sendSladesh` | mutation | `recipientId: v.id("users"), idempotencyKey: v.string(), channelId: v.optional(v.id("kanaler")), venue: v.optional(v.string()), location: v.optional(v.object({ lat: v.number(), lng: v.number() })), now: v.optional(v.number())` | |
| `genererUploadUrl` | mutation | `—` | |
| `getBevisUrl` | query | `storageId: v.id("_storage")` |  ⚠️ INGEN UI I DAG |
| `registrerBevis` | mutation | `challengeId: v.id("sladeshChallenges"), storageId: v.optional(v.id("_storage")), now: v.optional(v.number())` | |
| `afslutSladesh` | mutation | `challengeId: v.id("sladeshChallenges"), now: v.optional(v.number())` | |
| `opgivSladesh` | mutation | `challengeId: v.id("sladeshChallenges"), now: v.optional(v.number())` | |

### `stats`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `getAdminStats` | query | `now: v.optional(v.number())` | 🔒admin |

### `users`

| Funktion | Type | Argumenter | Note |
|---|---|---|---|
| `createUser` | mutation | `displayName: v.optional(v.string()), fullName: v.optional(v.string()), photoURL: v.optional(v.string()), emoji: v.optional(v.string()), avatarColor: v.optional(v.string()), profileEmoji: v.optional(v.string()), profileGradient: v.optional(v.string())` | |
| `setActiveChannel` | mutation | `channelId: v.id("kanaler")` | |
| `opdaterProfil` | mutation | `displayName: v.optional(v.string()), fullName: v.optional(v.union(v.string(), v.null())), photoURL: v.optional(v.union(v.string(), v.null())), emoji: v.optional(v.union(v.string(), v.null())), avatarColor: v.optional(v.union(v.string(), v.null())), profileEmoji: v.optional(v.union(v.string(), v.null())), profileGradient: v.optional(v.union(v.string(), v.null())), onboardingCompleted: v.optional(v.boolean())` | |
| `opdaterPosition` | mutation | `lat: v.number(), lng: v.number()` | |
| `getMe` | query | `—` | |
| `hasProfile` | query | `—` |  ⚠️ INGEN UI I DAG |
| `getUser` | query | `userId: v.id("users")` | |
| `searchUsers` | query | `soegning: v.optional(v.string()), limit: v.optional(v.number())` | 🔒admin |

---

## 7. Tre ting der ikke må gå tabt

Migrationen rettede fejl, som et redesign nemt kan genindføre.

**Fortryd står i kvitteringen, ikke i en logbog.** Når man logger en genstand,
lukker arket med det samme, stillingen flytter sig optimistisk, og en
kvittering med **Fortryd** står i seks sekunder. Det er sekunderne lige efter
et fejltryk, man vil af med den igen. Flyt ikke Fortryd ind i en historik.

**Appen skal virke på dårlig forbindelse.** Den bruges i kældre og til
festivaler. Log-arket og profilen males fra sidste besøg via
`useCachetQuery`, og logninger sendes optimistisk. Fjern ikke de mønstre —
uden dem trykker folk på en knap, der ikke gør noget, og trykker igen.

**Vis intet, du ikke ved.** Promille vises kun, når vægt og køn er udfyldt —
ellers står der hvorfor. Den tidligere admin-oversigt viste hårdkodede tal
under en kommentar om, at de "would come from Firestore in production". En
skærm, der lyver, er værre end ingen skærm.

---

## 8. Hvad "færdigt" betyder

```
npm run check     # tre tsconfigs, skal være grøn
npm run lint      # ingen nye advarsler
npm run build
```

Og på en telefonbredde: ingen vandret scroll, trykflader mindst 44 px,
tastaturet må ikke dække skriveren i chatten.

`npm run dev` kræver et Convex-deployment og `.env.local`. Uden
`VITE_CONVEX_URL` bygger `vite build` en tom skal — `main.tsx` kaster ved
manglende variabel, og minifieren fjerner hele app-træet som dødt kode.
Bygget "lykkes" da med et bundt uden en linje app-kode i.
