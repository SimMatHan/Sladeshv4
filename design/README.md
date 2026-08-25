# Designlærred — redesignforslag

Mockup af Mig, Stilling og en flydende bundnavigation, bygget på appens
egne farvetokens fra `src/index.css`. Et **forslag**, ikke noget der er
besluttet — intet i `src/` er ændret ud fra det her endnu.

Baggrunden: de syv skærme i `docs/redesign-oplaeg.md` er kørt, men skærmene
føltes stadig flade. Forslaget er hentet fra tre apps, brugeren pegede på —
Oura, Strava og Syd for Solen — og består af fem greb:

1. **Dybere bund.** `--bund` fra `#0e0f13` til `#08090c`. Alle tre
   referencer sidder på nærsort.
2. **Flydende bundnavigation.** En pille, der svæver over bunden, med
   `( + )` som midterknap — som Stravas Registrer-knap. Streg-SVG i stedet
   for emoji i navigationen.
3. **Stimen som ugestribe.** Stravas mønster med appens egne data
   (`currentDayStreak` plus drikkedagene fra `historik`). Det er den, der
   giver Mig-skærmen noget, der bevæger sig.
4. **Ét tal, der er stort nok.** Et sjette typografisk trin,
   `--tekst-hero: 56px`, til skærmens ene hovedtal.
5. **Bjælker frem for ringe i lister.** Ringen bliver hero-figuren alene.

Bevidst udeladt: Syd for Solens fotokakler (appen har ikke billedbiblioteket
— undtagen Trofæhylden, hvor badgene ER rigtige billeder), en display-skrift
(`vercel.json` sætter `font-src 'self'`, så et eksternt skriftkald afvises,
når CSP'en håndhæves) og det lyse tema som udgangspunkt.

Tallene i mockuppen — Frederik med 11 genstande, 0,82 ‰ og så videre — er
opdigtede eksempler. Strukturen er ægte, indholdet er ikke.

## Filerne

| Fil | Hvad |
|---|---|
| `Main.dc.html` | Mig-skærmen |
| `Stilling.dc.html` | Stillingen |
| `System.dc.html` | De fem greb, og det der bevidst er udeladt |
| `canvas.json` | Placeringen af de tre artboards på lærredet |

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
  --artboard Main.dc.html \
  --artboard Stilling.dc.html \
  --artboard System.dc.html \
  --canvas canvas.json
```

Rediger altid `.dc.html`-filerne og seed forfra — aldrig den seedede fil
direkte.
