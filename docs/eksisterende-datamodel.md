# Eksisterende datamodel (Firebase/Firestore)

Kortlægning af det nuværende SladeshApp-repo, lavet som forarbejde til
re-arkitekturen mod Convex.

**Reference-repo:** `SimMatHan/Sladesh2.0` (privat, sidst pushet 2026-07-26)
**Commit læst:** `5accdc44cccd598b911170ecaf7608e09d3e5fb7`
**Stack:** Vite + React + TypeScript + shadcn/ui + Firebase (Auth, Firestore,
Functions, Storage, Cloud Messaging)

> Dette dokument er **ren læsning**. Der er ikke ændret én linje i det gamle
> repo, og det bliver der heller ikke i kommende faser.

---

## 1. Oversigt over Firestore-collections

Udledt af `firestore.rules` (autoritativ liste over stier) krydstjekket mod de
faktiske `collection()` / `doc()`-kald i `src/services/` og `src/contexts/`.

| Sti | Type | Beskrivelse | TS-interface |
|---|---|---|---|
| `/users/{userId}` | Root | Bruger-dokument. Meget bredt — bærer også aggregerede tællere, achievements-map og aktiv Sladesh-lås. | `UserData` (`src/types/user.ts`) |
| `/users/{userId}/checkIns/{checkInId}` | Subcollection | Historik over Check Ins. | `CheckIn` (`src/types/checkIn.ts`) |
| `/users/{userId}/drinkLogs/{logId}` | Subcollection | Én række per drikkelogning. | `DrinkLog` (`src/types/drink.ts`) |
| `/users/{userId}/drinks/{drinkId}` | Subcollection | Legacy — kun regel, ingen kald fundet i `src/`. | — |
| `/users/{userId}/sladesh/{sladeshId}` | Subcollection | Legacy — afløst af root-collection `sladeshChallenges`. | — |
| `/users/{userId}/pushSubscriptions/{subscriptionId}` | Subcollection | Web Push-endpoints, dokument-id = hash af endpoint. | `src/services/pushSubscriptionService.ts` |
| `/users/{userId}/currentRun/{docId}` | Subcollection | Klient-state for igangværende run (drikke-motoren). | `DrinkEngineState` (`src/types/drink.ts`) |
| `/channels/{channelId}` | Root | **Kanal.** | `Channel` (`src/types/channel.ts`) |
| `/channels/{channelId}/messages/{messageId}` | Subcollection | Kanal-beskeder. | `ChannelMessage` (`src/types/message.ts`) |
| `/channels/{channelId}/comments/{commentId}` | Subcollection | Kun regel — ingen kald fundet i `src/`. | — |
| `/sladeshChallenges/{challengeId}` | Root | Sladesh-udfordringer. | `SladeshChallenge` (`src/types/sladesh.ts`) |
| `/stressBeacons/{beaconId}` | Root | **Beacon** (stress-signal). | `Beacon` (`src/types/beacon.ts`) |
| `/drinkVariations/{docId}` | Root | Katalog over navngivne drikkevarianter per kategori. | `DrinkVariation` (`src/types/drink.ts`) |
| `/donations/{donationId}` | Root | Donationer / "Top Donor". | `Donor` (`src/types/donor.ts`) |
| `/broadcasts/{broadcastId}` | Root | Admin-broadcasts (push). | `src/services/adminService.ts` |
| `/themeDrops/{themeDropId}` | Root | Admin-udløste tema-drops. | `src/services/adminService.ts` |
| `/settings/{documentId}` | Root | Globale indstillinger; kendt dokument: `settings/themes`. | `src/services/themeSettingsService.ts` |
| `/stats/{statId}` | Root | Globale aggregater; kendt dokument: `stats/global`. | `GlobalStats` (`src/types/drink.ts`) |

**Bemærk:** Der findes **ingen `scoreboard`- eller `leaderboard`-collection.**
Scoreboardet er allerede i dag beregnet ved forespørgsel — se afsnit 4.

