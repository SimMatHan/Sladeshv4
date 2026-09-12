import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Avatar } from "./Avatar";
import { samlDonorer } from "./donorliste";

/**
 * Dem der har støttet appen.
 *
 * ## Hvorfor den findes
 *
 * `donations.getDonorer` har været der hele tiden og var aabent for alle
 * indloggede — med den begrundelse i sin egen kommentar, at "listen er selve
 * pointen med at donere". Den havde ét kaldested: Admin-fanen, hvor kun en
 * admin nogensinde saa den. Folk donerede, fik deres maerke, og listen, de
 * stod paa, kunne de ikke se.
 *
 * Nu staar den nederst i Kanal-arket, hvor man alligevel er, naar man kigger
 * paa hvad appen er og hvem der er med.
 *
 * ## Én række per person
 *
 * Queryen giver enkeltdonationer; `samlDonorer` lægger dem sammen. Listen er
 * en TAK, ikke et regnskab — har nogen doneret tre gange, skal de staa ét
 * sted med summen. Se donorliste.ts for sorteringen.
 *
 * ## Beløbene staar der
 *
 * De er ikke skjult bag en rangorden. Den, der har givet, har selv fortalt
 * en admin hvor meget, og `top_donor`-maerket rangerer allerede aabent —
 * at vise en raekkefoelge uden tal ville vaere en hemmelighed, der ikke er
 * nogen.
 */
export function Donorer() {
  const svar = useQuery(api.donations.getDonorer, {});

  const donorer = useMemo(
    () => (svar === undefined ? [] : samlDonorer(svar.donationer)),
    [svar],
  );

  // Vis intet, du ikke ved — og heller ikke en tom overskrift. Har ingen
  // doneret endnu, er en "0 kr."-liste ikke en oplysning, det er en
  // opfordring, ingen har bedt om. Se docs/redesign-kontrakt.md afsnit 7.
  if (svar === undefined || donorer.length === 0) return null;

  return (
    <div className="arkgruppe">
      <h3>Tak til dem der har støttet</h3>

      <div className="donorliste">
        {donorer.map((donor) => (
          <div key={donor.userId} className="donor">
            <Avatar emoji={donor.avatar} navn={donor.name} farve={donor.color} />

            <span className="donormidt">
              <span className="donornavn">{donor.name}</span>
              {donor.hilsen !== undefined && (
                <span className="hjaelp donorhilsen">{donor.hilsen}</span>
              )}
            </span>

            <span className="donorbeloeb">
              {donor.total} kr.
              {/* Antallet kun naar det er mere end én. "1 gang" under et
                  beloeb siger ingenting, man ikke allerede kunne se. */}
              {donor.antal > 1 && (
                <span className="etiket donorantal">{donor.antal} gange</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <p className="hjaelp">
        {svar.total} kr. i alt fra {donorer.length}{" "}
        {donorer.length === 1 ? "person" : "personer"}.
      </p>
    </div>
  );
}
