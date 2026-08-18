import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { genstande } from "../lib/visning";
import { Ark } from "./Ark";
import { Avatar } from "./Avatar";

/**
 * Personkortet.
 *
 * Åbnes ved at trykke på et navn — i stillingen i dag, senere også i chatten
 * og i historikken. Ét mønster: et navn er altid noget, man kan trykke på, og
 * det åbner altid det samme. I den gamle app var `/user/:id` en side, man kun
 * kunne nå fra Score.
 *
 * SENERE: "Send Sladesh" hører til her (R4 i docs/brugerrejser.md). Den er
 * bevidst ikke med endnu — at kunne sende, uden at modtageren har noget flow
 * at gennemføre den i, ville efterlade folk med en udfordring, de ikke kan
 * komme af med. Send og modtag bygges sammen.
 */
export function Personkort({
  userId,
  onLuk,
}: {
  userId: Id<"users">;
  onLuk: () => void;
}) {
  const bruger = useQuery(api.users.getUser, { userId });
  const achievements = useQuery(api.achievements.getAchievementsForUser, {
    userId,
  });

  if (bruger === undefined) {
    return (
      <Ark titel="Profil" onLuk={onLuk}>
        <p className="hjaelp">Henter …</p>
      </Ark>
    );
  }

  if (bruger === null) {
    return (
      <Ark titel="Profil" onLuk={onLuk}>
        <p className="hjaelp">Brugeren findes ikke længere.</p>
      </Ark>
    );
  }

  const oplaaste = (achievements ?? []).filter((a) => a.unlocked);

  return (
    <Ark titel={bruger.displayName} onLuk={onLuk}>
      <div className="profiltop">
        <Avatar
          emoji={bruger.emoji}
          navn={bruger.displayName}
          farve={bruger.avatarColor}
          stor
        />
        <div>
          <div className="navn">{bruger.displayName}</div>
          {bruger.fullName !== undefined && (
            <div className="email">{bruger.fullName}</div>
          )}
        </div>
      </div>

      <div className="talgitter">
        <div className="talkort">
          <div className="vaerdi">{genstande(bruger.totalPoints ?? 0)}</div>
          <div className="etiket">point i alt</div>
        </div>
        <div className="talkort">
          <div className="vaerdi">{bruger.currentDayStreak ?? 0}</div>
          <div className="etiket">stræk</div>
        </div>
        <div className="talkort">
          <div className="vaerdi">{bruger.longestStreak ?? 0}</div>
          <div className="etiket">længste</div>
        </div>
      </div>

      <div className="arkgruppe">
        <h3>Sladesh</h3>
        <div className="talgitter">
          <div className="talkort">
            <div className="vaerdi">{bruger.sladeshSent ?? 0}</div>
            <div className="etiket">sendt</div>
          </div>
          <div className="talkort">
            <div className="vaerdi">{bruger.sladeshCompletedCount ?? 0}</div>
            <div className="etiket">gennemført</div>
          </div>
          <div className="talkort">
            <div className="vaerdi">{bruger.sladeshFailedCount ?? 0}</div>
            <div className="etiket">fejlet</div>
          </div>
        </div>
      </div>

      {achievements !== undefined && (
        <div className="arkgruppe">
          <h3>
            Achievements · {oplaaste.length} af {achievements.length}
          </h3>
          <div className="medaljer">
            {achievements.map((achievement) => (
              <span
                key={achievement.achievementId}
                className={achievement.unlocked ? undefined : "laast"}
                // Titlen er den eneste forklaring på en emoji-række. Uden den
                // er den pæn og uforståelig.
                title={
                  achievement.unlocked
                    ? `${achievement.title}${achievement.count > 1 ? ` ×${achievement.count}` : ""}`
                    : `${achievement.title} — ${achievement.howToGet}`
                }
              >
                {achievement.emoji ?? "🏆"}
              </span>
            ))}
          </div>
        </div>
      )}
    </Ark>
  );
}