---

## 2. Felter per collection

### 2.1 `/users/{userId}` — `UserData`

Kerne-identitet:

| Felt | Type | Noter |
|---|---|---|
| `uid` | `string` | Firebase Auth UID = dokument-id |
| `email` | `string` | |
| `displayName` | `string` | |
| `fullName` | `string?` | |
| `photoURL` | `string?` | |
| `onboardingCompleted` | `boolean?` | |
| `isAdmin` | `boolean?` | Adgang til admin-portal |
| `createdAt` / `updatedAt` | `Timestamp?` | |

Kanal-tilhørsforhold:

| Felt | Type | Noter |
|---|---|---|
| `activeChannelId` | `string \| null` | Aktuelt valgt Kanal; gemmes ved hvert skift, bruges som restore-target ved reload |
| `favoriteChannelId` | `string \| null?` | Kanal der loades først ved app-åbning |
| `joinedChannelIds` | `string[]` | Alle Kanaler brugeren er medlem af |
| `lastMessageViewedAt` | `Record<channelId, Timestamp>?` | Til ulæst-detektion |

Check In:

| Felt | Type | Noter |
|---|---|---|
| `checkInStatus` | `boolean?` | Om brugeren er checket ind |
| `lastCheckIn` | `Timestamp?` | |
| `lastCheckInVenue` | `string?` | |
| `lastStatusCheckedAt` | `Timestamp?` | |
| `checkInCount` | `number?` | Skrives med `increment(1)` |
| `currentLocation` | `{ lat, lng, venue, timestamp } \| null?` | |
| `location` | `{ lat, lng, lastUpdated }?` | Live-position som kortet læser |

Drikkelogning (aggregater på bruger-dokumentet):

| Felt | Type | Noter |
|---|---|---|
| `totalDrinks` | `number?` | Livstid, nulstilles aldrig |
| `currentRunDrinkCount` | `number?` | Dagens tæller, nulstilles kl. 10:00 |
| `drinkTypes` | `Record<categoryId, number>` | Akkumuleret, skrives via `increment()` |
| `drinkVariations` | `Record<categoryId, Record<variationName, number>>?` | Nuværende run |
| `allTimeDrinkVariations` | `Record<categoryId, Record<variationName, number>>?` | Livstid |
| `lastDrinkAt` | `Timestamp?` | Bruges som tie-breaker på scoreboardet |
| `lastDrinkDayStart` | `Timestamp?` | Grænse for nuværende "drikkedag" (10:00) |
| `totalRunResets` | `number?` | Tæller for manuelle nulstillinger |
| `stats` | `UserStats` | `{ totalDrinks, totalPoints, currentStreak, longestStreak }` + fri udvidelse |
| `currentDayStreak` | `number?` | Sammenhængende dage med drikkelogning |

Promille-indstillinger:

| Felt | Type |
|---|---|
| `promille` | `{ enabled: boolean; gender?: 'male' \| 'female'; weight?: number /* kg */; height?: number /* cm */ }?` |

Sladesh:

| Felt | Type | Noter |
|---|---|---|
| `sladeshSent` | `number?` | |
| `sladeshReceived` | `number?` | |
| `sladeshCompletedCount` | `number?` | Gennemført som modtager |
| `sladeshFailedCount` | `number?` | Fejlet som modtager |
| `lastSladeshSentAt` | `Timestamp?` | Til cooldown |
| `activeSladesh` | `ActiveSladeshLock \| null?` | `{ challengeId, status: 'in_progress', setAt, senderId, recipientId }` |

Achievements (i dag et map på bruger-dokumentet, ikke en collection):

| Felt | Type |
|---|---|
| `achievements` | `Record<achievementId, { count: number; unlockedAt?; firstUnlockedAt?; lastUnlockedAt?; maxStreak?: number }>?` |

Avatar / udseende:

