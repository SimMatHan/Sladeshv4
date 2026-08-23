# Prompten

Det, der gives til værktøjet. Kontrakten og oplægget er bilagene.

---

## Opgaven

Du skal redesigne **hele** SladeshApps brugerflade — ikke enkelte skærme.
Resultatet skal fremstå som ét sammenhængende produkt: konsistent,
brugervenligt og minimalistisk.

Læs disse to filer, før du skriver en linje kode:

- **`docs/redesign-kontrakt.md`** — hvad der må og ikke må ændres, hvilke
  Convex-funktioner der findes, og hvad "færdigt" betyder. Reglerne er
  ufravigelige.
- **`docs/redesign-oplaeg.md`** — den visuelle retning og skærmene i
  prioriteret rækkefølge.

Kvittér først. Skriv, kort, hvad du har forstået: hvad du må røre, hvad du
ikke må, hvor mange npm-pakker du må tilføje, og hvilke tre ting der ikke må
gå tabt. Rammer du forkert der, er resten spildt.

---

## Systemet før skærmene

**Byg designsystemet først. Rør ingen skærm, før det står.**

Det er dét, der afgør, om appen bliver konsistent. Bygger du skærm for skærm
og styler hver enkelt for sig, ender du med tolv skærme, der ligner tolv
apps. Bygger du systemet først, arver hver skærm det gratis.

Systemet er:

1. **Tokens** i `:root` — farver, radier, mål. Der findes allerede nogle;
   udvid dem frem for at skrive faste værdier i komponenterne. Efter dig må
   der ikke stå ét hex-tal uden for `:root`.
2. **Én typografisk skala.** `40 / 28 / 17 / 13 / 11 px`. Ikke flere trin.
   Bruger du 15 px ét sted, har du brudt systemet.
3. **Én afstandsskala.** `4 / 8 / 12 / 16 / 20 / 32`. Ikke 14, ikke 18.
4. **Én af hver ting.** Ét kort. Én knap med varianter. Ét ark. Én liste. Én
   tom tilstand. Én hentetilstand. Findes komponenten, så genbrug den —
   skriv ikke en variant til.

Skriv systemet ned øverst i `src/index.css` som en kort kommentar, så det kan
håndhæves af den næste, der rører filen.

---

## Hvad minimalistisk betyder her

Ikke "gråt og tomt". Konkret:

- **Fjern før du tilføjer.** Kan en streg erstattes af luft, så gør det. Kan
  en etiket udelades, fordi tallet taler for sig selv, så udelad den.
- **Ét primært tal per skærm.** Resten er støtte og skal se sådan ud.
- **Ingen dekoration.** Hver form skal have en opgave. En ring skal kode en
  værdi. En farve skal betyde noget.
- **Ingen dobbeltinformation.** Står tallet, behøver bjælken det ikke også.

## Hvad brugervenligt betyder her

Appen bruges **om aftenen, i en bar, på en telefon, af nogen der har fået et
par stykker.** Alt følger af det:

- Trykflader mindst 44 px. Ingen undtagelser.
- Den hyppigste handling er færrest tryk væk. Logning er hyppigst.
- Ingen handling må vente på serveren, før den kvitterer.
- Tomme tilstande siger, hvad man gør — ikke "ingen data".
- Hentetilstande må ikke kunne forveksles med data.
- Alt skal kunne læses på armslængde i et mørkt lokale.

---

## Fuld dækning

Hele appen. Ingen skærm efterlades i den gamle stil — en halvt redesignet app
er værre end en, der ikke er rørt.

**Skallen og de fælles dele**

- [ ] `App.tsx` — skallen, bundnavigation, fanestribe, kvittering, login
- [ ] `Ark` · `Faner` · `Avatar` · `Fremdriftsring` · `Forbindelse` ·
      `Broadcastbjaelke`

**Kanal-fanen**

- [ ] `Stilling` · `Chat` · `Kort` · `Historik`

**Mig-fanen**

- [ ] `Mig` · `Achievements` · `Indstillinger` · `ProfilFelter`

**Ark og overlejringer**

- [ ] `LogArk` · `KanalVaelger` · `Personkort` · `SladeshOvertagelse`

**Resten**

- [ ] `Onboarding` — førstegangsforløbet
- [ ] `Admin` — otte faner. Læsbar, ikke smuk. Lavest prioritet
- [ ] **Check In** — har komplet backend og ingen skærm. Byg den enkleste
      ting, der virker

Arbejd i oplæggets rækkefølge. **Én skærm ad gangen**, og efter hver: appen
kører, og `npm run check` er grøn. Lever ikke tolv skærme på én gang — så kan
ingen vurdere dem.

---

## Før du leverer

Gå din egen kode igennem og svar på hvert punkt:

1. Har jeg rørt en fil på forbudslisten?
2. Har jeg tilføjet en npm-pakke?
3. Står der et hex-tal eller en px-værdi uden for `:root`, som burde være et
   token?
4. Bruger to skærme forskellige mønstre til det samme?
5. Har jeg opfundet et Convex-endpoint, der ikke står i kontrakten?
6. Virker det lyse tema stadig?
7. Er der vandret scroll på en telefonbredde?

```
npm run check     # tre tsconfigs, grøn
npm run lint      # ingen nye advarsler
npm run build
```

Og til sidst: **skriv hvad du ikke kunne bygge, og hvorfor.** En liste over
det, der manglede et endpoint, er mere værd end en skærm, der ser rigtig ud
og henter ingenting.
