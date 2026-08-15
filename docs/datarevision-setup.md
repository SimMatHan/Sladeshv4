# Datarevision — sådan får du læseadgang

Revisionen (`npm run datarevision`) læser produktions-Firestore og Firebase
Auth i projektet `sladeshultimate-1`. Den skriver **intet** til Firebase; eneste
output er `docs/datarevision.md`.

Til det skal den bruge en service-account-nøgle med to **read-only** roller.

> **Nøglen er en rigtig hemmelighed.** Til forskel fra Firebase-web-nøglerne,
> som er offentlige identifikatorer, giver denne fil direkte adgang til data
> uden om alle sikkerhedsregler. Den må aldrig committes, aldrig få
> `VITE_`-præfiks, og aldrig ligge i projektmappen.

## 1. Opret service-kontoen

Google Cloud Console → **IAM & Admin → Service Accounts** → *Create service
account*. Vælg projektet `sladeshultimate-1`.

- **Navn:** `datarevision-readonly`
- **Beskrivelse:** midlertidig læseadgang til datarevision

## 2. Giv præcis to roller

Begge er læse-kun. Giv ikke andre.

| Rolle | Id | Hvorfor |
|---|---|---|
| Cloud Datastore Viewer | `roles/datastore.viewer` | Læse Firestore-collections |
| Firebase Authentication Viewer | `roles/firebaseauth.viewer` | Liste Auth-brugernes UID'er og login-metode |

`datastore.viewer` giver **ingen** skriverettigheder. Selv hvis scriptet
havde en fejl, kan det ikke ændre noget.

## 3. Hent nøglen — og læg den uden for repoet

På service-kontoen: **Keys → Add key → Create new key → JSON**. Filen hentes
automatisk.

Flyt den ud af projektmappen med det samme, og lås rettighederne:

```bash
mkdir -p ~/.config/sladesh
mv ~/Downloads/sladeshultimate-1-*.json ~/.config/sladesh/datarevision-key.json
chmod 600 ~/.config/sladesh/datarevision-key.json
```

`.gitignore` fanger de almindelige navnemønstre for sådanne nøgler som et
sikkerhedsnet, men **stol ikke på det** — hold filen uden for repoet.

## 4. Kør revisionen

```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/.config/sladesh/datarevision-key.json
npm run datarevision
```

Den skriver `docs/datarevision.md`. Kørslen tager typisk under et minut.

Rapporten indeholder kun **aggregerede tal, feltnavne og typenavne** — ingen
emails, navne, positioner, beskedtekst eller dokument-id'er. Den kan trygt
committes.

## 5. Slet nøglen bagefter

Revisionen er en engangsopgave. Når `docs/datarevision.md` er genereret:

```bash
rm ~/.config/sladesh/datarevision-key.json
```

Og slet nøglen i Google Cloud Console (**Keys → slet**), så den ikke kan bruges
igen hvis filen skulle være kopieret undervejs. Skal revisionen køres om, tager
det to minutter at lave en ny.

## Hvis noget fejler

| Fejl | Årsag |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS mangler` | `export` er ikke kørt i denne terminal |
| `PERMISSION_DENIED` på Firestore | `roles/datastore.viewer` mangler |
| `PERMISSION_DENIED` på `listUsers` | `roles/firebaseauth.viewer` mangler |
| `Could not load the default credentials` | Stien peger ikke på en fil der findes |
