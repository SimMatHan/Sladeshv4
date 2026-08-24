import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { AchievementVisning } from "../../convex/achievements";
import type { Id } from "../../convex/_generated/dataModel";
import { Ark } from "./Ark";
import { Fremdriftsring } from "./Fremdriftsring";

/**
 * Trofæhylden.
 *
 * Alt hvad siden viser kommer fra ÉT kald — `getAchievementsForUser` leverer
 * definitionen, brugerens tilstand og fremdriften samlet. Den gamle app
 * hentede definitionerne fra en konstantfil i klienten og fremdriften fra en
 * React-context, der regnede på denormaliserede tællere på brugerdokumentet.
 * De to kunne komme ud af trit; det kan de ikke længere, fordi det er samme
 * svar.
 *
 * Der er derfor heller INGEN `ACHIEVEMENTS`-konstant i frontenden. Den bor i
 * convex/achievementRules.ts, og billederne slås op via `image`-feltet derfra.
 *
 * `userId` er valgfri: uden den er det ens egne, med den er det en andens —
 * serveren kræver, at man deler mindst én Kanal. Personkortet kan bruge den
 * den dag, det skal vise en anden persons hylde.
 */
export function Achievements({
  userId,
  onLuk,
}: {
  userId?: Id<"users">;
  onLuk: () => void;
}) {
  const achievements = useQuery(
    api.achievements.getAchievementsForUser,
    userId === undefined ? {} : { userId },
  );
  const [valgt, setValgt] = useState<string | undefined>();

  // Hylden henter badgebilleder, hvoraf ét alene fylder 3,8 MB. Logget gør
  // det muligt at se i konsollen, hvornår den regning faktisk bliver betalt.
  useEffect(() => {
    console.log("[UI] trofaehylden aabnet", { andres: userId !== undefined });
  }, [userId]);

  if (achievements === undefined) {
    return (
      <Ark titel="Achievements" onLuk={onLuk}>
        <p className="midtstillet">Henter …</p>
      </Ark>
    );
  }

  const detalje =
    valgt === undefined
      ? undefined
      : achievements.find((a) => a.achievementId === valgt);

  if (detalje !== undefined) {
    return (
      <Ark titel={detalje.title} onLuk={onLuk}>
        <Detalje
          achievement={detalje}
          onTilbage={() => setValgt(undefined)}
        />
      </Ark>
    );
  }

  const oplaaste = achievements.filter((a) => a.unlocked).length;
  const andel = achievements.length === 0 ? 0 : oplaaste / achievements.length;

  /**
   * Den låste achievement man er tættest på — målt i ANDEL af tærsklen, ikke
   * i afstand. 4 ud af 5 er tættere på end 18 ud af 20, selvom afstanden er
   * den samme. Manuelle springes over: de har ingen fremdrift at være tæt på.
   *
   * Bemærk at serveren har sin egen `getNaesteMilepael`, som måler i afstand.
   * Den bruges til den lille "næste milepæl"-visning andre steder; her regner
   * vi selv, fordi svaret allerede ligger i listen og et ekstra kald derfor
   * ikke ville give andet end en runde til serveren.
   */
  let taettestPaa: (typeof achievements)[number] | undefined;
  let bedsteAndel = 0;
  for (const achievement of achievements) {
    if (achievement.unlocked || achievement.manual) continue;
    if (achievement.current === undefined || achievement.threshold === undefined) {
      continue;
    }
    if (achievement.threshold === 0) continue;
    const forhold = achievement.current / achievement.threshold;
    if (forhold <= 0 || forhold >= 1) continue;
    if (forhold <= bedsteAndel) continue;
    bedsteAndel = forhold;
    taettestPaa = achievement;
  }

  return (
    <Ark titel="Achievements" onLuk={onLuk}>
      <p className="hjaelp hyldeintro">
        Hver badge har sin egen udfordring — og flere af dem kan optjenes igen.
      </p>

      <div className="kort hylde">
        <Fremdriftsring andel={andel}>
          <span className="ringtal ringtal--kompakt">
            {oplaaste}/{achievements.length}
          </span>
        </Fremdriftsring>
        <div>
          <div className="titel">
            {oplaaste === 0
              ? "Kom i gang!"
              : oplaaste === achievements.length
                ? "Alle låst op! 🎉"
                : "Godt på vej"}
          </div>
          <div className="hjaelp">
            {Math.round(andel * 100)} % af trofæhylden er fyldt.
          </div>
        </div>
      </div>

      {taettestPaa !== undefined && (
        <button
          className="kort taettest"
          onClick={() => setValgt(taettestPaa.achievementId)}
        >
          <Badgebillede achievement={taettestPaa} lille />
          <div className="taettestmidt">
            <span className="etiket">Tættest på</span>
            <div className="titel">{taettestPaa.title}</div>
            <div className="bjaelke">
              <div
                className="fyld"
                style={{ width: `${taettestPaa.percentage ?? 0}%` }}
              />
            </div>
          </div>
          <span className="hjaelp taettesttal">
            {taettestPaa.current}/{taettestPaa.threshold}
          </span>
        </button>
      )}

      {/* Hele hylden på én gang. Den gamle side viste seks og gemte resten bag
          "Se alle achievements" i en modal oven på modalen — en ekstra skærm,
          der kun fandtes fordi gitteret var afkortet. Med otte badges er der
          ikke noget at afkorte. */}
      <div className="badgegitter">
        {achievements.map((achievement) => (
          <button
            key={achievement.achievementId}
            className={achievement.unlocked ? "badge" : "badge laast"}
            onClick={() => setValgt(achievement.achievementId)}
          >
            <Badgebillede achievement={achievement} />
            <span className="titel">{achievement.title}</span>
            {achievement.unlocked ? (
              <span className="maerkat optjent">Optjent</span>
            ) : achievement.manual ? (
              <span className="maerkat">Tildeles</span>
            ) : (
              <span className="maerkat">
                {achievement.current}/{achievement.threshold}
              </span>
            )}
          </button>
        ))}
      </div>
    </Ark>
  );
}

