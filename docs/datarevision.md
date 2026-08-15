# Datarevision

Automatisk genereret af `npm run datarevision` — ret ikke i hånden.
Kørt mod Firebase-projektet `sladeshultimate-1`.

Revisionen er læse-kun og svarer på ét spørgsmål: passer produktionsdataene til `convex/schema.ts`, og kan de eksisterende brugere logge ind efter en migrering?

Validering sker mod validatorerne i `convex/schema.ts` læst på runtime — ikke mod en håndskrevet kopi, som ville kunne drive fra schemaet.

Rapporten indeholder kun aggregerede tal, feltnavne og typenavne. Ingen emails, navne, positioner, beskedtekst eller dokument-id'er.

---

## 1. Den kritiske antagelse: `users.authId` = Firebase UID

Convex-schemaet kobler `users.authId` til tokenets `sub`-claim, altså Firebase UID. Migreringen forudsætter, at dokument-id'et i Firestores `/users` ER dette UID. Ellers kan de eksisterende brugere ikke logge ind.

| Måling | Antal |
|---|---|
| Dokumenter i `/users` | 32 |
| Brugere i Firebase Auth | 36 |
| **Dokument-id matcher et Auth-UID** | **31** |
| Dokument uden tilsvarende Auth-bruger | 1 |
| Auth-bruger uden Firestore-dokument | 5 |

**Konklusion: antagelsen holder IKKE fuldt ud.** 96.9% matcher (31 af 32). 1 dokumenter har et id der ikke findes i Firebase Auth — de brugere vil ikke kunne logge ind efter migreringen uden en manuel kobling.

Fordeling på login-metode:

| Login-metode | Matcher | Kun i Auth (ingen profil) |
|---|---|---|
| `password` | 31 | 5 |

De 5 Auth-brugere uden Firestore-dokument er formentlig konti der aldrig fuldførte onboarding. De skal ikke migreres; de får en profil første gang de logger ind i den nye app.

## 2. Collections målt mod Convex-schemaet

