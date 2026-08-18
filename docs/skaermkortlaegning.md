# Skærmkortlægning — hvad den gamle app består af

Fase 10. Kortlægning af `SimMatHan/Sladesh2.0`, så redesignet kan tage stilling
til hver skærm frem for at opdage dem undervejs.

**20 sider, 108 komponenter, 25.526 linjer.** Denne fil er grundlaget for at
beslutte, hvad der skal med, hvad der skal laves om, og hvad der skal ud.

Kolonnen "Convex" siger, om backenden allerede kan levere skærmen. Alle huller
er samlet i afsnit 4 — de er den egentlige pointe med at lave kortlægningen
før UI'et og ikke bagefter.

---

## 1. Sådan hænger appen sammen i dag

Bundnavigation med fem faner. Midterknappen er hævet, fordi logning er det
mest brugte:

```
  Home        Sladesh      [Log]       Score        More
   /          /sladesh     /log       /score      /profile
   └ /achievements                     └ /user/:id  └ /settings
                                                    └ /support
                                                    └ /admin
                                                    └ /channels
```

Ruter uden for navigationen: `/channel-log`, `/messages`, `/receive-sladesh`,
`/map`, `/onboarding`, `/login`, `/signup`, `/splash`.

Adgang styres af tre wrappere: `ProtectedRoute`, `PublicRoute`, `AdminRoute`.

**Ni React-contexts** holder tilstanden: `Auth`, `UserData`, `Channel`,
`ChannelSwitch`, `ChannelTheme`, `DrinkLog`, `Sladesh`, `Achievement`,
`Avatar`. Det er værd at bemærke, at de fleste af dem findes for at cache og
synkronisere Firestore-læsninger. **Convex-queries er reaktive af sig selv**,
så størstedelen af det lag skal ikke bygges igen — se afsnit 3.

---

## 2. Skærm for skærm

### Kernen

#### `/` — Index (Home), 127 linjer

Forsiden. Sammensat af syv komponenter frem for at være en side i sig selv:

| Komponent | Viser |
|---|---|
| `QuickStats` | Dagens genstande, stræk, promille |
| `DrinkSelector` | Hurtig-logning af de mest brugte varianter |
| `AchievementPreview` | Nærmeste milepæl |
| `MapPreview` | Lille kortudsnit |
| `ResetButton` | Nulstil dagens run |
| `ChannelLogShortcut` | Genvej til kanalens log |

**Convex:** `scoreboard.getScoreboard`, `promille.getMinPromille`,
`achievements.getNaesteMilepael`, `drinkLogs.logDrink`, `drinkLogs.resetRun`,
`users.getMe`, `drinkVariations.getDrinkVariations`. ✅ dækket.

#### `/log` — DrinkLog, 374 linjer

Selve logningen. Et Embla-karrusel med én slide per kategori; inde i hver
kategori vælges variant og størrelse. Plus/minus per variant.

**Convex:** `drinkLogs.logDrink`, `drinkLogs.removeDrink`,
`drinkVariations.getDrinkVariations`. ✅ dækket siden trin 0.

> Minus-knappen kalder i dag `removeDrink` med kategori og variantnavn løst.
> Den nye `removeDrink` fortryder en **bestemt** logning (`logId`). Det er en
> bedre model, men UI'et skal vide hvilken række der fortrydes — fx den
> seneste af den variant. Værd at tage stilling til i designet.

#### `/score` — Score, 229 linjer

Stillingen i den aktive Kanal. Sorteret liste med avatar, navn, genstande,
stræk, promille og `SladeshBadge`. Klik på en række → `/user/:id`.

**Convex:** `scoreboard.getScoreboard` — ét kald, hele rækken. ✅

> Promillekolonnen er nu `undefined` for brugere uden vægt og køn (fase 8).
> Designet skal have en tilstand for "ikke oplyst" frem for at vise 0,0.

#### `/sladesh` — SladeshOrbit, 489 linjer

Den mest særegne skærm: kanalens medlemmer i kredsløb om en centerorb, tryk
for at sende en Sladesh. `SendModal`, `RippleEffect`, `SentSladeshesModal`.