| Felt | Type | Noter |
|---|---|---|
| `emoji` | `string?` | Avatar-emoji |
| `avatarColor` | `string?` | Gradient-navn, fx `"sunset"`, `"ocean"` |
| `profileEmoji` | `string?` | Status/profil-emoji, fx `"🚀"` |
| `profileGradient` | `string?` | Tailwind-klasser, fx `"from-sky-400 to-indigo-500"` |

> `UserData` har `[key: string]: any` — dokumentet er i praksis åbent for
> vilkårlige felter. Det er en af de ting Convex-schemaet strammer op.

### 2.2 `/channels/{channelId}` — `Channel` (**Kanal**)

| Felt | Type | Noter |
|---|---|---|
| `id` | `string` | Dokument-id |
| `name` | `string` | Kanalens navn — se afsnit 3 |
| `code` | `string` | Unik invitationskode, fx `"FRI-9024"` |
| `isDefault` | `boolean` | Hvis `true` joiner nye brugere automatisk |
| `description` | `string?` | |
| `members` | `string[]` | Bruger-id'er |
| `createdBy` | `string` | Admin der oprettede Kanalen |
| `createdAt` / `updatedAt` | `Timestamp` | |

Kun-UI-felter (ikke i databasen): `memberCount`, `isActive`, `isOwner`.

### 2.3 `/users/{userId}/checkIns/{checkInId}` — `CheckIn` (**Check In**)

| Felt | Type |
|---|---|
| `venue` | `string` |
| `location` | `{ lat: number; lng: number } \| null` |
| `channelId` | `string \| null` |
| `timestamp` | `Timestamp` |

### 2.4 `/users/{userId}/drinkLogs/{logId}` — `DrinkLog` (**drikkelogning**)

| Felt | Type | Noter |
|---|---|---|
| `categoryId` | `string` | Se kategori-tabellen i afsnit 3 |
| `variationName` | `string` | Fx `"Vermouth Tonic"`, `"Cigaret"` |
| `channelId` | `string?` | |
| `location` | `{ lat, lng }?` | |
| `sizeId` | `string?` | `"small"` / `"medium"` / `"large"` |
| `sizeMultiplier` | `number?` | `1.0` / `1.5` / `2.0` |
| `sizeLabel` | `string?` | `"Lille"` / `"Mellem"` / `"Stor"` |
| `sizeVolume` | `string?` | `"33cl"` / `"50cl"` / `"75cl"` |
| `timestamp` | `Timestamp` | |
| `userDisplayName` | `string?` | Snapshot af brugeren på logtidspunktet |
| `userEmoji` | `string?` | Snapshot (avatar-emoji) |
| `userProfileEmoji` | `string?` | Snapshot (status-emoji) |
| `userProfileGradient` | `string?` | Snapshot |
| `isReset` | `boolean?` | Markerer en nulstillings-hændelse frem for en reel genstand |

### 2.5 `/channels/{channelId}/messages/{messageId}` — `ChannelMessage`

| Felt | Type | Noter |
|---|---|---|
| `id` | `string` | Dokument-id |
| `senderId` | `string` | |
| `senderName` | `string` | Snapshot; falder tilbage til `'Anonymous'` |
| `senderEmoji` | `string?` | Snapshot; falder tilbage til `'👤'` |
| `senderGradient` | `string?` | Snapshot; falder tilbage til `'from-gray-400 to-gray-600'` |
| `text` | `string` | Trimmet, må ikke være tom |
| `createdAt` | `Timestamp` | `serverTimestamp()` |
| `isPending` | `boolean?` | Kun klient-side (optimistisk render) |

### 2.6 `/stressBeacons/{beaconId}` — **Beacon**

`Beacon`-interfacet i `src/types/beacon.ts` er en delmængde af det der faktisk
skrives i `adminService.createStressSignal()`. Den fulde skrevne form:

