# Brugerrejser og informationsarkitektur

Trin 1. Hvordan den nye app skal hænge sammen, før der tegnes en eneste
skærm.

Grundlaget er `docs/skaermkortlaegning.md`: 20 sider, 5 faner og 8 ruter uden
for navigationen. Det er ikke et designproblem, det er et **placeringsproblem**
— der er mere app, end der er steder at putte den. Denne fil løser det først.

---

## 1. Hvad "intuitivt" betyder her

Seks regler, som resten af dokumentet kan måles imod. De er konkrete med vilje;
"rent og enkelt" kan man ikke være uenig i, og derfor styrer det ingenting.

1. **Den hyppigste handling koster færrest tryk.** At logge en genstand er
   det, folk gør oftest og mest berusede. Alt andet må vige for det.
2. **Én ting ad gangen.** Højst ét niveau under en fane. Skal man huske en sti
   for at finde noget, ligger det forkert.
3. **Det der ændrer, hvad du ser, skal være synligt.** Hvilken Kanal du er i
   afgør stillingen, chatten, kortet og hvem du kan sende en Sladesh til. Den
   må ikke gemme sig i en menu.
4. **Tidskritisk afbryder. Resten venter.** En modtaget Sladesh har 10
   minutter og skal tage skærmen. En ny chatbesked skal ikke.
5. **Handlinger frem for destinationer.** Noget er steder, man går hen. Andet
   er ting, man gør. At logge en genstand er en handling og bør ikke koste et
   sideskift, man skal finde tilbage fra.
6. **Kun det uoprettelige spørger.** At nulstille sit run spørger. At logge en
   øl gør ikke — den kan fortrydes.

---

## 2. Den ene indsigt

**Kanalen er rammen, ikke en indstilling.**

Stilling, chat, kort, kanal-historik og Sladesh er alle sammen "denne Kanal,
lige nu". I den gamle app er de fem separate destinationer, man når fra hver
sit sted, mens selve Kanal-valget ligger nede i en menu under "More" →
Channels.

Vender man det om — Kanalen er stedet, og de fem er visninger inde i det —
forsvinder det meste af navigationsproblemet af sig selv. Otte ruter uden for
navigationen bliver til fire visninger ét sted.

Tilbage er kun to slags indhold:

- **Kanalen** — hvad de andre laver.
- **Mig** — mine tal, mine achievements, mine indstillinger.

Og én ting, der hverken er det ene eller det andet: **at logge**.

---

## 3. Navigationen

```
┌──────────────────────────────────────────┐
│  Ballade ▾                          🔔   │   ← Kanalen er altid synlig
├──────────────────────────────────────────┤
│  Stilling · Chat · Kort · Historik       │   ← visninger i Kanalen
│                                          │
│                                          │
│              (indhold)                   │
│                                          │
│                                          │
├──────────────────────────────────────────┤
│      Kanal        ( + )        Mig       │
└──────────────────────────────────────────┘
```

**To faner og én handling.** Fra fem faner og otte løse ruter.

- **Kanal** — åbner på Stillingen. Fire visninger i en segmentvælger.
- **Mig** — profil, tal, achievements, indstillinger.
- **( + )** — logger en genstand. **Ikke en fane.** Et tryk åbner et ark over
  det, du er i gang med; du vælger, arket lukker, og du står præcis, hvor du
  var. Ingen navigation, ingen vej tilbage at finde.

**Kanalnavnet i toppen er en knap.** Tryk skifter Kanal, melder dig ind med en
kode, eller opretter en ny. Det er den eneste rigtige plads: det står, hvor
konsekvensen af valget vises.

To faner kan lyde af lidt. Det er meningen — det er de to steder, der findes.
Alt det gamle indhold har en plads (afsnit 6); det er kun *destinationerne*,
der er skåret ned.

### Sladesh er ikke en fane

I den gamle app har Sladesh sin egen fane. Fire ud af fem gange man trykker
på den, er der ingenting at lave — man må kun sende én per 12-timers blok, og
man modtager sjældent.

En Sladesh er en **begivenhed**, ikke et sted:

- **Modtager man en**, tager den skærmen. Der er 10 minutter, og alt andet kan
  vente. Lukker man den, bliver en bjælke stående med nedtællingen, indtil den
  er afgjort.
- **Sender man en**, sker det fra Stillingen — tryk på en person, og "Send
  Sladesh" står blandt det, man kan gøre ved vedkommende. Det er der, folk
  allerede kigger efter hinanden.

Den plads, det frigør i navigationen, er hele grunden til at der kan være to
faner i stedet for fem.

---

## 4. Brugerrejser

### R1 — Log en genstand (den vigtigste)

> **2 tryk i det almindelige tilfælde.** I den gamle app: åbn Log-fanen, swipe
> til kategorien, vælg variant, vælg størrelse, tryk plus. Fem, hvis man
> rammer rigtigt første gang.

1. Tryk **( + )** hvor som helst i appen.
2. Et ark glider op. Øverst står **dine sædvanlige** — de tre-fire varianter,
   du oftest logger, i den størrelse du plejer.
3. Tryk på "Tuborg". Arket lukker med en kort bekræftelse.

Nedenunder de sædvanlige ligger hele kataloget efter kategori, for det man
ikke plejer at drikke. Størrelse kan ændres i arket, men har en default, så
det almindelige valg ikke koster et tryk.

**Fortryd** ligger i selve bekræftelsen — "Tuborg logget · Fortryd" — nogle
sekunder. Bagefter kan man fortryde fra Historik. Det svarer til `removeDrink`,
som fortryder én bestemt logning.

*Bagved:* `drinkVariations.getDrinkVariations`, `drinkLogs.logDrink`,
`drinkLogs.removeDrink`. "Dine sædvanlige" udledes af egne `drinkLogs` — ingen
ny backend.

### R2 — Se hvordan det står

1. Åbn appen. Du lander på **Kanal → Stilling**.

Det er hele rejsen. Stillingen er det, folk åbner appen for at se, når de ikke
lige skal logge noget.

Hver række: avatar, navn, genstande i det igangværende run, stræk, og promille
hvis personen har slået den til. Rækker uden promille viser ikke 0,0 — de viser
ingenting, for et opdigtet tal ved siden af et rigtigt er værre end et tomt
felt.

*Bagved:* `scoreboard.getScoreboard`. Ét kald, hele rækken.

### R3 — Modtag en Sladesh

Tidskritisk. Afbryder.

1. Skærmen tages over: **"Anders har sladeshet dig"**, nedtælling fra 10:00.
2. **Fyld op** → kameraet → billede af den fyldte genstand.
3. **Drik.**
4. **Tomt** → kameraet → billede af den tomme.
5. **Gennemført.** Tælleren stiger, stillingen opdaterer sig selv.

Lukker man overtagelsen, bliver en bjælke med nedtællingen stående i toppen.
Løber tiden ud, tæller den som fejlet — det sker på serveren, uanset om appen
er åben.

*Bagved:* `sladesh.getActiveSladeshForUser`, `registrerBevis`,
`genererUploadUrl`, `afslutSladesh`, `opgivSladesh`. Fuldt dækket siden fase 6.

### R4 — Send en Sladesh

1. **Kanal → Stilling**. Tryk på en person.
2. Personkortet åbner: deres tal, deres achievements — og **Send Sladesh**.
3. Bekræft. Afsendt.

Kan man ikke sende, står knappen der stadig, men slukket, med grunden skrevet
ud: *"Du har sendt en Sladesh i denne blok. Næste om 4t 12m."* eller *"Anders
har allerede en aktiv Sladesh."* En knap, der bare forsvinder, får folk til at
tro, at funktionen er væk.

*Bagved:* `sladesh.sendSladesh`, `sladesh.getCooldown`.

### R5 — Første gang

1. **Log ind.** Uændret — Firebase Auth, samme konto som altid. Ingen skal
   oprette sig på ny.
2. **Vælg din Kanal.** Er man allerede medlem af nogen (det er alle
   migrerede), vælger man bare. Ellers: indtast kode eller opret.