**Convex:** `sladesh.sendSladesh`, `sladesh.getCooldown`,
`sladesh.hasActiveSladesh`, `kanaler.getKanal` (medlemmer). ✅ — mangler
"mine sendte Sladesh'er" (4.4).

#### `/receive-sladesh` — ReceiveSladesh, 372 linjer

Modtagerens flow: nedtælling fra 10 minutter, scanner-faser, bevisbilleder,
succes/fejl.

**Convex:** `sladesh.getActiveSladeshForUser`, `registrerBevis`,
`genererUploadUrl`, `getBevisUrl`, `afslutSladesh`, `opgivSladesh`. ✅ fuldt
dækket — det var fase 6.

> Bevisbilleder er nu **Convex storage**, ikke base64 i dokumentet. Upload er
> to trin: hent en engangs-URL, POST bytes, gem `storageId`.

### Kanaler og fællesskab

#### `/channels` — Channels, 265 linjer

Liste over ens Kanaler, skift aktiv Kanal, meld dig ind med kode, opret ny.

**Convex:** `kanaler.getMineKanaler`, `joinKanal`, `createKanal`,
`getKanalByCode`, `users.setActiveChannel`. ✅ — mangler favorit og udmeldelse
(4.5).

#### `/channel-log` — ChannelLog, 440 linjer

Kanalens aktivitet over tid: `ProgressChart`, `ActivityCalendar`,
`StickyDateHeader`, dag-for-dag-historik med `date-fns` på dansk.

**Convex:** ❌ **ikke dækket.** Se 4.3.

#### `/messages` — Messages, 188 linjer

Kanal-chat. Findes også som `MessagesDrawer` oven på andre skærme.

**Convex:** `messages.sendMessage`, `getMessages`, `markerLaest`,
`getUlaeste`, `setAktivChat`. ✅ fuldt dækket — fase 7.

> Convex-queries er reaktive. `subscribeToChannelMessages` har ingen modpart:
> `useQuery(api.messages.getMessages)` **er** abonnementet.

#### `/map` — LiveMap, 20 linjer

Kun en ramme om `AntigravityMap` (komponenten er stor). Viser medlemmers
positioner og aktive beacons; admins kan placere en beacon.

**Convex:** `beacons.getBeacons`, `beacons.opretBeacon`,
`users.opdaterPosition`. Delvist — mangler **andres positioner** (4.6).

### Profil og konto

#### `/profile` — Profile, 209 linjer

Egen profil: avatar, navn, tal, genveje til Settings/Support/Admin/Channels.

**Convex:** `users.getMe`, `users.opdaterProfil`. ✅

#### `/user/:userId` — UserProfile, 527 linjer

En anden brugers profil: statistik, achievements, drikkefordeling.

**Convex:** `users.getUser` (kræver delt Kanal),
`achievements.getAchievementsForUser`, `drinkLogs.getDrinkLogsForUser`. ✅

#### `/settings` — Settings, 516 linjer

Profilbillede, kontooplysninger (brugernavn, fulde navn), **promille-counter**
(til/fra, Mand/Kvinde, vægt), tema, push-notifikationer, lokationstilladelse.

**Convex:** `promille.setPromilleIndstilling`, `users.opdaterProfil`. ✅ —
bortset fra push og tema (4.7).

#### `/achievements` — Achievements, 196 linjer

Alle achievements med fremdrift, detaljemodal, oplåsningsoverlay.

**Convex:** `achievements.getAchievementsForUser`, `getDefinitions`. ✅ fuldt
dækket — fase 8.

#### `/onboarding` — Onboarding, 305 linjer

Førstegangsforløb; sætter `onboardingCompleted`.

**Convex:** `users.opdaterProfil` sætter `onboardingCompleted`. ✅

#### `/login`, `/signup`, `/splash`

Firebase Auth — email/adgangskode og Google. **Uændret.** Det var hele
pointen i at beholde Firebase Auth: ingen bruger skal oprette sig på ny.

### Resten

#### `/admin` — Admin, 89 linjer + syv underkomponenter

Overview, DevTools, Users, Channels, Drinks, Broadcasts, Donors.

**Convex:** spredt. `beacons.opretBeacon`, `achievements.tildelManuelt`,
`achievements.genberegnForBruger` og hele `drinkVariations` findes.
Broadcasts og Donors ❌ (4.7).