| Felt | Type | Noter |
|---|---|---|
| `createdBy` | `string` | |
| `lat` / `lng` | `number` | |
| `title` | `string` | Falder tilbage til `'Stress Beacon'` |
| `venue` | `string` | Skrives, men mangler i interfacet |
| `message` | `string` | Default `'Stress signal aktiveret!'`; mangler i interfacet |
| `type` | `string` | Altid `'stress'`; mangler i interfacet |
| `radius` | `number` | Altid `50`; mangler i interfacet |
| `notificationsSent` | `number` | Starter på `0`; mangler i interfacet |
| `active` | `boolean` | |
| `createdAt` / `updatedAt` | `Timestamp` | `updatedAt` mangler i interfacet |

> **Drift-fund:** interfacet og skrivningen er ude af sync. Convex-schemaet
> samler dem til ét sandt felt-sæt.

### 2.7 `/sladeshChallenges/{challengeId}` — `SladeshChallenge` (**Sladesh**)

| Felt | Type | Noter |
|---|---|---|
| `senderId` / `senderName` | `string` | |
| `recipientId` / `recipientName` | `string` | |
| `status` | `SladeshStatus` | `'pending' \| 'in_progress' \| 'completed' \| 'failed' \| 'expired'` |
| `phase` | `SladeshPhase` | `'intro' \| 'awaiting_filled' \| 'filled_captured' \| 'awaiting_empty' \| 'empty_captured' \| 'completed' \| 'failed'` |
| `createdAt` | `Timestamp \| number` | |
| `deadlineAt` | `Timestamp \| number` | |
| `updatedAt` | `Timestamp \| number` | |
| `completedAt` | `number?` | |
| `venue` | `string?` | |
| `location` | `{ lat, lng }?` | |
| `channelId` | `string \| null?` | |
| `proofBeforeImage` | `string?` | base64 |
| `proofAfterImage` | `string?` | base64 |
| `filledCapturedAt` | `number?` | |
| `emptyCapturedAt` | `number?` | |
| `idempotencyKey` | `string` | |

Relaterede typer: `CooldownState`, `ActiveSladeshLock`, fejlkoderne i
`SLADESH_ERRORS`, samt hjælperne `isResolvedSladeshStatus()`,
`isActiveSladeshStatus()` og `isChallengeInCurrentBlock()`.

> **Bemærk de blandede tidstyper:** `createdAt` / `deadlineAt` / `updatedAt` er
> `Timestamp | number`, mens `completedAt` / `filledCapturedAt` /
> `emptyCapturedAt` er rene `number` (epoch ms). I Convex bliver alt til
> `v.number()` (epoch ms) — ensartet.

### 2.8 Achievements — `src/lib/achievements.ts`

Achievement-**definitionerne** er statiske i kode (`ACHIEVEMENTS: Achievement[]`),
ikke i Firestore. Kun brugerens **oplåsninger** ligger i databasen, som map på
bruger-dokumentet (se 2.1).

`AchievementType`:
`'total_resets' | 'run_drinks' | 'total_drinks' | 'total_all_drinks' | 'category_diversity' | 'run_specific_variation' | 'specific_drink_count' | 'time_specific' | 'streak' | 'manual'`

`Achievement`-felter: `id`, `type`, `title`, `description`, `howToGet`, `image`,
`emoji?`, `threshold?`, `variationType?`, `category?`, `variation?`,
`requiredCategories?`, `repeatable?`, `startHour?`, `endHour?`.

Eksempler på id'er: `reset_confirmed`, `obeerma`, `full_bender`,
`like_fine_wine`, `top_donor`, `mr_worldwide`, `puff_minister`, `feinschmecker`.

---

## 3. Danske navne der SKAL bevares eksakt

Disse strenge er kanoniske i UI og/eller data. De må **ikke** oversættes,
normaliseres eller stavekorrigeres.

### 3.1 Domænebegreber