/**
 * Rækken som serveren leverer den.
 *
 * Typen importeres fra `convex/achievements.ts` frem for at blive skrevet af
 * her. `import type` forsvinder ved oversættelsen, så der følger ingen
 * serverkode med i bundtet — kun formen.
 */
type Visning = AchievementVisning;

/**
 * Badgens billede.
 *
 * Låste badges er gråtonede frem for skjulte: man skal kunne se hvad der er
 * at gå efter. `loading="lazy"` betyder noget her — `fullbender.gif` alene
 * fylder 3,8 MB, og hylden ligger bag et ark, de fleste sjældent åbner.
 */
function Badgebillede({
  achievement,
  lille = false,
}: {
  achievement: Visning;
  lille?: boolean;
}) {
  return (
    <span className={lille ? "badgebillede lille" : "badgebillede"}>
      <img src={achievement.image} alt="" loading="lazy" />
      {achievement.count > 1 && <span className="antal">×{achievement.count}</span>}
    </span>
  );
}

function Detalje({
  achievement,
  onTilbage,
}: {
  achievement: Visning;
  onTilbage: () => void;
}) {
  return (
    <>
      <div className="detaljetop">
        <span
          className={
            achievement.unlocked ? "badgebillede stor" : "badgebillede stor laast"
          }
        >
          <img src={achievement.image} alt="" />
        </span>
        {achievement.unlocked ? (
          <span className="maerkat optjent">
            Optjent{achievement.count > 1 && ` ${achievement.count} gange`}
          </span>
        ) : (
          <span className="maerkat">Ikke låst op endnu</span>
        )}
      </div>

      <p>{achievement.description}</p>

      <div className="arkgruppe">
        <h3>Sådan får du den</h3>
        <p className="uden-luft">{achievement.howToGet}</p>
      </div>

      {/* Manuelle achievements har ingen målbar betingelse — det er netop
          derfor et menneske tildeler dem. En fremdriftsbjælke på 0 % ville
          antyde, at man selv kunne gøre noget. */}
      {!achievement.manual &&
        achievement.current !== undefined &&
        achievement.threshold !== undefined && (
          <div className="arkgruppe">
            <h3>Fremdrift</h3>
            <div className="bjaelke">
              <div
                className="fyld"
                style={{ width: `${achievement.percentage ?? 0}%` }}
              />
            </div>
            <p className="hjaelp fremdriftnote">
              {achievement.current} af {achievement.threshold}
              {achievement.repeatable && " · kan optjenes igen"}
            </p>
          </div>
        )}

      {achievement.firstUnlockedAt !== undefined && (
        <div className="arkgruppe">
          <h3>Historik</h3>
          <p className="hjaelp uden-luft">
            Første gang {dato(achievement.firstUnlockedAt)}
            {achievement.lastUnlockedAt !== undefined &&
              achievement.lastUnlockedAt !== achievement.firstUnlockedAt &&
              ` · senest ${dato(achievement.lastUnlockedAt)}`}
          </p>
        </div>
      )}

      <button className="knap knapraekke" onClick={onTilbage}>
        Tilbage til hylden
      </button>
    </>
  );
}

function dato(tidspunkt: number): string {
  return new Date(tidspunkt).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
