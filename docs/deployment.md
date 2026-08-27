# Deployment: de to Convex-deployments, Vercels tre miljøer og staging

Opslagsværk. Hvad der findes hvor, hvad der opdaterer hvad, og hvilken
DNS-record staging-underdomænet kræver.

**Køreplanen for selve cutoveren står i [`produktion.md`](produktion.md)** —
den er en rækkefølge, der skal køres én gang. Denne fil er det modsatte: den
skal kunne slås op i, når man har glemt hvilket deployment `convex deploy`
egentlig rammer.

Der står **ingen nøgleværdier** i denne fil, og der skal ikke komme nogen.
URL'er og hemmeligheder slås op med `npx convex env list` og i Vercels
dashboard, hvor de i forvejen er.

---

## 1. Hvad der står i dag

| Del | Tilstand |
|---|---|
| Vercel-projekt | `sladeshv4`, i teamet `simons-projects-44d73029`. Koblet til GitHub-repoet — hver PR får sin egen preview-udrulning, og `main` udrulles som produktion |
| Convex | Ét projekt, to deployments: dev og produktion. Produktionen har allerede fået de migrerede data |
| `sladeshapp.dk` | Peger på **Firebase Hosting** — det gamle site, `SimMatHan/Sladesh2.0`. Urørt, og bliver det, indtil cutoveren |
| Firebase | Ét projekt, `sladeshultimate-1`, delt af begge apps. Kun Authentication bruges fra v4 |

Begge apps kan køre samtidig: den gamle læser Firestore, den nye læser Convex,
og de deler kun brugerkontiene. Se advarslen om divergerende databaser i
[`produktion.md`](produktion.md), afsnit 6c.

---

## 2. Dev og produktion er to databaser

Det er den ene ting, det er værd at have helt på plads. De to deployments
ligger i **samme Convex-projekt**, men de deler ingenting: ikke data, ikke
funktioner, ikke miljøvariabler. En ændring det ene sted findes ikke det
andet, før nogen udtrykkeligt sender den derover.

| | **dev** | **produktion** |
|---|---|---|
| Hvem har den | Én pr. udvikler, personlig | Én, delt |
| Opdateres af | `npx convex dev` (bliver kørende og pusher ved hver gemt fil)<br>`npx convex dev --once` (pusher én gang og stopper) | `npx convex deploy` — eller Vercels build, som kalder præcis den kommando |
| URL | Skrives til `.env.local` som `VITE_CONVEX_URL` | Skrives ud af `convex deploy`. Slås ellers op i dashboardet |
| Miljøvariabler sættes med | `npx convex env set NAVN vaerdi` | `npx convex env set --prod NAVN vaerdi` |
| Hvilke variabler står der | `VITE_FIREBASE_PROJECT_ID`<br>`TILLAD_TESTFUNKTIONER=ja` | `VITE_FIREBASE_PROJECT_ID` — og **kun** den, når ingen migrering kører |
| Data | Legetøj. Smid det væk, når det generer | Rigtige brugere, rigtig historik |
| `convex/testing.ts` | Åben, og smoke-testen bruger den | Død kode. Skal blive ved med at være det |

**`--prod` er ikke pynt.** Uden flaget rammer `env set`, `env list` og
`run` dit dev-deployment, og kommandoen lykkes — den gør bare ingen forskel
det sted, du troede.

**`convex deploy` opdaterer aldrig dev.** Efter et produktions-deploy er dit
dev-deployment stadig på den forrige kode. Det er den hyppigste forvirring i
projektet, og den viser sig som en smoke-test, der pludselig ikke kan finde
`testing:testmiljoStatus`. Kuren er `npx convex dev --once`.

**`convex dev` opdaterer aldrig produktion.** Derfor kan man arbejde løs uden
at nogen bruger mærker noget.

### Hvornår bruger man hvad

- **Under udvikling:** `npm run dev`. Den starter `convex dev` og Vite sammen,
  og alt rammer dit eget dev-deployment.
- **Før en PR:** `npm run check` og `npm run test:logic` lokalt.
  `npm run smoke-test` kræver et dev-deployment med
  `TILLAD_TESTFUNKTIONER=ja` og nægter at køre mod produktion.