| Begreb | Bruges som | Kilde |
|---|---|---|
| **Kanal** | Domænebegreb i UI; hedder `channel` i koden | UI-tekster |
| **Check In** | Domænebegreb i UI; hedder `checkIn` i koden | UI-tekster |
| **Sladesh** | Produkt- og feature-navn; også i kode (`sladeshChallenges`) | Overalt |
| **Ballade** | Kanal-navn (data) + navn på to temaer | `AdminBroadcasts.tsx:18`, `AdminDevTools.tsx` |
| **Brøndby IF** | Kanal-navn (data) | `AdminBroadcasts.tsx:19` |
| **Den Åbne Kanal** | Navn på default-Kanal, som alle joiner automatisk | `src/lib/channelConstants.ts` |

`src/lib/channelConstants.ts`:

```ts
export const DEFAULT_CHANNEL_ID = 'RFYoEHhScYOkDaIbGSYA';
export const DEFAULT_CHANNEL_NAME = 'Den Åbne Kanal';
```

> **Vigtigt om stavning:** Kanalen hedder **`Brøndby IF`** i koden — med `ø` og
> med suffikset `IF`. Opgavebeskrivelsen skriver `Brøndby`; den kanoniske
> værdi i repoet er `Brøndby IF`.

> **Ballade er tvetydigt:** det er både et Kanal-navn (`{ id: "2", name: "Ballade" }`)
> og en tema-mekanik (`copenhellBallade`, `odaysBallade` i `settings/themes`,
> hvor de to Ballade-temaer er gensidigt udelukkende).

### 3.2 Drikkekategorier — `src/lib/drinkConstants.ts`

`id` er den værdi der gemmes i `drinkLogs.categoryId`; `label` er den danske
UI-tekst.

| `id` | `label` | `emoji` | `isDrink` |
|---|---|---|---|
| `beer` | **Øl** | 🍺 | `true` |
| `cider` | **Cider** | 🍏 | `true` |
| `wine` | **Vin** | 🍷 | `true` |
| `cocktail` | **Cocktails** | 🍸 | `true` |
| `shot` | **Shots** | 🥃 | `true` |
| `other` | **Andet** | 🌀 | `false` |

### 3.3 Størrelser — `src/lib/drinkSizes.ts`

| `id` | `label` | `volumeLabel` | `multiplier` |
|---|---|---|---|
| `small` | **Lille** | 33cl | 1.0 |
| `medium` | **Mellem** | 50cl | 1.5 |
| `large` | **Stor** | 75cl | 2.0 |

Kun kategorierne `beer`, `cider`, `wine`, `cocktail`, `shot` understøtter
størrelsesvalg (`SIZE_SUPPORTED_CATEGORIES`).

### 3.4 Øvrige danske strenge i data

- Variantnavne, fx `"Cigaret"`, `"Vermouth Tonic"` — gemmes ordret i
  `drinkLogs.variationName`.
- Beacon-default: `'Stress signal aktiveret!'`.
- Achievement-tekster (`howToGet`, dele af `description`) er på dansk, fx
  `"Drik 10 øl i ét run."`, `"Nulstil dit run 3 gange i alt."`.

---

## 4. Scoreboard — allerede beregnet, ikke lagret

`src/hooks/useLeaderboard.ts` beregner stillingen live. Der er ingen
scoreboard-collection.

I dag læser den **bruger-dokumenter** (ikke `drinkLogs`):

```ts
query(
  collection(db, 'users'),
  where('checkInStatus', '==', true),
  where('joinedChannelIds', 'array-contains', effectiveChannelId),
  orderBy('currentRunDrinkCount', 'desc'),
  limit(50)
)
```

Sorteringsregler:

1. Primær: `currentRunDrinkCount` faldende.
2. Tie-breaker (klient-side): tidligste `lastDrinkAt` vinder.

Deltagerkriterier: brugeren skal være **checket ind** (`checkInStatus === true`)
**og** medlem af den aktive Kanal (`joinedChannelIds` indeholder kanal-id).

Afledte felter i `LeaderboardUser`: `drinksToday` (= `currentRunDrinkCount`),
`drinksTotal` (= `totalDrinks`), `streak` (= `stats.currentStreak`),
`promille` (placeholder: `drinks * 0.18`), `hasActiveSladesh` (= `!!activeSladesh`),
`isOnline` (hårdkodet `true`, da kun indcheckede hentes).