3. **Hvem er du?** Navn, avatar, farve. Ét skridt, kan springes over.
4. Du lander på Stillingen.

*Bagved:* `users.createUser`, `kanaler.getMineKanaler`, `joinKanal`,
`users.setActiveChannel`, `users.opdaterProfil` — det sidste kom først med i
trin 0.

### R6 — Skift Kanal

1. Tryk på **kanalnavnet** i toppen.
2. Vælg. Alt indhold skifter.

Samme sted findes "Meld dig ind med kode" og "Opret Kanal". Kanalskiftet er
ikke en indstilling, man går ind i menuen og ændrer — det er en knap over det,
det ændrer.

### R7 — Nulstil dit run

Ligger i **Mig**, ved dine egne tal — ikke på forsiden, hvor man kan komme til
at ramme den.

1. **Mig → Nulstil run.**
2. Bekræft: *"Din stilling starter forfra. Historikken bliver stående."*

Det er den ene handling, der spørger. Den fjerner ens plads på listen for
resten af dagen, og det er ikke til at fortryde.

*Bagved:* `drinkLogs.resetRun`.

### R8 — Se en anden persons profil

1. Tryk på et navn — i Stillingen, i chatten, i historikken. Alle steder.
2. Personkortet åbner.

Ét mønster, samme sted hver gang. I den gamle app er `/user/:id` en side, man
kun kan nå fra Score.

*Bagved:* `users.getUser`, `achievements.getAchievementsForUser`,
`drinkLogs.getDrinkLogsForUser`.

---

## 5. Check In skal væk som et separat skridt

I dag: man skal trykke **Check ind** for overhovedet at stå på stillingen, og
det udløber ved drikkedagens grænse kl. 10:00. Logger man en øl uden at have
checket ind, tæller den — men man er usynlig for de andre.

Det er den mest forvirrende regel i appen. Man har gjort det rigtige og får
ingenting at vide.

**Den første genstand i et run checker dig ind.** Er du med i legen, er du på
listen. `checkIn` findes stadig for dem, der vil markere "jeg er ude", før de
drikker noget — men ingen kan længere falde af listen ved at glemme den.

> ✅ **Bygget.** `drinkLogs.logDrink` sætter `checkInStatus` ved første rigtige
> genstand i drikkedagen (en cigaret siger ikke, at man er ude).
>
> Samtidig fik deltagerkriteriet på stillingen et **udløb**. Før var reglen
> `checkInStatus === true` uden tidsgrænse, hvilket havde to fejl på én gang:
> man kunne drikke og være usynlig, og et check-in fra i marts talte som "ude i
> aften". Nu er man med, hvis man har drukket i det igangværende run **eller**
> har checket ind siden kl. 10:00.

---

## 6. Gammel skærm → nyt sted

Intet forsvinder ubemærket.

| Gammel side | Nyt sted |
|---|---|
| `/` Index (7 widgets) | Opløst. Stillingen er forsiden; genvejene bliver til de steder, de pegede på |
| `/log` DrinkLog | **( + )**-arket |
| `/score` Score | **Kanal → Stilling** |
| `/sladesh` SladeshOrbit | Personkortet i Stillingen (R4) |
| `/receive-sladesh` | Overtagelse (R3) |
| `/messages` Messages | **Kanal → Chat** |
| `/map` LiveMap | **Kanal → Kort** |
| `/channel-log` ChannelLog | **Kanal → Historik** |
| `/channels` Channels | Kanalvælgeren i toppen |
| `/profile` Profile | **Mig** |
| `/achievements` | **Mig → Achievements** |
| `/settings` Settings | **Mig → Indstillinger** |
| `/user/:id` UserProfile | Personkort, fra ethvert navn |
| `/onboarding` | R5, trin 2–3 |
| `/login` `/signup` `/splash` | Uændret |
| `/admin` Admin | **Mig → Admin**, kun for admins |
| `/support` Support | **Mig → Støt appen** |
| `/`-fallback NotFound | Uændret |

Fem faner og otte løse ruter er blevet til **to faner, fire visninger, ét ark
og én overtagelse**.