- **Til produktion:** rør normalt ikke `npx convex deploy` i hånden. Vercels
  build gør det selv, når `main` udrulles, og så kommer frontend og backend
  fra samme commit. Kør den kun manuelt, hvis backenden skal frem *før* en
  frontend — eller allerførste gang, hvor produktions-deploymentet slet ikke
  findes endnu og skal provisioneres.

### Hvor finder jeg URL'erne

```bash
npx convex dashboard          # åbner projektet; begge deployments står der
npx convex env list           # dev — variabelnavne og -værdier for dev
npx convex env list --prod    # produktion
```

Dev-URL'en står desuden i din egen `.env.local`, som er git-ignoreret og
skrevet af `convex dev`. Produktions-URL'en skrives af `convex deploy` og
optræder i Vercels byggelog.

---

## 3. Vercels tre miljøer

| Miljø | Hvornår | Convex-backend | `CONVEX_DEPLOY_KEY` |
|---|---|---|---|
| Production | Push til `main` | **produktion** — `convex deploy` kører som en del af buildet | ✅ sat |
| Preview | Alle andre grene og PR'er | **dev** — via `VITE_CONVEX_URL` sat i Vercel | ❌ må ikke sættes |
| Development | Lokalt, `vercel dev`. Bruges ikke her | — | — |

`scripts/vercel-build.sh` forgrener sig på, om `CONVEX_DEPLOY_KEY` findes:
er den der, køres `npx convex deploy --cmd 'npm run build'`; er den ikke,
bygges kun frontenden mod den `VITE_CONVEX_URL`, der allerede står i miljøet.

Nøglen findes derfor **kun** på Production. Det er hele spærren mellem en
vilkårlig feature-gren og produktionens backend. Sætter man den på Preview,
kan enhver PR pushe schema-ændringer til de rigtige brugeres database.

Den fulde variabelmatrix og begrundelserne — hvorfor `VITE_*` ikke skal
markeres Sensitive, hvorfor `CONVEX_DEPLOY_KEY` skal — står i
[`produktion.md`](produktion.md), afsnit 4.

---

## 4. Staging: `beta.sladeshapp.dk`

### Hvorfor et underdomæne

`<projekt>.vercel.app` kan allerede bruges til at prøve appen af, og
[`produktion.md`](produktion.md) afsnit 6a beskriver netop den gennemgang.
Et rigtigt underdomæne giver tre ting oveni, som `.vercel.app` ikke kan:

1. **Det ligner det, cutoveren bliver.** Samme domæne-rod, samme cookies,
   samme service-worker-scope-regler. Går noget i stykker af, at appen
   flytter til `sladeshapp.dk`, opdager man det her først.
2. **Et domæne, man kan give til en tester** uden at forklare hvad et
   generet Vercel-værtsnavn er.
3. **Det kan installeres på en hjemmeskærm og blive liggende.** Preview-URL'er
   skifter for hver udrulning; `beta.sladeshapp.dk` gør ikke.

Og det vigtige: **det rører ikke `sladeshapp.dk`.** Roddomænets records
peger fortsat på Firebase Hosting, det gamle site svarer som altid, og
brugerne mærker ingenting. Et underdomæne er en ny, selvstændig record ved
siden af de eksisterende — ikke en ændring af dem.

### Hvad beta skal servere

Der er to måder, og de giver forskellige ting:

| | **Produktionsudrulningen** (anbefalet) | **En gren** |
|---|---|---|
| Sådan | Tilføj domænet i Vercel uden at binde det til en gren | Bind domænet til fx grenen `beta` |
| Backend | Convex **produktion** — de rigtige, migrerede data | Convex **dev** — legetøjsdata |
| Bygges med | Production-variabler | Preview-variabler |
| Tester du | Præcis det, `sladeshapp.dk` kommer til at servere | Kode, der ikke er merged endnu |

**Vælg produktionsudrulningen.** Formålet med beta er at have prøvet det
rigtige af, før domænet flyttes — og det kan man kun, hvis beta og
`sladeshapp.dk` senere serverer det samme. Med den model er selve cutoveren
at tilføje endnu et domæne til det samme projekt, og intet andet ændrer sig.

