# Datarevision

> **Ikke kørt endnu.** Denne fil overskrives af `npm run datarevision`, som
> læser produktions-Firestore og skriver de faktiske tal her.
>
> Se [datarevision-setup.md](./datarevision-setup.md) for hvordan læseadgangen
> skaffes. Revisionen kan ikke køres fra Claudes sandbox, som blokerer
> udgående trafik til Google-API'erne der kræves.

Når den er kørt, indeholder filen:

1. **Den kritiske antagelse** — om `/users`-dokument-id'er er Firebase UID'er,
   fordelt på login-metode. Afgør om de eksisterende brugere kan logge ind
   efter migreringen.
2. **Collections målt mod schemaet** — dokumentantal, feltdækning, faktiske
   typer, og hvilke dokumenter Convex-validatorerne ville afvise.
3. **Referentiel integritet** — døde kanalreferencer, uenighed mellem
   `channels.members` og `users.joinedChannelIds`, forældreløse
   subcollection-dokumenter.
4. **Konsekvens af fase 1-3's schemaændringer** — om de gamle tællere allerede
   er drevet fra `drinkLogs`, hvor mange achievement-rækker der opstår, hvor
   meget base64-billeddata der skal flyttes til Convex storage, og om
   `currentStreak`/`totalPoints` faktisk altid var 0.
