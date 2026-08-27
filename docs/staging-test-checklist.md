# Staging-tjekliste

Manuel gennemgang af `beta.sladeshapp.dk`, før domænet flyttes. Opsætningen
af selve underdomænet står i [`deployment.md`](deployment.md), afsnit 4.

**Gør det på en telefon.** Appen er en telefonapp. Halvdelen af punkterne
herunder findes ikke på et skrivebord, og de fejl, der kun rammer en lille
skærm, er netop dem, en desktoptest ikke finder.

> **Beta kører mod produktionsdata.** Det, du logger, logges for alvor, og
> det, du sletter, er væk. Log gerne noget — det er sådan man tester — men
> gør det på din egen konto, og ryd op efter dig. Rør ikke andres rækker fra
> Admin, med mindre det er selve pointen med prøven.

Går et punkt galt: **stop, og skriv det ned.** Alt kan rettes nu, hvor
`sladeshapp.dk` stadig peger det gamle sted hen. Bagefter retter man det med
brugerne kiggende på.

---

## Før du går i gang

- [ ] `beta.sladeshapp.dk` åbner overhovedet — ingen certifikatadvarsel,
      ingen Vercel-fejlside.
- [ ] `sladeshapp.dk` **uden** `beta.` foran viser stadig den **gamle** app.
      Det er det vigtigste punkt på hele listen: staging må ikke have
      kostet noget for dem, der bruger appen i aften.
- [ ] Åbn med browserkonsollen fremme, og lad den være åben listen igennem.
      `Content Security Policy … Report Only`-linjer er forventede og
      blokerer ingenting — men **notér dem**. De er hele grunden til, at
      politikken kører i Report-Only. Se
      [`produktion.md`](produktion.md), afsnit 4.

---

## Login

- [ ] Log ind med en rigtig konto: email og adgangskode.
- [ ] Der er **ingen Google-knap**. Den blev fjernet; er den der, er beta
      bygget fra en gammel commit.
- [ ] Forkert adgangskode giver en læselig fejl på dansk — ikke en rå
      Firebase-kode og ikke en tom skærm.
- [ ] Genindlæs siden. Du er **stadig** logget ind.
- [ ] Log ud (Mig → Log ud), og log ind igen.

> Fejler login med `auth/unauthorized-domain`, er det ikke appen:
> `beta.sladeshapp.dk` mangler i Firebases authorized domains. Se
> [`deployment.md`](deployment.md), afsnit 4.

## Førstegangsforløbet

Kun hvis du har en konto, der aldrig har været i v4 — ellers spring over.

- [ ] En ny bruger bliver ført gennem forløbet frem for at lande på en tom
      skærm.
- [ ] Man kan melde sig ind i en Kanal med en invitationskode.
- [ ] En bruger uden Kanal får skærmen med 👋 og knappen "Meld dig ind i en
      Kanal" — ikke en stilling uden rækker.

## Check ind og check ud

Der er **ingen Check ind-knap** længere. Aftenens første loggede genstand
gør det samme, og `Check ins`-tallet på Mig tælles derfra.

- [ ] Log en genstand (se næste afsnit). Bagefter tæller `Check ins` på Mig
      én op.
- [ ] Åbn Kort. Din egen nål er der, og browseren har spurgt om
      placeringstilladelse.
- [ ] **Check ud**-knappen er der, mens du deler position.
- [ ] Tryk Check ud. Nålen forsvinder fra kortet, også for de andre.
- [ ] Efter check ud deles positionen ikke længere — genåbn kortet og
      bekræft, at du ikke er der.

## Drikkelogning

- [ ] Åbn "Log en genstand".
- [ ] De sædvanlige — dem du plejer at logge — står øverst.
- [ ] Søgefeltet finder en variant på en del af navnet.
- [ ] Tryk en variant. Arket lukker, og **stillingen flytter sig med det
      samme** — ikke efter et øjebliks venten.
- [ ] Kvitteringen nævner det, du loggede.
- [ ] Fortryd den igen. Den forsvinder ligeså hurtigt, som den kom.
- [ ] Genindlæs. Tallet er det, det skal være — den optimistiske opdatering
      og serveren er enige.

## Kanal-skift

- [ ] Knappen ved siden af kanalnavnet i toppen åbner kanalvælgeren.
- [ ] Dine Kanaler står der, og den aktive er markeret.
- [ ] Skift til en anden Kanal. Titlen, stillingen og underteksten skifter
      alle sammen — ingen af dem hænger fast på den forrige.
- [ ] Der er **ingen "Opret ny"** i arket. Kanaler oprettes i
      førstegangsforløbet og i Admin, ikke her.
- [ ] Meld dig ind med en invitationskode. En forkert kode giver en fejl,
      ikke en ny Kanal ved navn "SLA-4821".
- [ ] Kanalvælgeren findes **ikke** på Mig-fanen. Det er med vilje.

## Stillingen

- [ ] Stillingen er det første, man ser i Kanal-fanen — ingen tryk for at nå
      den.