| Collection | Dokumenter | Med afvigelser | Ukendte felter |
|---|---|---|---|
| users | 32 | 23 | 21 |
| kanaler (Firestore: channels) | 5 | 2 | 0 |
| messages (channels/*/messages) | 0 | 0 | 0 |
| checkIns (users/*/checkIns) | 306 | 0 | 0 |
| drinkLogs (users/*/drinkLogs) | 1725 | 310 | 1 |
| sladeshChallenges | 0 | 0 | 0 |
| beacons (Firestore: stressBeacons) | 1 | 1 | 3 |

### users

32 dokumenter. 23 har mindst én afvigelse.

**Feltdækning** — hvor mange dokumenter har feltet, og med hvilke typer:

| Felt | Til stede | Andel | Typer |
|---|---|---|---|
| `achievements` ⚠️ | 32 | 100% | object (32) |
| `activeChannelId` | 32 | 100% | string (32) |
| `allTimeDrinkVariations` ⚠️ | 32 | 100% | object (32) |
| `checkInStatus` | 32 | 100% | boolean (32) |
| `createdAt` | 32 | 100% | Timestamp (32) |
| `currentLocation` | 32 | 100% | null (32) |
| `currentRunDrinkCount` ⚠️ | 32 | 100% | number (32) |
| `displayName` | 32 | 100% | string (32) |
| `drinkTypes` ⚠️ | 32 | 100% | array (20), object (12) |
| `drinkVariations` ⚠️ | 32 | 100% | object (32) |
| `email` | 32 | 100% | string (32) |
| `fullName` | 32 | 100% | string (32) |
| `joinedChannelIds` | 32 | 100% | array (32) |
| `lastDrinkDayStart` | 32 | 100% | Timestamp (32) |
| `lastMessageViewedAt` ⚠️ | 32 | 100% | object (32) |
| `sladeshCompletedCount` | 32 | 100% | number (32) |
| `sladeshFailedCount` | 32 | 100% | number (32) |
| `sladeshReceived` | 32 | 100% | number (32) |
| `sladeshSent` | 32 | 100% | number (32) |
| `stats` ⚠️ | 32 | 100% | object (32) |
| `totalDrinks` ⚠️ | 32 | 100% | number (32) |
| `uid` ⚠️ | 32 | 100% | string (32) |
| `updatedAt` | 32 | 100% | Timestamp (32) |
| `initials` ⚠️ | 31 | 96.9% | string (31) |
| `lastActiveAt` ⚠️ | 31 | 96.9% | Timestamp (31) |
| `onboardingCompleted` | 31 | 96.9% | boolean (31) |
| `lastCheckIn` | 30 | 93.8% | Timestamp (30) |
| `lastCheckInVenue` | 30 | 93.8% | string (30) |
| `lastDrinkAt` | 30 | 93.8% | Timestamp (28), null (2) |
| `lastStatusCheckedAt` | 30 | 93.8% | Timestamp (30) |
| `profileEmoji` | 30 | 93.8% | string (30) |
| `profileGradient` | 30 | 93.8% | string (30) |
| `totalRunResets` | 29 | 90.6% | number (29) |
| `promille` | 27 | 84.4% | object (27) |
| `lastSladeshSentAt` | 26 | 81.3% | Timestamp (15), null (11) |
| `avatarGradient` ⚠️ | 22 | 68.8% | string (22) |
| `activeSladesh` ⚠️ | 21 | 65.6% | null (11), object (10) |
| `username` ⚠️ | 21 | 65.6% | string (21) |
| `checkInCount` | 18 | 56.3% | number (18) |
| `currentDayStreak` | 17 | 53.1% | number (17) |
| `currentRunDrinkTypes` ⚠️ | 17 | 53.1% | object (17) |
| `lastMessagePeriodReset` ⚠️ | 16 | 50% | Timestamp (15), null (1) |
| `messageCount` ⚠️ | 16 | 50% | number (16) |
| `lastUsageReminderAt` ⚠️ | 14 | 43.8% | Timestamp (14) |
| `lastUsageReminderSlot` ⚠️ | 14 | 43.8% | string (14) |
| `avatarColor` | 13 | 40.6% | string (13) |
| `emoji` | 13 | 40.6% | string (13) |
| `location` | 13 | 40.6% | object (13) |
| `photoURL` | 10 | 31.3% | null (10) |
| `locationPermissionGranted` ⚠️ | 3 | 9.4% | boolean (3) |
| `favoriteChannelId` | 1 | 3.1% | string (1) |
| `isAdmin` | 1 | 3.1% | boolean (1) |
| `lastNotificationSeenAt` ⚠️ | 1 | 3.1% | Timestamp (1) |

⚠️ = felt findes i dataene men ikke i Convex-schemaet (21 stk.). Enten skal schemaet udvides, eller også er feltet dødt og kan droppes ved migrering.

**Afvigelser der ville få Convex til at afvise dokumentet:**

| Problem | Antal dokumenter |
|---|---|
| `lastSladeshSentAt` — forventede number, fik null | 11 |
| `photoURL` — forventede string, fik null | 10 |
| `promille.gender` — passer ingen af unionens 2 grene | 6 |
| `lastDrinkAt` — forventede number, fik null | 2 |

### kanaler (Firestore: channels)

5 dokumenter. 2 har mindst én afvigelse.

**Feltdækning** — hvor mange dokumenter har feltet, og med hvilke typer:

| Felt | Til stede | Andel | Typer |
|---|---|---|---|
| `createdAt` | 5 | 100% | Timestamp (5) |
| `isDefault` | 5 | 100% | boolean (5) |
| `members` | 5 | 100% | array (5) |
| `name` | 5 | 100% | string (5) |
| `updatedAt` | 5 | 100% | Timestamp (5) |
| `code` | 4 | 80% | string (4) |
| `description` | 4 | 80% | string (3), null (1) |
| `createdBy` | 3 | 60% | string (3) |

**Afvigelser der ville få Convex til at afvise dokumentet:**

| Problem | Antal dokumenter |
|---|---|
| `createdBy` — påkrævet felt mangler | 2 |
| `code` — påkrævet felt mangler | 1 |
| `description` — forventede string, fik null | 1 |

### messages (channels/*/messages)

Ingen dokumenter.

### checkIns (users/*/checkIns)

306 dokumenter. 0 har mindst én afvigelse.

**Feltdækning** — hvor mange dokumenter har feltet, og med hvilke typer:

| Felt | Til stede | Andel | Typer |
|---|---|---|---|
| `channelId` | 306 | 100% | string (300), null (6) |
| `location` | 306 | 100% | object (184), null (122) |
| `timestamp` | 306 | 100% | Timestamp (306) |
| `venue` | 306 | 100% | string (306) |

**Ingen dokumenter ville blive afvist af Convex-validatorerne.**

### drinkLogs (users/*/drinkLogs)

1725 dokumenter. 310 har mindst én afvigelse.

**Feltdækning** — hvor mange dokumenter har feltet, og med hvilke typer:

| Felt | Til stede | Andel | Typer |
|---|---|---|---|
| `categoryId` | 1725 | 100% | string (1725) |
| `timestamp` | 1725 | 100% | Timestamp (1725) |
| `variationName` | 1725 | 100% | string (1725) |
| `channelId` | 1616 | 93.7% | string (1610), null (6) |
| `location` | 1616 | 93.7% | object (1306), null (310) |
| `sizeId` | 1406 | 81.5% | string (1406) |
| `sizeLabel` | 1406 | 81.5% | string (1406) |
| `sizeMultiplier` | 1406 | 81.5% | number (1406) |
| `sizeVolume` | 1406 | 81.5% | string (1406) |
| `userDisplayName` | 1279 | 74.1% | string (1279) |
| `userProfileEmoji` | 1107 | 64.2% | string (1107) |
| `userProfileGradient` | 1107 | 64.2% | string (1107) |
| `userEmoji` | 666 | 38.6% | string (666) |
| `action` ⚠️ | 109 | 6.3% | string (109) |
| `isReset` | 4 | 0.2% | boolean (4) |

