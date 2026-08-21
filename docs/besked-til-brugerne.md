# Besked til brugerne ved cutover

Udkast. **Læs det igennem og skriv det om, så det lyder som dig** — det er
dine venner, ikke en kundebase, og en besked, der lyder som en
release-note fra et firma, bliver ikke læst.

Der er to ting, folk skal vide, og kun to: at appen er ny, og at deres tal kan
have flyttet sig. Alt andet kan de selv opdage.

Send den **før** DNS skiftes, ikke efter. Får folk beskeden, mens de står med
den gamle app, ved de, hvad de skal se efter.

---

## Udkastet

> **SladeshApp er blevet bygget om 🍺**
>
> Samme adresse, samme login — men det hele er nyt indeni. Den er hurtigere,
> den virker nu, når der ikke er ordentlig dækning, og den kan installeres på
> hjemmeskærmen som en rigtig app.
>
> **Det skal du gøre:** luk appen HELT og åbn den igen. På iPhone: swipe den
> væk fra app-skifteren — det er ikke nok at trykke på hjem-knappen. Ellers
> risikerer du at sidde med den gamle udgave uden at vide det.
>
> **Og en ting mere:** dine tal kan have ændret sig. Det gamle system talte
> forkert for de fleste af os — det holdt en tæller ved siden af, og den kom
> ud af trit med, hvad man faktisk havde logget. Vi har regnet alt om ud fra
> de rigtige logninger, så tallene passer nu. For nogle betyder det færre
> genstande end før. Ingen har mistet noget, det var bare talt forkert.
>
> Havde du promillen slået til, skal du lige ind under **Mig →
> Indstillinger** og vælge køn og vægt igen, ellers regner den ikke.
>
> Chatten starter forfra. Den tømte sig alligevel selv hvert døgn.
>
> Skriv til mig, hvis noget ser mærkeligt ud.

---

## Hvad der ligger bag hver sætning

Så du kan svare på spørgsmål uden at grave i dokumentationen.

**"luk appen HELT"** — det gamle site kørte sin egen service worker på
`sladeshapp.dk`, og den serverer den gamle app fra sin egen cache, uanset hvor
domænet peger hen. Den bliver fortrængt, men først når alle faner er lukket.
Det er den ene ting, der ellers ville ligne, at DNS-skiftet ikke virkede. Se
`docs/produktion.md`, afsnit 6.

**"dine tal kan have ændret sig"** — 20 af 32 brugere havde en `totalDrinks`,
der ikke stemte med deres egne logrækker. Største afvigelse var 76. Migreringen
genberegner fra rækkerne, så tallene er rigtige nu. Det er derfor, formuleringen
er *"talt forkert"* og ikke *"vi har nulstillet"* — ingen har mistet noget.

**"vælge køn og vægt igen"** — seks brugere har `promille.gender = null`.
Widmark kræver begge dele, og uden dem regnes promillen ikke. Appen siger det
selv i indstillingerne, men det er bedre, de ved det på forhånd end at undre
sig over en tom kolonne.

**"Chatten starter forfra"** — beskeder blev ikke migreret. De ryddes
alligevel automatisk efter et døgn, så der var intet at tage med.

**Det, der IKKE står i beskeden, fordi ingen spørger om det:** stræk,
achievements, check-ins, beacons og hele drikkehistorikken er migreret 1:1.
Logins er uændrede — det er stadig Firebase, så adgangskoder og Google-konti
virker som før.

---

## Hvis nogen spørger til noget, der mangler

Fire ting fra den gamle app er der ikke, og det er med vilje:

| Væk | Svar |
|---|---|
| Push-varslinger | Udvælgelsen er bygget, selve leveringen mangler. Kommer. |
| Donationer / støtteside | Ikke porteret. |
| Kanaltemaer | Ikke porteret — appen har ét udtryk nu. |
| Admin-skærme | Styres fra Convex-dashboardet indtil videre. |
