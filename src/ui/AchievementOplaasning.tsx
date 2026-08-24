import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { findAchievement } from "../../convex/achievementRules";

/**
 * "Du har låst en achievement op."
 *
 * ## Serveren siger det, vi gætter ikke
 *
 * `logDrink` og `resetRun` returnerer begge `nyeAchievements` — id'erne på
 * præcis det, dén handling låste op. Skallen sender dem herind.
 *
 * Det gamle repo havde ingen sådan besked og måtte udlede den: `AchievementPopup`
 * abonnerede på hele brugerdokumentet, huskede hvert achievements `unlockedAt`
 * i en ref og sammenlignede tidsstempler ved hver ændring — med en
 * 1000 ms buffer for at undgå at fejltolke den første indlæsning som en
 * oplåsning. Den slags gætteri er der ikke brug for, når mutationen selv kan
 * fortælle det.
 *
 * ## Én ad gangen
 *
 * Én logning kan låse flere op på én gang (fx den 20. genstand, der både er
 * Full Bender og Obeerma). Skallen holder dem i kø og viser dem her én ad
 * gangen — to fejringer oven i hinanden ville betyde, at man kun så den ene.
 */

/** Hvor længe fejringen står, hvis man ikke selv lukker den. */
const VIS_MS = 5000;

export function AchievementOplaasning({
  achievementId,
  onLuk,
}: {
  achievementId: string;
  onLuk: () => void;
}) {
  // Tælleren ("×3") står kun i brugerens egne rækker, ikke i definitionen.
  // Er svaret ikke kommet endnu, vises fejringen uden tal frem for at vente.
  const achievements = useQuery(api.achievements.getAchievementsForUser, {});
  const def = findAchievement(achievementId);

  // `onLuk` er som regel en ny funktion ved hver gentegning. Lå den i
  // afhængighederne, ville nedtællingen starte forfra, hver gang skallen
  // gentegnede — og fejringen ville i praksis aldrig lukke sig selv.
  const luk = useRef(onLuk);
  luk.current = onLuk;

  useEffect(() => {
    const timer = setTimeout(() => luk.current(), VIS_MS);
    return () => clearTimeout(timer);
  }, [achievementId]);

  // Et ukendt id kan opstå, hvis en definition fjernes, mens nogen har appen
  // åben. Så springes fejringen over — den må ikke kunne blokere skærmen.
  if (def === undefined) return null;

  const antal =
    achievements?.find((a) => a.achievementId === achievementId)?.count ?? 0;

  return (
    <>
      {/* Dugen er selv lukkeknappen, som i arkene. */}
      <button className="dug" aria-label="Luk" onClick={onLuk} />
      <div className="oplaasning" role="status">
        <span className="etiket oplaasningsetiket">Låst op</span>

        <span className="badgebillede stor">
          <img src={def.image} alt="" />
        </span>

        <h2 className="oplaasningstitel">{def.title}</h2>
        <p className="hjaelp uden-luft">{def.description}</p>

        {/* Gentagne oplåsninger er hele pointen med `repeatable` — så tallet
            skal med, når man er nået rundt mere end én gang. */}
        {antal > 1 && <span className="maerkat optjent">{antal}. gang</span>}
      </div>
    </>
  );
}