> **Konsekvens for Convex:** den nye scoreboard-query beregner ud fra
> `drinkLogs` i stedet for at læse en denormaliseret tæller. Det fjerner
> `currentRunDrinkCount` som kilde til sandhed, men kræver at "drikkedagen"
> (10:00-grænsen, se afsnit 5) beregnes i queryen.

---

## 5. Forretningskonstanter der påvirker schemaet

`src/lib/drinkConstants.ts`:

| Konstant | Værdi | Betydning |
|---|---|---|
| `DRINK_DAY_START_HOUR` | `10` | Drikkedagen starter kl. 10:00; `currentRunDrinkCount` nulstilles her |
| `SPAM_WINDOW_MS` | `6000` | Spam-vindue |
| `SPAM_THRESHOLD` | `3` | Maks. 3 genstande i vinduet |
| `SPAM_COOLDOWN_MS` | `20000` | Cooldown ved spam |
| `OPTIMISTIC_WINDOW_MS` | `3000` | Vindue for optimistiske opdateringer |
| `MIN_DISTANCE_METERS` | `5` | Minimumsbevægelse før positionsopdatering |

`src/lib/sladeshConstants.ts`:

| Konstant | Værdi | Betydning |
|---|---|---|
| `SLADESH_TIME_LIMIT_MS` | `600000` | 10 minutter til at gennemføre en Sladesh |
| `SLADESH_COOLDOWN_BLOCK_HOURS` | `12` | Cooldown i 12-timers blokke |
| `BLOCK_1_START` / `BLOCK_1_END` | `0` / `12` | Blok 1: 00:00–12:00 |
| `BLOCK_2_START` / `BLOCK_2_END` | `12` / `24` | Blok 2: 12:00–24:00 |
| `SUCCESS_SCREEN_DELAY_MS` | `5000` | Auto-redirect efter succes |

---

## 6. Eksisterende Firestore-indexes

Fra `firestore.indexes.json` — det er disse adgangsmønstre Convex-indexene skal
dække:

| Collection | Felter |
|---|---|
| `sladeshChallenges` | `recipientId` ASC, `createdAt` DESC |
| `sladeshChallenges` | `senderId` ASC, `createdAt` DESC |
| `users` | `checkInStatus` ASC, `joinedChannelIds` CONTAINS, `currentRunDrinkCount` DESC |
| `users` | `activeChannelId` ASC, `checkInStatus` ASC |
| `drinkLogs` (collection group) | `channelId` ASC, `timestamp` ASC |

---

## 7. Fund der kræver en beslutning i re-arkitekturen

1. **`UserData` er ustruktureret.** `[key: string]: any` plus ~50 valgfri felter.
   Convex-schemaet kræver eksplicitte validators — de aggregerede tællere
   (`currentRunDrinkCount`, `drinkTypes`, `drinkVariations`) er kandidater til at
   udgå, fordi de kan beregnes fra `drinkLogs`.
2. **Achievements er et map, ikke rækker.** Opgaven beder om en `achievements`-
   tabel. Det betyder én række per (bruger, achievement) i stedet for et map på
   bruger-dokumentet.
3. **Subcollections findes ikke i Convex.** `checkIns`, `drinkLogs` og `messages`
   bliver flade tabeller med en eksplicit reference til ejeren.
4. **`Beacon`-interfacet er ude af sync med skrivningen** (se 2.6).
5. **Blandede tidstyper i `SladeshChallenge`** (`Timestamp | number`) — normaliseres
   til epoch ms.
6. **Collections uden for fase 1's tabel-liste:** `drinkVariations`, `donations`,
   `broadcasts`, `themeDrops`, `settings`, `stats`, `pushSubscriptions`,
   `currentRun`, samt de døde `drinks`- og `sladesh`-subcollections.
   Disse er **ikke** med i fase 1-schemaet, jf. den aftalte afgrænsning.
