import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { fejltekst, genstande } from "../lib/visning";
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
 * Herfra sender man også en Sladesh (R4). Det er stedet, fordi det er her man
 * i forvejen kigger på hinanden — i den gamle app lå det i en helt egen fane
 * med et kredsløb af avatarer, som var tom fire ud af fem gange.
 */
export function Personkort({
  userId,
  minUserId,
  channelId,
  onLuk,
}: {
  userId: Id<"users">;
  minUserId: Id<"users"> | undefined;
  channelId: Id<"kanaler"> | undefined;
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

      {userId !== minUserId && (
        <SendSladesh
          modtagerId={userId}
          modtagerNavn={bruger.displayName}
          channelId={channelId}
        />
      )}

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

/**
 * Send en Sladesh.
 *
 * Knappen forsvinder ikke, når man ikke må — den bliver stående, slukket, med
 * grunden skrevet ud. En knap der bare er væk, får folk til at tro, at
 * funktionen er forsvundet; cooldownen er usynlig og ville ellers ligne en
 * fejl.
 *
 * Tre ting kan spærre, og serveren tjekker dem alle uanset hvad vi viser her:
 * ens egen 12-timers blok, at modtageren allerede er optaget, og at man selv
 * er det.
 */
function SendSladesh({
  modtagerId,
  modtagerNavn,
  channelId,
}: {
  modtagerId: Id<"users">;
  modtagerNavn: string;
  channelId: Id<"kanaler"> | undefined;
}) {
  const cooldown = useQuery(api.sladesh.getCooldown, {});
  const jegErOptaget = useQuery(api.sladesh.hasActiveSladesh, {});
  const modtagerErOptaget = useQuery(api.sladesh.hasActiveSladesh, {
    userId: modtagerId,
  });
  const sendSladesh = useMutation(api.sladesh.sendSladesh);

  // Nøglen dannes ÉN gang per kort og genbruges ved forsøg nummer to.
  // `sendSladesh` kræver den, netop så et gentaget kald ikke bliver til to
  // udfordringer — se kommentaren i convex/sladesh.ts.
  const [noegle] = useState(() => crypto.randomUUID());
  const [arbejder, setArbejder] = useState(false);
  const [sendt, setSendt] = useState(false);
  const [fejl, setFejl] = useState<string | undefined>();

  const henter =
    cooldown === undefined ||
    jegErOptaget === undefined ||
    modtagerErOptaget === undefined;

  const spaerre = henter
    ? "Henter …"
    : jegErOptaget === true
      ? "Du er selv midt i en Sladesh"
      : modtagerErOptaget === true
        ? `${modtagerNavn} har allerede en aktiv Sladesh`
        : cooldown !== undefined && !cooldown.canSend
          ? `Du har sendt en i denne blok. Næste om ${varighed(cooldown.msTilNaesteBlok)}`
          : undefined;

  const send = async () => {
    setArbejder(true);
    setFejl(undefined);
    try {
      await sendSladesh({
        recipientId: modtagerId,
        channelId,
        idempotencyKey: noegle,
      });
      setSendt(true);
    } catch (error) {
      setFejl(fejltekst(error));
    } finally {
      setArbejder(false);
    }
  };

  if (sendt) {
    return (
      <div className="arkgruppe">
        <p className="knap" style={{ color: "var(--medgang)" }}>
          Sladesh sendt til {modtagerNavn} 🍺
        </p>
      </div>
    );
  }

  return (
    <div className="arkgruppe">
      <button
        className="knap primaer"
        disabled={arbejder || henter || spaerre !== undefined}
        onClick={() => void send()}
      >
        Send Sladesh
      </button>
      {spaerre !== undefined && <p className="hjaelp">{spaerre}</p>}
      {fejl !== undefined && <p className="fejl">{fejl}</p>}
    </div>
  );
}

/** Millisekunder → "4t 12m". Under en time udelades timetallet. */
function varighed(millisekunder: number): string {
  const minutter = Math.max(0, Math.ceil(millisekunder / 60000));
  const timer = Math.floor(minutter / 60);
  const rest = minutter % 60;
  return timer > 0 ? `${timer}t ${rest}m` : `${rest}m`;
}