⚠️ = felt findes i dataene men ikke i Convex-schemaet (1 stk.). Enten skal schemaet udvides, eller også er feltet dødt og kan droppes ved migrering.

**Afvigelser der ville få Convex til at afvise dokumentet:**

| Problem | Antal dokumenter |
|---|---|
| `location` — forventede objekt, fik null | 310 |

### sladeshChallenges

Ingen dokumenter.

### beacons (Firestore: stressBeacons)

1 dokumenter. 1 har mindst én afvigelse.

**Feltdækning** — hvor mange dokumenter har feltet, og med hvilke typer:

| Felt | Til stede | Andel | Typer |
|---|---|---|---|
| `active` | 1 | 100% | boolean (1) |
| `createdAt` | 1 | 100% | Timestamp (1) |
| `createdBy` | 1 | 100% | string (1) |
| `expiresAt` ⚠️ | 1 | 100% | Timestamp (1) |
| `lastNotificationSentAt` ⚠️ | 1 | 100% | Timestamp (1) |
| `location` ⚠️ | 1 | 100% | object (1) |
| `notificationsSent` | 1 | 100% | number (1) |
| `updatedAt` | 1 | 100% | Timestamp (1) |

⚠️ = felt findes i dataene men ikke i Convex-schemaet (3 stk.). Enten skal schemaet udvides, eller også er feltet dødt og kan droppes ved migrering.

**Afvigelser der ville få Convex til at afvise dokumentet:**

| Problem | Antal dokumenter |
|---|---|
| `lat` — påkrævet felt mangler | 1 |
| `lng` — påkrævet felt mangler | 1 |
| `radius` — påkrævet felt mangler | 1 |
| `title` — påkrævet felt mangler | 1 |
| `type` — påkrævet felt mangler | 1 |

## 3. Referentiel integritet

Convex håndhæver `v.id("kanaler")` som en rigtig reference. Peger et felt på en kanal der ikke findes, kan rækken ikke indsættes — den skal renses eller nulstilles under migreringen.

| Kontrol | Antal |
|---|---|
| Kanaler i alt | 5 |
| `activeChannelId` peger på en slettet kanal | 1 |
| `favoriteChannelId` peger på en slettet kanal | 0 |
| `joinedChannelIds`-poster mod slettede kanaler | 1 |
| `drinkLogs.channelId` mod slettede kanaler | 0 |
| `checkIns.channelId` mod slettede kanaler | 0 |
| Bruger mener sig medlem, kanal er uenig | 0 |
| Kanal mener bruger er medlem, bruger er uenig | 0 |
| Forældreløse `drinkLogs` (ejer findes ikke) | 0 |
| Forældreløse `checkIns` | 0 |
| Forældreløse `messages` (kanal findes ikke) | 0 |

## 4. Konsekvens af fase 1-3's schemaændringer

### Fjernede tællere vs. faktiske logrækker

`totalDrinks`, `currentRunDrinkCount`, `drinkTypes`, `drinkVariations` og `allTimeDrinkVariations` er fjernet fra schemaet; de skal genberegnes fra `drinkLogs`. Hvis de gamle tællere allerede er drevet fra logrækkerne, er det et argument FOR beslutningen — men tallene på brugernes profiler vil ændre sig ved migreringen.

| Måling | Antal |
|---|---|
| Brugere i alt | 32 |
| `drinkLogs` i alt | 1725 |
| Brugere hvor `totalDrinks` = summen af logrækker | 12 |
| Brugere hvor de er drevet fra hinanden | 20 |
| Største afvigelse for én bruger | 76 |
| Gennemsnitlig afvigelse blandt de uenige | 12.33 |

### Achievements: map → rækker

| Måling | Antal |
|---|---|
| Brugere med mindst ét achievement | 12 |
| Rækker i den nye `achievements`-tabel | 29 |

### Sladesh-bevisbilleder: base64 → Convex storage

| Måling | Antal |
|---|---|
| Udfordringer i alt | 0 |
| Med `proofBeforeImage` | 0 |
| Med `proofAfterImage` | 0 |
| Samlet base64-størrelse | 0.0 MB |

Billederne skal uploades til Convex storage og felterne erstattes med storage-id'er. Det er migreringens eneste trin der kræver netværk per dokument frem for en ren transformation.

### `currentStreak` og `totalPoints` var altid 0

| Måling | Antal |
|---|---|
| Brugere med `stats.currentStreak` ≠ 0 | 0 |
| Brugere med `stats.totalPoints` ≠ 0 | 0 |

Bekræftet: begge felter er 0 for alle brugere, præcis som kodelæsningen sagde. Beslutningen om at fjerne `currentStreak` og indføre et nyt pointbegreb kaster ingen data væk.

---

## 5. Hvad revisionen kalder på

Udfyldes ud fra tallene ovenfor. Tommelfingerregler: en afvigelse der rammer få dokumenter renses i migreringen; en der rammer de fleste, peger på at schemaet er forkert.

