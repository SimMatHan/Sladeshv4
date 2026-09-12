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
 * Nu staar den paa Mig, hvor docs/brugerrejser.md hele tiden har haft
 * `/support` kortlagt hen ("Mig → Stoet appen"). Donationer er ikke
 * kanal-specifikke — de gaelder appen — saa Kanal-arket var det forkerte
 * sted, selvom det var dér, den landede foerst.
 *
 * Admins liste bliver staaende. Den er et VAERKTOEJ — hver raekke har en
 * slet-knap og summen er til afstemning — og det er en anden opgave end at
 * sige tak.
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

/**
 * Saa mange staar paa Mig. Resten taelles kun.
 *
 * Mig er i forvejen en lang skaerm — hero, stime, maerker, livstidstal og
 * handlinger — og en liste uden loft ville kunne skubbe "Log ud" vilkaarligt
 * langt ned. Ti er rigeligt til at hylde nogen; den ellevte er ikke glemt,
 * den staar i linjen nedenunder.
 */
const VISTE = 10;

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

  const viste = donorer.slice(0, VISTE);
  const resten = donorer.length - viste.length;

  return (
    // Ikke `.arkgruppe`: den klasse er arkenes idiom, og Mig er ikke et ark.
    // Her adskiller en streg afsnittene, som ved `.livstid` lige over.
    <div className="donorafsnit">
      <span className="etiket">Tak til dem der har støttet</span>

      <div className="donorliste">
        {viste.map((donor) => (
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
        {resten > 0 && ` ${resten} mere vises ikke her.`}
      </p>
    </div>
  );
}