> Det betyder også, at beta kører mod **rigtige brugerdata**. Det, du gør på
> beta, sker for alvor. Se checklisten i
> [`staging-test-checklist.md`](staging-test-checklist.md), som er skrevet
> med det for øje.

### I Vercel

Vercel → projektet `sladeshv4` → **Settings → Domains → Add** →
`beta.sladeshapp.dk`.

Vercel svarer med den record, den vil have. **Læs den, og brug den** —
afsnittet nedenfor er hvad den plejer at sige, ikke hvad den siger.

### DNS-recorden — det du skal tilføje hos registratoren

Én record. Den tilføjes ved siden af de eksisterende; ingen eksisterende
record skal ændres eller slettes.

| Felt | Værdi |
|---|---|
| **Type** | `CNAME` |
| **Navn** / Host / Name | `beta`<br>*(Nogle registratorer vil have hele navnet: `beta.sladeshapp.dk`. Skriv aldrig begge dele — `beta.sladeshapp.dk.sladeshapp.dk` er den klassiske fejl her.)* |
| **Værdi** / Target / Points to | `cname.vercel-dns.com` |
| **TTL** | Lad standarden stå. Er der intet valg, så `3600` |
| **Proxy** | **Fra.** Kun relevant hos Cloudflare: den orange sky skal være grå, ellers terminerer Cloudflare TLS, og Vercel kan ikke udstede certifikatet |

**Tjek værdien mod dashboardet, før du taster.** Vercel er begyndt at udlevere
regionsspecifikke mål — noget i retning af `cname.vercel-dns-017.com` — og
det er den værdi, Vercel viser for *dette* projekt, der gælder. `cname.vercel-dns.com`
ovenfor er standardværdien, ikke en garanti.

**Tilføj ikke en A-record for `beta`.** A-recorden mod Vercel (`76.76.21.21`)
findes til roddomæner, der ikke kan bære en CNAME. `beta` er et
underdomæne og skal have en CNAME.

**Rør ikke `sladeshapp.dk` selv.** Hverken A-, ALIAS-, ANAME- eller
CNAME-recorden for roddomænet og `www`. De peger på Firebase Hosting, og det
gamle site skal blive ved med at virke.

Når recorden er ude, går der typisk minutter, men op til et par timer.
Vercel viser **Valid Configuration**, når den kan se den, og udsteder selv
certifikatet derefter.

### Firebase skal kende domænet — ellers dør login

Firebase Console → Authentication → **Settings → Authorized domains** →
Add domain → `beta.sladeshapp.dk`.

Uden den afviser Firebase hvert eneste login fra beta med
`auth/unauthorized-domain`, og fejlen viser sig først, når nogen prøver at
logge ind — ikke ved udrulningen. Tilføj den samtidig med DNS-recorden, så
det ikke bliver den fejl, der spilder den første testaften.

`<projekt>.vercel.app` bør stå der i forvejen.

### Når beta ikke skal bruges længere

Fjern domænet i Vercel **først**, derefter CNAME-recorden. Den omvendte
rækkefølge efterlader en record, der peger på ingenting, og det er værre end
ingen record: den svarer, den svarer bare forkert.

---

## 5. Fejl, der er specifikke for staging

| Symptom | Årsag |
|---|---|
| Vercel siger `Invalid Configuration` i timevis | CNAME'en er ikke ude, eller navnet blev til `beta.sladeshapp.dk.sladeshapp.dk`. Slå den op udefra: `dig beta.sladeshapp.dk CNAME +short` |
| `beta` svarer, men med et certifikatadvarsel | Cloudflare-proxy er tændt. Sluk den orange sky |
| `auth/unauthorized-domain` ved login på beta | Domænet mangler i Firebases authorized domains |
| Beta viser dev-data i stedet for de rigtige | Domænet er bundet til en gren og bygges derfor med Preview-variabler. Se afsnit 4 |
| `sladeshapp.dk` er begyndt at opføre sig mærkeligt | Så blev der rørt ved mere end `beta`. Sammenlign roddomænets records med det, de var før |