- [ ] Tallene ligner virkeligheden. Sammenlign med din egen historik.
- [ ] Log en genstand, mens stillingen er synlig: rækkerne **glider** på
      plads, de hopper ikke.
- [ ] Få en anden til at logge noget. Din skærm flytter sig, uden at du
      henter noget.
- [ ] Tryk en række. Personkortet åbner med den rigtige person.
- [ ] Promillen vises. Er den tom, mangler kontoen et køn under Mig →
      Indstillinger — det er forventet for de brugere, migreringen fandt
      uden.

## Achievements

- [ ] Mig → trofæhylden åbner.
- [ ] Låste og oplåste trofæer kan skelnes fra hinanden.
- [ ] Fremdriften på et lukket trofæ passer med dine rigtige tal.
- [ ] Billederne er der — ingen brudte ikoner.
- [ ] Log noget, der låser et trofæ op, hvis du kan: oplåsningen vises.

## Admin

Kræver en konto med `isAdmin`. Admin-knappen er skjult for alle andre.

- [ ] Admin-knappen er **ikke** synlig på en almindelig konto.
- [ ] Admin åbner, og alle otte områder kan vælges: Oversigt, Drikkevarer,
      Brugere, Kanaler, Beacons, Broadcast, Donorer, Tema.
- [ ] **Oversigt** viser tal, ikke nuller.
- [ ] **Drikkevarer** viser kataloget. Opret en variant, se den dukke op i
      logarket, og slet den igen.
- [ ] **Brugere** kan slå en bruger op.
- [ ] **Kanaler** viser Kanalerne med deres invitationskoder.
- [ ] **Tema** kan sættes og fjernes, og skiftet ses i appen.
- [ ] Log ind som en almindelig bruger og prøv at nå en admin-handling.
      Serveren afviser — `requireAdmin` er spærren, ikke den skjulte knap.

## Er den en app

- [ ] Chrome/Android: menuen tilbyder "Installer app" eller "Føj til
      startskærm". Safari/iOS: Del → Føj til hjemmeskærm.
- [ ] Ikonet på hjemmeskærmen er den hvide shaka på flaskegrøn — ikke et
      skærmbillede af siden.
- [ ] Åbnet fra hjemmeskærmen er der **ingen adresselinje**.
- [ ] Den installerede app hedder det, den skal, under ikonet.

> Beta og `sladeshapp.dk` er to forskellige origins. En app installeret fra
> beta bliver liggende som sin egen efter cutoveren og peger stadig på beta.
> Afinstallér den, når prøven er ovre.

## Uden net

- [ ] Åbn appen, slå flytilstand til, genindlæs. Der kommer en app frem —
      ikke en hvid skærm og ikke dinosauren.
- [ ] Stillingen står der stadig, med sidste kendte tal.
- [ ] Efter et par sekunder står der *"Ingen forbindelse · det du logger,
      sendes når der er dækning"*.
- [ ] Log en genstand i flytilstand. Den lægger sig på stillingen.
- [ ] Slå flytilstand fra. Genstanden bliver **liggende** — nu er den sendt
      for alvor. Genindlæs og bekræft.

## Til sidst

- [ ] Gennemgangen efterlod ingen `Report Only`-linjer i konsollen, du ikke
      har skrevet ned.
- [ ] `sladeshapp.dk` viser **stadig** den gamle app, og den virker.
- [ ] Ryd op efter dig: fortryd de testlogninger, der ikke skulle have været
      der.

---

## Tillæg: det der også findes

Denne liste blev bestilt uden Chat, beacons og Sladesh, ud fra at de ikke
var i UI'et endnu. **Det er de.** `src/ui/Chat.tsx`,
`src/ui/SladeshOvertagelse.tsx` og beacon-visningen i `src/ui/Kort.tsx` er
merged, og Chat og Kort er to af de fire faner, en tester vil trykke på med
det samme.

De står derfor her, adskilt, så listen ovenfor er den, der blev bedt om, og
det her er det, der ellers vil blive prøvet af. Slet afsnittet, hvis de
skal testes for sig senere.

- [ ] **Chat:** skriv en besked. Den står der med det samme, og en anden
      kan se den.
- [ ] Ulæst-prikken kommer på Chat-fanen, når en anden skriver, og går væk,
      når du har set beskeden.
- [ ] **Kort:** aktive beacons vises. Åbn en, og se hvad den siger.
- [ ] Opret en beacon fra Admin → Beacons, og se den dukke op på kortet.
- [ ] **Sladesh:** send en fra et personkort. Modtageren får bjælken
      "🍺 … har sladeshet dig" med et ur, der tæller ned.
- [ ] Afsenderen ser "Venter på at … gennemfører".
- [ ] Gennemfør den som modtager, med et bevisbillede. Afsenderen får at
      vide, hvordan det gik.
- [ ] Lad en løbe ud uden at gøre noget. Uret tømmes, og bjælken forsvinder.
- [ ] **Broadcast:** send et fra Admin → Broadcast. Bjælken vises i appen.
