# Designlærred — redesignforslag

Mockup af hele appen i **retning A · flaskegrøn på creme**, bygget på appens
egne tokens fra `src/index.css`. Et **forslag**, ikke noget der er besluttet —
intet i `src/` er ændret ud fra det her endnu.

Baggrunden: de syv skærme i `docs/redesign-oplaeg.md` er kørt, men skærmene
føltes stadig flade. Retningen er hentet fra tre apps, brugeren pegede på —
Oura, Strava og Syd for Solen.

## Paletten (retning A)

| Rolle | Lys |
|---|---|
| `--bund` | `#F2EEE4` |
| `--flade` | `#FCFAF5` |
| `--kant` | `#E3DDD0` |
| `--tekst` | `#1A1C19` |
| `--tekst-daempet` | `#5F6660` |
| `--tekst-svag` | `#676B63` |
| `--accent` | `#1B4D3E` |
| `--accent-mork` | `#123528` |
| `--accent-tekst` | `#F4F1E9` |
| `--accent-blod` (ny) | `#DCE8E0` |
| `--fare` | `#B33A28` |
| `--guld` / `--soelv` / `--bronze` | `#856300` / `#656B71` / `#8F5D3D` |

## De fem strukturelle greb

Uafhængige af farve, gælder begge temaer — se `System.dc.html`:

1. **Dybere bund** i mørk (`#0e0f13` → `#08090c`).
2. **Flydende bundnavigation** med `( + )` som midterknap, streg-SVG i stedet
   for emoji.
3. **Stimen som ugestribe** på appens egne data (`currentDayStreak` plus
   drikkedagene fra `historik`).
4. **Ét nyt typografisk trin**, `--tekst-hero: 56px`, til skærmens hovedtal.
5. **Bjælker frem for ringe i lister** — ringen bliver hero-figuren alene.

## Afklaret undervejs

- **`--accent` har nu en farve per tema.** Det var det ene token, der skulle
  flyttes: mørk beholder ravgul, kun lys bliver grøn. Alle accenttonede flader
  er `color-mix(in srgb, var(--accent) N%, var(--flade))` og fulgte med af sig
  selv — ingen komponent skulle røres.
- **`--medgang` og accenten er samme familie i lys, og det er i orden.** De
  står aldrig ved siden af hinanden; kravet er, at `--medgang` kan skelnes fra
  `--fare`, fordi `.kvitteringstekst` og `.fejl` deler plads.
- **Kontrasten er målt, ikke skønnet.** Første udkast til paletten havde fire
  farver under WCAG AA mod cremen — heriblandt `--tekst-svag`, som bærer de
  11px versaletiketter, på 2,7:1. Tallene i tabellen ovenfor er de rettede,
  og alle 16 målte par ligger over 4,5:1. Medaljerne er patineret metal frem
  for neon af samme grund: `.plads` er 13px fed, altså almindelig tekst efter
  WCAG.

## Stadig åbent

- **Appikonet er koral** ("den hvide shaka på koral", `docs/produktion.md`
  afsnit 6a). Med grøn accent i lysmode ligner appen ikke sit eget ikon på
  hjemmeskærmen — enten tegnes ikonet om, eller uoverensstemmelsen accepteres
  bevidst.
- **De fem strukturelle greb er ikke bygget endnu.** Kun paletten er kørt ud
  i koden.

## Bevidst udeladt

Syd for Solens fotokakler (appen har ikke billedbiblioteket — undtagen
Trofæhylden, hvor badgene ER rigtige billeder), en display-skrift
(`vercel.json` sætter `font-src 'self'`, så et eksternt skriftkald afvises,
når CSP'en håndhæves) og lys som *udgangspunkt* — mørk er fortsat standard,
fordi appen bruges om aftenen i en bar.

Tallene i mockuppen — Frederik med 11 genstande, 0,82 ‰ og så videre — er
opdigtede eksempler. Strukturen er ægte, indholdet er ikke.

## Filerne

Lærredet har tre sider.

**Retning A** — den valgte retning på alle skærme:

| Fil | Skærm |
|---|---|
| `Main.dc.html` | Mig |
| `Stilling.dc.html` | Stilling |
| `LogArk.dc.html` | Log-arket |
| `Trofaehylden.dc.html` | Trofæhylden |
| `Chat.dc.html` | Chat |
| `Kort.dc.html` | Kort og Check In |
| `Historik.dc.html` | Historik |
| `Admin.dc.html` | Admin |
| `Palette.dc.html` | Paletten og forbeholdene |

**Fravalgt** — optegnelse over hvad der blev overvejet:
`DirectionB.dc.html` (koral på knogle, matcher appikonet) og
`DirectionC.dc.html` (indigo med lime).

**Mørk** — forrige runde: `Moerk.dc.html` og `System.dc.html`.

Den seedede `sladesh-redesign.html` er **ikke** i git: den er en genereret
pakke på ~2,5 MB med hele canvas-editoren bagt ind, og den bygges igen fra
filerne ovenfor.

## Byg lærredet igen

Kræver `/design`-skillen (den leverer skabelonen og `seed-canvas.mjs`):

```bash
cd design
node "<skill>/seed-canvas.mjs" \
  --template "<skill>/payload.template.html" \
  --out sladesh-redesign.html \
  --title "Sladesh Redesign" \
  --artboard Main.dc.html --artboard Stilling.dc.html \
  --artboard LogArk.dc.html --artboard Trofaehylden.dc.html \
  --artboard Chat.dc.html --artboard Kort.dc.html \
  --artboard Historik.dc.html --artboard Admin.dc.html \
  --artboard Palette.dc.html \
  --artboard DirectionB.dc.html --artboard DirectionC.dc.html \
  --artboard Moerk.dc.html --artboard System.dc.html \
  --canvas canvas.json
```

Rediger altid `.dc.html`-filerne og seed forfra — aldrig den seedede fil
direkte.
