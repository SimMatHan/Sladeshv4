# Kanaltemaer

Denne fil beskriver, hvordan festivaltemaer virker i dag, og hvad du skal
gøre for at føje et nyt til. Den er skrevet, så et fremtidigt tema kan
tilføjes ved at følge en opskrift — uden at først skulle læse `Kanaltema.tsx`,
`index.css` og `convex/indstillinger.ts` for at forstå samspillet.

---

## 1. Hvordan det virker i dag

Tre dele spiller sammen:

1. **`convex/indstillinger.ts`** — `getBalladeTema` / `setBalladeTema`.
   Gemmer ÉT globalt valg: `"" | "copenhell" | "odays"`. Tom streng betyder
   "intet tema". Kun admin kan sætte det (se Admin-arkets temavælger).
2. **`src/ui/Kanaltema.tsx`** — en headless komponent (returnerer `null`),
   monteret i `App.tsx`. Den slår temaet op, slår Kanalens navn op, og hvis
   Kanalens navn er `"Ballade"` OG et tema er valgt, sætter den
   `data-tema="copenhell"` (eller `"odays"`) på `<html>`. Ellers fjerner den
   attributtet.
3. **`src/index.css`** — under overskriften *kanaltemaer* overskriver
   `:root[data-tema="copenhell"]` og `:root[data-tema="odays"]` en delmængde
   af farve-tokens.

Selve malingen er altså bare CSS custom properties, der skifter værdi, fordi
et attribut kom eller gik. Ingen inline styles, ingen animation i JS.

**Temaet er globalt i data, men lokalt i visning.** Serveren kender kun
temaets navn — ikke hvilken Kanal det gælder. Koblingen til Kanalen
`"Ballade"` sidder alene i `Kanaltema.tsx` (konstanten `TEMA_KANAL`). Det
betyder, at temaet kun males, mens brugerens aktive Kanal ER Ballade — skifter
man til en anden Kanal, forsvinder farverne, selvom admin stadig har temaet
slået til.

---

## 2. Hvorfor navn og ikke id

Kobl **aldrig** et tema til en Kanal via dens `_id`. Det gamle repo
(Firebase) gjorde det:

```ts
const BALLADE_CHANNEL_ID = "H9nTuTPTWoA7E2kXOxxB";
```

Det id var et Firestore-dokument-id. Det findes ikke i Convex — hver Kanal
fik et nyt id ved migreringen. En ordret portering af den linje ville
oversætte rent, typetjekke grønt, og aldrig matche noget som helst.

Kanalnavnene er derimod kanoniske og bevares ordret gennem hele migreringen
(se `docs/redesign-kontrakt.md`, afsnit 5). Nøgl derfor altid på **navnet**:

```ts
const TEMA_KANAL = "Ballade";
// ...
kanal?.name === TEMA_KANAL
```

Omdøbes Kanalen i databasen, holder temaet op med at male. Det er den
rigtige måde at fejle på — ingen farver er bedre end farver på den forkerte
Kanal.

---

## 3. Hvilke tokens der må overskrives

Et tema overskriver **kun** de tokens, der bærer dets identitet:

```css
--bund
--flade
--flade-hvaelvet
--kant

--tekst
--tekst-daempet
--tekst-svag

--accent
--accent-mork
--accent-tekst
```

Det svarer til baggrund, kort/felt-flader, kanter, tekst i tre styrker, og
accentfarven med dens mørke variant og kontrastfarve.

**Rør aldrig disse, uanset tema:**

```css
--fare      /* fejl, farlig promille, sletning */
--medgang   /* succes, fremgang */
--guld
--soelv
--bronze    /* medaljepladser i stillingen */
```

De betyder noget bestemt ét sted i appen (fejl er rødt, guld er guld), og
skal blive ved med at betyde det samme, uanset hvilket tema der er aktivt. Et
tema, der farver `--fare` om, gør fejlbeskeder utydelige i netop den
situation, hvor de skal ses tydeligst.

Rør heller ikke `--radius`, `--navhoejde` eller andre måltokens — et
festivaltema er en farvepalet, ikke et andet layout.

---

## 4. Sådan tilføjer du et nyt tema

Brug Copenhell eller O Days i `src/index.css` som skabelon. Trinene:

1. **Læg temaet i `BALLADE_TEMAER`** i `convex/indstillinger.ts`:
   ```ts
   export const BALLADE_TEMAER = ["", "copenhell", "odays", "dit-tema"] as const;
   ```
   Dette er en ændring i `convex/**` og kræver derfor godkendelse uden for
   det almindelige UI-redesign-spor (se `docs/redesign-kontrakt.md`, afsnit 1)
   — men er nødvendig, da `setBalladeTema` afviser ukendte værdier.

2. **Tilføj admin-valgmuligheden** i det Ark, der viser temavælgeren (Admin),
   så `setBalladeTema({ tema: "dit-tema" })` kan kaldes.

3. **Tilføj en ny CSS-blok** i `index.css` under *kanaltemaer*:
   ```css
   /* Dit-tema — kort beskrivelse af paletten. */
   :root[data-tema="dit-tema"] {
     --bund: #...;
     --flade: #...;
     --flade-hvaelvet: #...;
     --kant: #...;

     --tekst: #...;
     --tekst-daempet: #...;
     --tekst-svag: #...;

     --accent: #...;
     --accent-mork: #...;
     --accent-tekst: #...;
   }
   ```
   Kun de tolv tokens fra afsnit 3 — intet andet.

4. **Test kontrast.** `--tekst` mod `--bund`/`--flade`, og `--accent-tekst`
   mod `--accent`, skal begge bestå WCAG AA. Temaerne er mørke i sig selv og
   vinder derfor over det lyse tema (se afsnit 5) — det er den eneste
   kontrast, der er relevant.

5. **`Kanaltema.tsx` skal ikke ændres**, medmindre det nye tema hører til en
   anden Kanal end Ballade. I så fald, se afsnit 6.

---

## 5. Hvorfor et attribut og ikke inline styles

Det gamle repos `ChannelThemeContext` skrev hver enkelt CSS-variabel direkte
på `document.documentElement.style` og animerede dem over 300 ms med
`requestAnimationFrame` og HSL-interpolation — omkring 150 linjer, der skulle
holdes i sync med farvenavnene i CSS'en. Inline styles vandt desuden altid
over det lyse tema, uanset specificitet, så lysmode var i praksis slået fra,
mens et tema var aktivt.

Her er det ét attribut på `<html>`. Farverne bor, hvor alle andre farver bor
— i `:root`-blokke i `index.css` — og et attribut på `:root` har højere
specificitet end `:root` alene, så det vinder over lysmode uden noget trick.
Et skift kan animeres med en almindelig CSS-transition på de tokens, det er
relevant for, hvis vi på et tidspunkt ønsker det — det kræver ingen ændring
af denne arkitektur.

---

## 6. Hvad der IKKE er bygget: per-Kanal statiske temaer

Det gamle repo havde også et statisk tema pr. Kanal — bl.a. et for Brøndby
IF, nøglet på endnu et hårdkodet Firestore-id. Det er **bevidst udeladt** af
denne omgang: kun de to admin-styrede festivaltemaer (Copenhell, O Days) på
Ballade er porteret.

Et fremtidigt "hver Kanal har sin egen farve"-mønster ville være en anden
mekanisme end denne — statisk pr. Kanal, ikke admin-toggled — og bør
formentlig stadig nøgle på Kanalens **navn**, af samme grund som afsnit 2.
Men det er en separat beslutning, ikke en udvidelse af `Kanaltema.tsx` i dens
nuværende form, og skal ikke bygges ud fra denne fil alene.

---

## 7. Selvtjek for et nyt tema

- [ ] Temaets nøgle er tilføjet i `BALLADE_TEMAER` (`convex/indstillinger.ts`)
- [ ] Kun de tolv tokens fra afsnit 3 er overskrevet — intet andet
- [ ] `--fare`, `--medgang`, `--guld`, `--soelv`, `--bronze` er urørte
- [ ] Kontrast er testet: tekst mod bund/flade, accent-tekst mod accent
- [ ] Ingen ændring i `Kanaltema.tsx`, medmindre temaet hører til en anden
      Kanal end Ballade — i så fald, se afsnit 6 først
- [ ] `npm run check` og `npm run lint` er grønne
