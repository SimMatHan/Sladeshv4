# Oplæg til redesign af UI

Det, vi beder om. Reglerne står i `docs/redesign-kontrakt.md` — læs den først.

---

## Appen

SladeshApp er en drikkeleg for en vennegruppe. Man melder sig ind i en
**Kanal**, logger sine genstande, og ser stillingen for aftenen. Man kan
sende hinanden en **Sladesh** — en udfordring på tid, der skal dokumenteres
med et billede. Der er achievements, en promilleberegning, et kort og en chat.

Den bruges **om aftenen, i en bar, på en telefon, af nogen der har fået et
par stykker.** Alt hvad der følger, er en konsekvens af den sætning.

Appen virker og er i drift. Dette er et redesign af overfladen, ikke en
omskrivning.

---

## Retningen

To referencer, og hvad vi vil have fra hver:

**Revolut** — reduktionen. Ét stort tal per skærm, alt andet småt og dæmpet.
Luft frem for streger. Vi vil ikke have banking-æstetikken; vi vil have
disciplinen i, hvor lidt der står ad gangen.

**Apple Fitness-ringene** — formen, ikke farverne. Ringen som appens ene
bærende figur, fordi næsten alt i appen er "hvor langt er du af noget".

Kort sagt: **stram det, der er. Find ikke på et nyt udtryk.** Mørk baggrund
og den ravgule accent bliver. Løftet skal ligge i typografi, luft, hierarki
og bevægelse.

---

## Ti konkrete regler

1. **Én ting per skærm.** Højst ét primært tal i synsfeltet. Resten er
   støtte og skal se sådan ud.

2. **Stor typografisk spredning.** Brug `40 / 28 / 17 / 13 / 11 px`. Spring
   mellemstørrelserne over — det er kontrasten, der laver hierarkiet, ikke
   antallet af trin.

3. **Tal er tal.** `font-variant-numeric: tabular-nums` overalt.
   `letter-spacing: -0.03em` på alt over 28 px. Et tal, der hopper i bredden,
   når det tæller op, ser i stykker ud.

4. **Etiketter er små og dæmpede.** 11 px, `letter-spacing: 0.07em`,
   `text-transform: uppercase`, `--tekst-svag`. Tallet råber, etiketten
   hvisker.

5. **Færre streger, mere luft.** `--flade` mod `--bund` adskiller allerede
   et kort fra siden. Brug `border` kun hvor kontrasten ikke rækker. Kort
   får 20 px polstring, ikke 16.

6. **Ringen er hero-figuren.** Genbrug `Fremdriftsring.tsx`. Den skal ALTID
   kode en rigtig 0-100-værdi — aldrig pynt. Højst tre ringe sammen.

7. **Bevægelse er kort og målrettet.** 150-200 ms, `ease-out`. Tal, der
   ændrer sig, tæller op. Ingen sideovergange, ingen parallax, intet der
   forsinker et tryk. Respektér `prefers-reduced-motion`.

8. **Trykflader er mindst 44 px.** Se sætningen om baren igen.

9. **Tomme tilstande siger, hvad man gør.** Ikke "ingen data" — men "Du er
   ikke i en Kanal endnu" med knappen lige der.

10. **Hentetilstande ligner ikke data.** `useQuery` giver `undefined`, mens
    den henter. Vis det, frem for et skelet man kan nå at aflæse forkert.

**Skrifttype:** systemskriften. Ikke Inter.

Oplægget bad oprindeligt om Inter fra Google Fonts, og det var forkert:
`vercel.json` sætter `font-src 'self'` og `style-src 'self'`, så et eksternt
skriftkald afvises, så snart CSP'en går fra Report-Only til håndhævet.
Selvhostning ville kræve en woff2 i `public/` og en ændring i
`vite.config.ts` — uden for afgrænsningen.

Løftet i typografien kommer fra skalaen, vægtene og `tabular-nums`, ikke fra
skriftsnittet. SF Pro og Roboto har begge ensbrede cifre og koster ingen
hentning.

---

## Skærmene, i prioriteret rækkefølge

Tag dem **én ad gangen**. Efter hver: appen skal kunne køre, og
`npm run check` skal være grøn. Lever ikke otte skærme på én gang.

### 1. Mig — størst gevinst

Ligger i dag som en flad stak: profiltop, tre tal i et gitter, et
promillekort, en emoji-stribe, fire knapper.

