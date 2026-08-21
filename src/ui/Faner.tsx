/**
 * Fanestriben — appens ene måde at skifte mellem sideordnede visninger.
 *
 * Skallen brugte den allerede til Stilling · Chat · Kort · Historik, men
 * markuppen lå løst i App.tsx. Da Admin skulle bruge præcis den samme stribe
 * til sine fem områder, blev den trukket ud her frem for at blive skrevet af
 * — ét mønster, ét sted, samme tastaturopførsel begge steder.
 *
 * `role="tablist"` og `aria-selected` frem for `aria-current`: det her er
 * faner inde i en visning, ikke navigation mellem sider. Skallens bundnav er
 * det modsatte og bruger derfor `aria-current`.
 */
export type Fanevalg<T extends string> = {
  id: T;
  etiket: string;
  /**
   * Den lille prik der siger "der er sket noget her".
   *
   * Bevidst et boolean og ikke et tal: et tal inviterer til at tælle ulæste
   * beskeder i en chat, der alligevel tømmer sig selv hvert døgn.
   */
  prik?: boolean;
};

export function Faner<T extends string>({
  valg,
  aktiv,
  onVaelg,
}: {
  valg: readonly Fanevalg<T>[];
  aktiv: T;
  onVaelg: (id: T) => void;
}) {
  return (
    <div className="segmenter" role="tablist">
      {valg.map((fane) => (
        <button
          key={fane.id}
          role="tab"
          className="segment"
          aria-selected={aktiv === fane.id}
          onClick={() => onVaelg(fane.id)}
        >
          {fane.etiket}
          {fane.prik === true && <span className="prik" />}
        </button>
      ))}
    </div>
  );
}