> Adgang styres i dag af `isAdminEmail` — en **hårdkodet liste i klientkoden**.
> Convex bruger `users.isAdmin` og `requireAdmin` på serveren. Det er en reel
> forbedring, men det betyder, at nogen skal sætte `isAdmin` på de rigtige
> brugere i produktionsdatabasen inden cutover.

#### `/support` — Support, 173 linjer

Donationer og donorliste. **Convex:** ❌ (4.7).

#### `/`-fallback — NotFound, 24 linjer

---

## 3. Contexts der IKKE skal bygges igen

Den største enkeltbesparelse i redesignet. Otte af de ni contexts findes,
fordi Firestore-læsninger skulle caches, deduplikeres og holdes i sync.

| Gammel context | Erstattes af |
|---|---|
| `UserDataContext` | `useQuery(api.users.getMe)` |
| `DrinkLogContext` | `useQuery` + `useMutation` direkte |
| `SladeshContext` | `useQuery(api.sladesh.getActiveSladeshForUser)` |
| `AchievementContext` | `useQuery(api.achievements.…)` — motoren er flyttet til serveren |
| `ChannelContext` | `useQuery(api.kanaler.getMineKanaler)` + `getMe().activeChannelId` |
| `AvatarContext` | Rene hjælpefunktioner; ingen tilstand |
| `ChannelThemeContext` | ❌ afhænger af `themeSettings` (4.7) |
| `ChannelSwitchContext` | Ren UI-animation — behold hvis effekten ønskes |
| `AuthContext` | Findes allerede i `src/contexts/AuthContext.tsx` |

Convex-queries er reaktive og deduplikeres af klienten. Et `useQuery` i to
komponenter giver ét abonnement. Det er derfor, `src/` kan blive markant
mindre end 25.500 linjer uden at appen kan mindre.

---

## 4. Huller i backenden

Det kortlægningen var til for. Ingen af dem er store, men de skal være der,
før de tilhørende skærme kan bygges.

### 4.1 Drikkevarianter — ✅ **lukket i trin 0**

