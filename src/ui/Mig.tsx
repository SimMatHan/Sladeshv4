import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "../contexts/AuthContext";
import { fejltekst, genstande, promille } from "../lib/visning";
import { Avatar } from "./Avatar";
import { Indstillinger } from "./Indstillinger";

/**
 * Mig — den anden af de to faner.
 *
 * Egne tal, egne achievements, og de handlinger der kun angår én selv.
 * Nulstil run ligger HER og ikke på forsiden: den fjerner ens plads på listen
 * for resten af dagen, og det er ikke til at fortryde. Det er den ene
 * handling i appen, der spørger.
 *
 * SENERE: achievements i fuld form, admin og støt-appen. De hører alle til
 * her, jf. docs/brugerrejser.md.
 */
export function Mig({ channelId }: { channelId: Id<"kanaler"> | undefined }) {
  const mig = useQuery(api.users.getMe, {});
  const minPromille = useQuery(api.promille.getMinPromille, {});
  const achievements = useQuery(api.achievements.getAchievementsForUser, {});
  const resetRun = useMutation(api.drinkLogs.resetRun);
  const { signOut } = useAuth();

  const [spoerger, setSpoerger] = useState(false);
  const [indstillingerAabne, setIndstillingerAabne] = useState(false);
  const [arbejder, setArbejder] = useState(false);
  const [fejl, setFejl] = useState<string | undefined>();

  if (mig === undefined) return <p className="midtstillet">Henter …</p>;
  if (mig === null) return <p className="midtstillet">Ingen profil.</p>;

  const nulstil = async () => {
    setArbejder(true);
    setFejl(undefined);
    try {
      await resetRun({ channelId });
      setSpoerger(false);
    } catch (error) {
      setFejl(fejltekst(error));
    } finally {
      setArbejder(false);
    }
  };

  const oplaaste = (achievements ?? []).filter((a) => a.unlocked);

  return (
    <>
      <div className="profiltop">
        <Avatar emoji={mig.emoji} navn={mig.displayName} farve={mig.avatarColor} stor />
        <div>
          <div className="navn">{mig.displayName}</div>
          <div className="email">{mig.email}</div>
        </div>
      </div>

      <div className="talgitter">
        <div className="talkort">
          <div className="vaerdi">{genstande(mig.totalPoints ?? 0)}</div>
          <div className="etiket">point i alt</div>
        </div>
        <div className="talkort">
          <div className="vaerdi">{mig.currentDayStreak ?? 0}</div>
          <div className="etiket">stræk</div>
        </div>
        <div className="talkort">
          <div className="vaerdi">{mig.longestStreak ?? 0}</div>
          <div className="etiket">længste</div>
        </div>
      </div>

      <div className="kort">
        <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--tekst-svag)" }}>
          PROMILLE
        </h3>
        {minPromille === undefined ? (
          <p className="hjaelp">Henter …</p>
        ) : minPromille.konfigureret && minPromille.promille !== null ? (
          <>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>
              {promille(minPromille.promille)}
            </div>
            <div className="etiket" style={{ color: "var(--tekst-daempet)" }}>
              {minPromille.niveau?.label}
              {minPromille.timerTilAedru !== null &&
                minPromille.timerTilAedru > 0 &&
                ` · ædru om ca. ${minPromille.timerTilAedru} timer`}
            </div>
          </>
        ) : (
          // Vi viser hellere ingenting end et gættet tal — men vi siger
          // hvorfor, så det ikke ligner en fejl.
          <p className="hjaelp" style={{ margin: 0 }}>
            Udfyld vægt og køn i indstillingerne, så regnes din promille.
          </p>
        )}
      </div>

      {achievements !== undefined && (
        <div className="kort" style={{ marginTop: 12 }}>
          <h3 style={{ margin: "0 0 9px", fontSize: 13, color: "var(--tekst-svag)" }}>
            ACHIEVEMENTS · {oplaaste.length} AF {achievements.length}
          </h3>
          <div className="medaljer">
            {achievements.map((achievement) => (
              <span
                key={achievement.achievementId}
                className={achievement.unlocked ? undefined : "laast"}
                title={
                  achievement.unlocked
                    ? achievement.title
                    : `${achievement.title} — ${achievement.howToGet}`
                }
              >
                {achievement.emoji ?? "🏆"}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <button className="knap" onClick={() => setIndstillingerAabne(true)}>
          Indstillinger
        </button>

        {spoerger ? (
          <div className="kort">
            <p style={{ marginTop: 0 }}>
              Din stilling starter forfra. Historikken bliver stående.
            </p>
            <button className="knap fare" disabled={arbejder} onClick={() => void nulstil()}>
              Ja, nulstil mit run
            </button>
            <button className="knap" onClick={() => setSpoerger(false)}>
              Fortryd
            </button>
          </div>
        ) : (
          <button className="knap fare" onClick={() => setSpoerger(true)}>
            Nulstil run
          </button>
        )}

        <button className="knap" onClick={() => void signOut()}>
          Log ud
        </button>
      </div>

      {fejl !== undefined && <p className="fejl">{fejl}</p>}

      {indstillingerAabne && (
        <Indstillinger mig={mig} onLuk={() => setIndstillingerAabne(false)} />
      )}
    </>
  );
}
