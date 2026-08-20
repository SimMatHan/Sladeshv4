import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Ark } from "./Ark";

/**
 * Trofæhylden.
 *
 * Backenden har haft alt siden fase 8 — titler, beskrivelser, billeder og
 * fremdrift ligger i `achievements.getAchievementsForUser` — men appen viste
 * kun en stribe emojis på Mig. Billederne fra den gamle app lå slet ikke i
 * dette repo; de er hentet med over i public/assets/achievements/.
 *
 * To ting afgør, hvordan skærmen er skruet sammen:
 *
 *   BILLEDET ER PRÆMIEN. En låst achievement viser en hængelås og hvad der
 *   skal til — ikke billedet. Det er halvdelen af sjoven, og det var også
 *   sådan den gamle app gjorde det.
 *
 *   FREMDRIFT FREM FOR EN LISTE. Rækkefølgen er: det man har låst op, og
 *   derefter det man er tættest på. En alfabetisk liste ville begrave den
 *   ene, man mangler to genstande på.
 *
 * Billederne hentes først, når rækken foldes ud (`loading="lazy"` og kun i
 * det udfoldede felt). En af dem er en 3,7 MB gif, og den skal ikke koste
 * noget, før nogen faktisk kigger på den.
 */
export function Achievements({
  userId,
  navn,
  onLuk,
}: {
  /** Udeladt = ens egne. Med = en andens, jf. `requireCanViewUser`. */
  userId?: Id<"users">;
  navn?: string;
  onLuk: () => void;
}) {
  const achievements = useQuery(
    api.achievements.getAchievementsForUser,
    userId === undefined ? {} : { userId },
  );

  const [udfoldet, setUdfoldet] = useState<string | undefined>();

  const sorteret = useMemo(() => {
    if (achievements === undefined) return undefined;

    return [...achievements].sort((a, b) => {
      // Låst op øverst, og blandt dem de senest opnåede først.
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (a.unlocked && b.unlocked) {
        return (b.lastUnlockedAt ?? 0) - (a.lastUnlockedAt ?? 0);
      }
      // Derefter: dem man er tættest på. Manuelle har ingen fremdrift og
      // ryger nederst — de afhænger af et menneske, ikke af en indsats.
      return (b.percentage ?? -1) - (a.percentage ?? -1);
    });
  }, [achievements]);

  const oplaaste = sorteret?.filter((a) => a.unlocked).length ?? 0;

  return (
    <Ark
      titel={navn === undefined ? "Achievements" : `${navn}s achievements`}
      onLuk={onLuk}
    >
      {sorteret === undefined ? (
        <p className="tom">Henter …</p>
      ) : (
        <>
          <div className="arkgruppe">
            <h3>
              {oplaaste} af {sorteret.length} låst op
            </h3>
            <div className="bjaelke">
              <span
                style={{
                  width: `${sorteret.length === 0 ? 0 : (oplaaste / sorteret.length) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="arkgruppe">
            <div className="trofaeer">
              {sorteret.map((achievement) => {
                const aaben = udfoldet === achievement.achievementId;

                return (
                  <div
                    className={`trofae${achievement.unlocked ? "" : " laast"}`}
                    key={achievement.achievementId}
                  >
                    <button
                      className="trofaeraekke"
                      aria-expanded={aaben}
                      onClick={() =>
                        setUdfoldet(
                          aaben ? undefined : achievement.achievementId,
                        )
                      }
                    >
                      <span className="maerkat" aria-hidden="true">
                        {achievement.unlocked
                          ? (achievement.emoji ?? "🏆")
                          : "🔒"}
                      </span>

                      <span className="midt">
                        <span className="navn">{achievement.title}</span>
                        <span className="under">
                          {achievement.unlocked
                            ? achievement.count > 1
                              ? `Opnået ${achievement.count} gange`
                              : "Låst op"
                            : achievement.howToGet}
                        </span>

                        {/* Fremdriften vises kun, hvor den betyder noget:
                            på det man ikke har låst op endnu, og kun når
                            der er noget at måle på. */}
                        {!achievement.unlocked &&
                          achievement.threshold !== undefined && (
                            <span className="fremdrift">
                              <span className="bjaelke">
                                <span
                                  style={{
                                    width: `${achievement.percentage ?? 0}%`,
                                  }}
                                />
                              </span>
                              <span className="tal">
                                {achievement.current ?? 0}/
                                {achievement.threshold}
                              </span>
                            </span>
                          )}
                      </span>

                      <span className="pil" aria-hidden="true">
                        {aaben ? "⌃" : "⌄"}
                      </span>
                    </button>

                    {aaben && (
                      <div className="trofaedetalje">
                        {achievement.unlocked ? (
                          <img
                            src={achievement.image}
                            alt={achievement.title}
                            loading="lazy"
                          />
                        ) : (
                          <div className="skjult" aria-hidden="true">
                            🔒
                          </div>
                        )}
                        <p>{achievement.description}</p>
                        <p className="hjaelp">{achievement.howToGet}</p>
                        {achievement.unlocked &&
                          achievement.firstUnlockedAt !== undefined && (
                            <p className="hjaelp">
                              Første gang{" "}
                              {new Date(
                                achievement.firstUnlockedAt,
                              ).toLocaleDateString("da-DK", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </p>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Ark>
  );
}