`useDrinkVariations` læser rod-collectionen `/drinkVariations`: hvilke
varianter der findes i hver kategori ("Tuborg", "Carlsberg", "Vermouth
Tonic"). Den blev bevidst holdt uden for migreringen
(`docs/eksisterende-datamodel.md`, 7.6).

Uden den kan man ikke vælge hvad man drikker. **Det er det største hul**, og
det skal lukkes først: en `drinkVariations`-tabel, en query per kategori, og
en migrering af de eksisterende varianter fra Firestore.

Formen er enkel — `{ name, description, categoryId, createdAt, updatedAt }` —
så både tabel og migrering er små.

> **Navnefælde:** `drinkVariations` betyder to forskellige ting i den gamle
> app. Rod-collectionen er katalogets varianter (det, der mangler her).
> Brugerdokumentets felt af samme navn var en tæller per variant i det
> aktuelle run — den er bevidst fjernet og beregnes nu fra `drinkLogs`.
> Datarevisionen i fase 4 målte kun feltet; **rod-collectionen er aldrig
> blevet revideret**, så antallet af varianter i produktionen er ukendt.
> Det bør tælles, før migreringen skrives.

Værd at beslutte samtidig: skal varianter være globale, per Kanal, eller kan
brugere tilføje deres egne? I dag er de globale med admin-styring
(`AdminDrinks`).

> **Lukket:** tabellen `drinkVariations` med `convex/drinkVariations.ts`
> (`getDrinkVariations` til alle, `opretVariant` / `opdaterVariant` /
> `sletVariant` til admins) og en migrering, der kan køres for sig med
> `npm run migrer -- --skriv --kun-varianter`. Varianterne forbliver globale;
> spørgsmålet om Kanal-specifikke varianter er stadig åbent.

### 4.2 Redigering af egen profil — ✅ **lukket i trin 0**

Der findes ingen mutation til at ændre `displayName`, `fullName`, `emoji`,
`avatarColor`, `profileEmoji`, `profileGradient` eller `onboardingCompleted`.
`createUser` sætter dem ved oprettelsen, og så aldrig igen.

Alle felterne er i schemaet. Der mangler én `users.opdaterProfil`.

> **Lukket:** `users.opdaterProfil`. Man kan kun rette sig selv — der er
> bevidst ingen `userId`-parameter, heller ikke for admins. `undefined` rører
> ikke feltet, `null` rydder det. Visningsnavnet kan ikke ryddes (det står på
> scoreboardet og i hver logrække), og `avatarColor` skal være en af de syv
> kendte farver.

### 4.3 Kanalens aktivitetslog — **blokerer `/channel-log`**

Der findes `getDrinkLogsForUser` (én bruger) og `getScoreboard` (i dag), men
intet der giver Kanalens logninger over en periode, grupperet per dag.
Indexet `by_kanal_and_timestamp` findes allerede, så det er én query.

### 4.4 Mine sendte Sladesh'er

`SentSladeshesModal` og `SentSladeshesTracker` viser hvad man har sendt og
hvordan det gik. Indexet `by_sender_and_status` blev lavet i fase 3.5, men
queryen findes ikke.

### 4.5 Kanal-håndtering

Mangler: sæt favorit-Kanal (`favoriteChannelId` findes i schemaet), meld dig
ud af en Kanal, og admin-redigering af en Kanal.

### 4.6 Andres positioner på kortet

`users.opdaterPosition` skriver ens egen. Der mangler en query, der giver
positionerne for medlemmerne af ens Kanal — med samme forældelsesregel som
beacon-evalueringen bruger (15 minutter).

Det er også det sted, hvor et redesign bør tage stilling: **skal andre kunne
se, hvor man er?** I dag kan de. Det er den mest personfølsomme funktion i
appen.

### 4.7 Bevidst uden for afgrænsningen

Disse blev valgt fra i fase 1 og er stadig fravalgt. De skal enten bygges,
droppes eller udskydes — men det skal være et valg:

| Funktion | Skærm | Bemærkning |
|---|---|---|
| Push-levering | Notifikationer overalt | Udvælgelsen er bygget (fase 7); kanalen mangler |
| `donations` | `/support` | Donorliste og Top Donor-achievementet |
| `broadcasts` | `/admin` | Admin-beskeder til alle |
| `themeSettings` | Kanaltema | `ChannelThemeContext` afhænger af den |
| `stats` | `/admin` | Aggregeret statistik |

---

## 5. Hvad der er værd at stille spørgsmål ved

Kortlægningen har også afsløret ting, som er værd at tage stilling til frem
for at kopiere:

**To døgngrænser.** Drikkedagen starter kl. 10:00; Sladesh-cooldownen kører i
12-timers blokke fra midnat. Det er bevidst i dag, men det er svært at
forklare en bruger. Skal de være ens?

**Fem faner plus otte ruter uden for navigationen.** `/channel-log`,
`/messages` og `/map` er alle indhold, brugerne skal kunne finde — men de har
ingen fast plads. Det er et symptom på, at der er mere app end der er
navigation.

**`/profile` som "More"-fane.** Profilen er blevet en menu med genveje til fire
andre skærme. Det er sjældent den bedste plads til den.

**Admin i selve appen.** Syv underskærme, som fem procent af brugerne kan se.
Overvej et separat sted.

**Promillen er nu rigtig.** Den var en pladsholder (`genstande × 0,18`) på
scoreboardet indtil fase 8. Nu regner den efter Widmark — og viser ingenting
for brugere uden vægt og køn. Designet skal have en tom tilstand, og
formentlig en opfordring til at udfylde det.

---

## 6. Foreslået rækkefølge

**Trin 0 — luk de blokerende huller.** ✅ Gjort. 4.1 (drikkevarianter, inkl.
migrering) og 4.2 (redigér profil). Der er ikke længere noget backend-arbejde,
der spærrer for UI'et.

**Trin 1 — én lodret skive.** Login → vælg Kanal → log en genstand → se
stillingen, hele vejen i det nye design. Beviser plumbingen, og giver noget
rigtigt at reagere på tidligt.

**Trin 2 — resten, én funktion ad gangen.** Sladesh, chat, achievements,
profil, kort, kanal-log. Hver især færdig, mod dev-Convex, med det gamle repo
som opslagsværk.

**Trin 3 — cutover.** Først når appen kan det, brugerne bruger den til.
`docs/produktion.md` afsnit 6.
