import { useEffect, useState } from "react";
import { formatUr } from "../lib/visning";

/**
 * Nedtællingen til en Sladesh-frist.
 *
 * ## Hvorfor den er sin EGEN komponent
 *
 * Den gentegner hvert sekund. Lå tikket i skallen, ville hele appen
 * gentegne 600 gange i løbet af én Sladesh; ligger det i stillingen, ville
 * hele listen gøre det. Her rører hvert tik kun det ene tal.
 *
 * Det er også grunden til, at den ikke tager `nu` som prop: så ville den,
 * der ejer tilstanden, gentegne i stedet, og hele pointen var væk.
 *
 * ## Hvorfor den ligger her og ikke i App.tsx
 *
 * Den stod som en lokal funktion i skallen, indtil stillingen fik brug for
 * den samme nedtælling på hver række. To kopier af et ur, der skal vise det
 * samme sekund, er præcis den slags, der driver fra hinanden.
 */
export function Ur({ deadlineAt }: { deadlineAt: number }) {
  const [nu, setNu] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNu(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return <>{formatUr(deadlineAt - nu)}</>;
}