Her hører ringene hjemme. Tre stykker: **promille**, **dagens genstande**,
**nærmeste achievement**. Ét stort tal i midten af hver, etiket under.

Promillen har en særlig regel: den vises **kun**, når vægt og køn er udfyldt.
Ellers står der hvorfor. Gæt aldrig et tal — se `getMinPromille`, som
returnerer `konfigureret: false`.

Achievement-kortet er indgangen til trofæhylden. Emoji-striben skal lokke,
ikke informere.

### 2. Stilling — den mest sete skærm

Kanalens rangliste for i dag. Egen række er markeret. Guld/sølv/bronze på
de tre første (`--guld`, `--soelv`, `--bronze` findes).

Revolut-behandling: navnet og tallet bærer rækken, alt andet dæmpes.
Trykker man på en person, åbner personkortet.

### 3. Log-arket — den mest brugte handling

`( + )` i bundnavigationen. Seks kategorier, varianter under hver, og en
størrelse (Lille/Mellem/Stor).

Det skal kunne betjenes **med én tommel, hurtigt, uden at se nøje efter.**
"Dine sædvanlige" står øverst, fordi folk logger det samme igen og igen.

Arket lukker på trykket — det venter ikke på serveren. Bevar det.

### 4. Trofæhylden

Har allerede ringen og et badge-gitter. Stram typografi og luft. Badgene har
rigtige billeder i `public/assets/achievements/`.

### 5. Historik, Chat, Kort

Lettere hånd. Chatten har en fast skriver i bunden, som tastaturet ikke må
dække.

### 6. Check In — ✅ bygget

**Havde komplet backend og ingen skærm** — `checkIns.checkIn`, `checkOut`,
`getCheckInsForUser`. Det var ikke en detalje: `checkInStatus` styrer, om
ens position deles på Kortet, og om beacon-varslingen ser en.

Landede i Kort.tsx, ikke som egen skærm: det er dér, fraværet af en prik
allerede blev forklaret ("din position deles ikke, fordi …"), og Check In
er netop den handling, der retter den ene af de to grunde. Formularen (kun
et stednavn) og Meld-dig-ud-knappen står lige under statuslinjen. `venue`s
position sendes ikke særskilt — Kortets egen GPS-loop overtager, i det
øjeblik `checkInStatus` bliver sand.

`getCheckInsForUser` (historikken) er stadig uden UI — ingen skærm har bedt
om den, og at bygge én uden en efterspørgsel ville være at gætte.

### 7. Admin

Otte faner, fungerer. Lav den læsbar, ikke smuk. Lavest prioritet.

---

## Det vi ikke beder om

- **Ingen ny navigation.** To faner og ark. Ingen router, ingen ruter.
- **Ingen nye npm-pakker.** Ingen. Se kontrakten.
- **Ingen ændringer i `convex/`.** Opfind aldrig et endpoint. Mangler der
  et, så byg ikke skærmen — skriv det i stedet i leverancen.
- **Ingen nye skærme** ud over Check In.
- **Ingen attrap-data.** En skærm, der lyver, er værre end ingen skærm.

---

## Tre ting, der ikke må gå tabt

Migrationen rettede fejl, som et redesign nemt genindfører.

**Fortryd står i kvitteringen.** Efter en logning står en kvittering med
**Fortryd** i seks sekunder. Det er sekunderne lige efter et fejltryk, man
vil af med den igen. Flyt den ikke ind i en historik.

**Appen skal virke på dårlig forbindelse.** Kældre og festivaler. Log-arket
og profilen males fra sidste besøg via `useCachetQuery`, og logninger sendes
optimistisk. Fjern ikke de mønstre.

**De danske navne er data.** Kanal, Ballade, Brøndby IF, Check In, Sladesh,
Stilling, Øl, Lille/Mellem/Stor. Ordret, hver gang.

---

## Færdigt betyder

```
npm run check     # tre tsconfigs, grøn
npm run lint      # ingen nye advarsler
npm run build
```

På en telefonbredde: ingen vandret scroll, trykflader mindst 44 px, lyst tema
virker stadig.

Og til sidst: **skriv hvad du ikke kunne bygge, og hvorfor.** En liste over
det, der manglede et endpoint, er mere værd end en skærm, der ser rigtig ud
og henter ingenting.
