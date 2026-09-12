/*
 * Donorlisten — fra enkeltdonationer til én række per person.
 *
 * EGEN FIL uden browser, samme grænse som `tilfaeldigValg.ts`, saa
 * `scripts/logic-test.ts` kan importere den.
 */

/** Én donation, som `donations.getDonorer` leverer den. */
export type Donation = {
  userId: string;
  name: string;
  amount: number;
  message?: string;
  date: number;
  avatar?: string;
  color?: string;
};

/** Én person, med alt hvad de har givet lagt sammen. */
export type Donor = {
  userId: string;
  name: string;
  avatar?: string;
  color?: string;
  /** Summen af personens donationer. */
  total: number;
  /** Antal gange, personen har doneret. */
  antal: number;
  /** Hilsenen fra den SENESTE donation, hvis der er en. */
  hilsen?: string;
  /** Tidspunktet for den seneste donation. Bruges til at bryde lige summer. */
  senest: number;
};

/**
 * Lægger donationer sammen per person.
 *
 * ## Hvorfor per person og ikke per donation
 *
 * Listen er en tak, ikke et regnskab. Har nogen doneret tre gange, skal de
 * stå ét sted med summen — ikke tre gange med hver sin lille sum, hvor de
 * ser ud til at have givet mindre, end de har.
 *
 * ## Sorteringen
 *
 * Størst beløb først. Ved lige summer vinder den, der donerede FØRST — samme
 * tie-breaker som stillingen bruger, hvor den tidligste af to lige også
 * vinder. To med samme beløb skal ikke bytte plads, hver gang listen hentes.
 *
 * ## Navnet
 *
 * Fra den seneste donation. Serveren slaar navnet op paa brugeren, saa alle
 * raekker for samme person har det samme — men skifter nogen navn mellem to
 * hentninger, er det nyeste det rigtige.
 */
export function samlDonorer(donationer: readonly Donation[]): Donor[] {
  const efterBruger = new Map<string, Donor>();

  for (const donation of donationer) {
    const fundet = efterBruger.get(donation.userId);

    if (fundet === undefined) {
      efterBruger.set(donation.userId, {
        userId: donation.userId,
        name: donation.name,
        avatar: donation.avatar,
        color: donation.color,
        total: donation.amount,
        antal: 1,
        hilsen: tomTilUndefined(donation.message),
        senest: donation.date,
      });
      continue;
    }

    fundet.total += donation.amount;
    fundet.antal += 1;

    // Kun den SENESTE donations hilsen. En liste, der viste alle tre
    // hilsener fra samme person, ville blive en tråd frem for en tak.
    if (donation.date > fundet.senest) {
      fundet.senest = donation.date;
      fundet.name = donation.name;
      fundet.avatar = donation.avatar;
      fundet.color = donation.color;
      fundet.hilsen = tomTilUndefined(donation.message);
    }
  }

  return [...efterBruger.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.senest - b.senest;
  });
}

/**
 * En hilsen på kun mellemrum er ingen hilsen.
 *
 * Serveren trimmer ved oprettelsen, men gamle rækker fra migreringen kan
 * bære hvad som helst, og en tom boble under et navn ser ud som en fejl.
 */
function tomTilUndefined(besked: string | undefined): string | undefined {
  if (besked === undefined) return undefined;
  const rent = besked.trim();
  return rent.length > 0 ? rent : undefined;
}