---

## 7. Hvad jeg har besluttet — og hvorfor

**Log er en handling, ikke et sted.** Det er den hyppigste ting i appen, og et
sideskift midt i en samtale er dyrere end det ser ud. Et ark koster ingen
kontekst.

**Sladesh mistede sin fane.** Den var tom det meste af tiden. Som begivenhed
er den mere synlig, ikke mindre — den afbryder, når den betyder noget.

**Kanalvælgeren flyttede op i toppen.** Den styrer alt, hvad man ser. At den
lå i en undermenu var den enkeltstående største kilde til "hvorfor kan jeg ikke
se nogen".

**Forsiden er opløst.** Et dashboard af syv widgets er som regel et symptom
på, at man ikke vidste, hvor tingene skulle ligge. Nu har hver af dem et sted.

**Deaktiverede knapper forklarer sig selv.** Særligt Sladesh-cooldownen, som
ellers er usynlig og virker som en fejl.

---

## 8. Det jeg ikke kan beslutte for dig

**Skal andre kunne se, hvor du er?** Kortet viser i dag medlemmernes
positioner løbende, for alle i Kanalen. Det er den mest personfølsomme
funktion i appen, og det her er det rigtige tidspunkt at tage stilling.

Mit forslag, hvis kortet bliver: positionen deles **kun mens du er ude**, den
kan slås fra per Kanal, og du kan altid se på ét blik, hvem der kan se dig.
Det er stadig et valg, du skal træffe — også muligheden at lade kortet gå.

**Skal `/support` og donationer med?** Collectionen blev valgt fra i fase 1.
Det er en beslutning om, hvorvidt appen stadig skal bede om penge.

**Skal admin ligge i appen?** Syv underskærme, som fem procent af brugerne kan
se. De kan lige så godt ligge et andet sted — men det er ekstra arbejde nu.

**To døgngrænser.** Drikkedagen starter kl. 10:00; Sladesh-cooldownen kører i
12-timers blokke fra midnat. Begge er bevidste, men de er svære at forklare.
Skal de være ens?

---

## 9. Trin 1 — bygget

Den lodrette skive står:

1. ✅ **Skallen** — to faner, kanalvælgeren i toppen, ( + )-knappen.
2. ✅ **Kanal → Stilling** — rigtige data, reaktivt.
3. ✅ **( + )-arket** — kataloget, dine sædvanlige, log og fortryd.
4. ✅ **Personkortet** — fra en række i Stillingen, med Send Sladesh.
5. ✅ **Mig** — egne tal, promille, achievements, nulstil run.
6. ✅ **Sladesh** — send fra personkortet, modtag som overtagelse.

Det er R1, R2, R3, R4, R6, R7 og R8 hele vejen igennem mod dev-Convex med
rigtige migrerede brugere.

**Ingen router endnu.** To faner og tre ark er tilstand, ikke adresser. Den
kommer, når der er URL'er værd at dele — fx et link direkte til en Kanal.
`vercel.json` har SPA-rewrites klar til den dag.

**Sladesh blev bygget som ét stykke.** Send og modtag hører sammen: at kunne
sende, uden at modtageren har et flow at gennemføre udfordringen i, ville
efterlade folk med noget, de ikke kan komme af med.

Kameraet er `<input capture>` frem for `getUserMedia`. Det giver telefonens
eget kamera med det samme, uden en tilladelsesdialog vi selv skal håndtere —
og på en computer bliver det en filvælger, så flowet kan afprøves uden mobil.

Faserne er serverens. `registrerBevis` afviser at gå baglæns eller springe
over, så skærmen kun tegner det, `phase` siger. Genindlæser man midt i det,
står man præcis samme sted.

### Tilbage

| Næste | Hvor |
|---|---|
| Chat | Kanal → Chat |
| Kort | Kanal → Kort |
| Historik | Kanal → Historik |
| Indstillinger | Mig → Indstillinger (navn, avatar, promille) |
| Onboarding | R5, trin 2–3 |

Backenden kan dem alle. Det, der mangler, er skærme.
