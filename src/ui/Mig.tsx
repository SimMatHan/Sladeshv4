import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "../contexts/AuthContext";
import { fejltekst, genstande, promille } from "../lib/visning";
import { Achievements } from "./Achievements";
import { Admin } from "./Admin";
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
 * Trofæhylden og admin åbner som ark herfra — det er dét, `/achievements` og
 * `/admin` blev til, jf. rutekortet i docs/skaermkortlaegning.md. Admin-
 * knappen vises kun til admins, men det er `requireAdmin` på serveren, der
 * beskytter handlingerne; her skjules den blot.
 *
 * SENERE: støt-appen. Den hører også til her, jf. docs/brugerrejser.md.
 */
export function Mig({ channelId }: { channelId: Id<"kanaler"> | undefined }) {
  const mig = useQuery(api.users.getMe, {});
  const minPromille = useQuery(api.promille.getMinPromille, {});
  const achievements = useQuery(api.achievements.getAchievementsForUser, {});
  const resetRun = useMutation(api.drinkLogs.resetRun);
  const { signOut } = useAuth();

  const [spoerger, setSpoerger] = useState(false);
  const [indstillingerAabne, setIndstillingerAabne] = useState(false);
  const [hyldeAaben, setHyldeAaben] = useState(false);
  const [adminAabent, setAdminAabent] = useState(false);
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

      {/* Emoji-stribens opgave er at LOKKE — de rigtige badges med billeder,
          fremdrift og historik ligger i arket bagved. Derfor er hele kortet
          knappen, ikke et "se alle"-link i hjørnet. */}
      {achievements !== undefined && (
        <button
          className="kort medaljekort"
          style={{ marginTop: 12 }}
          onClick={() => setHyldeAaben(true)}
        >
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
        </button>
      )}

      <div style={{ marginTop: 22 }}>
        <button className="knap" onClick={() => setIndstillingerAabne(true)}>
          Indstillinger
        </button>

        {mig.isAdmin === true && (
          <button className="knap" onClick={() => setAdminAabent(true)}>
            Admin
          </button>
        )}

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

      {hyldeAaben && <Achievements onLuk={() => setHyldeAaben(false)} />}

      {adminAabent && (
        <Admin channelId={channelId} onLuk={() => setAdminAabent(false)} />
      )}
    </>
  );
}
