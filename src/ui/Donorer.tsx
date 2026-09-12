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
 * Nu er den sin EGEN side, som femte segment i Kanal-fanen ved siden af
 * Historik.
 *
 * Den laa foerst nederst paa Mig. Det var den rigtige placering paa papiret
 * — docs/brugerrejser.md kortlaegger `/support` til "Mig → Stoet appen" —
 * men i praksis kunne den ikke findes: Mig er en lang skaerm, og et afsnit
 * under livstidstallene og over knapperne er ikke et sted, nogen leder.
 * En side, man kan trykke sig hen til, kan den.
 *
 * Donationer er ikke kanal-specifikke, og det siger undertitlen ("Gaelder
 * hele appen, ikke kun denne Kanal"), saa ingen tror, tallene hoerer til
 * Kanalen. Segmentstriben er til gengaeld det ene sted i appen, hvor
 * sideordnede visninger bor — se docs/redesign-kontrakt.md afsnit 4.
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
 * Loftet er vaek.
 *
 * Det fandtes, fordi listen laa paa Mig og kunne skubbe "Log ud" vilkaarligt
 * langt ned. En side har ingen anden, der skal naas nedenunder — den maa
 * gerne rulle — og at skjule den ellevte donor paa DERES egen side ville
 * vaere at gemme netop det, siden findes for.
 */

export function Donorer() {
  const svar = useQuery(api.donations.getDonorer, {});

  const donorer = useMemo(
    () => (svar === undefined ? [] : samlDonorer(svar.donationer)),
    [svar],
  );

  // Vis intet, du ikke ved. `undefined` er "henter" — se
  // docs/redesign-kontrakt.md afsnit 7.
  if (svar === undefined) {
    return <p className="midtstillet">Henter …</p>;
  }

  /*
   * TOM TILSTAND, og den er ikke valgfri.
   *
   * Som afsnit paa Mig returnerede den `null`, naar ingen havde doneret —
   * rigtigt dér, hvor en tom overskrift bare ville vaere stoej midt i en
   * skaerm om noget andet. Som SIDE er det forkert: trykker man paa "Stoet"
   * og faar en blank flade, ser appen i stykker ud, og man leder videre
   * efter en side, man lige har staaet paa.
   */
  if (donorer.length === 0) {
    return (
      <div className="tom skaerm-ind">
        <div className="stort">🫶</div>
        <p>Ingen har støttet endnu.</p>
        <p className="hjaelp">
          Donationer registreres af en admin. Når der kommer en, står den her.
        </p>
      </div>
    );
  }

  return (
    <div className="donorside skaerm-ind">
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

      <p className="hjaelp donorsum">
        {svar.total} kr. i alt fra {donorer.length}{" "}
        {donorer.length === 1 ? "person" : "personer"}.
      </p>
    </div>
  );
}
