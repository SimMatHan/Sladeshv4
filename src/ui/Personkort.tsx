import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { DRINK_CATEGORIES, getDrinkDayStart } from "../../convex/constants";
import { fejltekst, genstande, klokken } from "../lib/visning";
import { Ark } from "./Ark";
import { Avatar } from "./Avatar";

/**
 * Hvor mange logninger der hentes for at finde aftenens.
 *
 * Hentes desc og filtreres på drikkedagen herude. 60 er rigeligt til én
 * aften — også en lang en — og billigere end en ny query på serveren, som
 * kontrakten i øvrigt heller ikke tillader.
 */
const LOGGRAENSE = 60;

/**
 * Hvor mange afgjorte Sladesh personkortet viser.
 *
 * Ti er nok til at dække en aften og en weekend. Serveren henter de ti
 * nyeste rækker og filtrerer de uafgjorte fra, så tallet er et loft, ikke
 * et krav.
 */
const SLADESH_GRAENSE = 10;

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

      <IAften userId={userId} navn={bruger.displayName} />

      <Sladeshhistorik userId={userId} navn={bruger.displayName} />

      {achievements !== undefined && (
        <div className="arkgruppe">
          <h3>
            Achievements · {oplaaste.length} af {achievements.length}
          </h3>

          {/*
            De OPTJENTE med billede og navn, ikke som en stribe emoji.
            Striben var en række på 5-6 grå og farvede tegn med `title` som
            eneste forklaring — og `title` er en tooltip, altså noget der
            kræver en mus. På en telefon var rækken dermed pæn og
            fuldstændig ulæselig: man kunne se, at der VAR mærker, men ikke
            hvilke. Billederne findes allerede i hylden.
          */}
          {oplaaste.length === 0 ? (
            <p className="hjaelp">Ingen endnu.</p>
          ) : (
            <div className="maerkeliste">
              {oplaaste.map((achievement) => (
                <span key={achievement.achievementId} className="maerkebrik">
                  <span className="badgebillede lille">
                    <img src={achievement.image} alt="" loading="lazy" />
                    {achievement.count > 1 && (
                      <span className="antal">×{achievement.count}</span>
                    )}
                  </span>
                  <span className="titel">{achievement.title}</span>
                </span>
              ))}
            </div>
          )}

          {/* De låste tælles, men vises ikke. En liste over hvad en ANDEN
              ikke har opnået, er ikke en oplysning, man kan bruge til noget
              — og på ens egen hylde står de i forvejen, med hvordan man
              får dem. */}
          {oplaaste.length < achievements.length && (
            <p className="hjaelp">
              {achievements.length - oplaaste.length} mangler
            </p>
          )}
        </div>
      )}
    </Ark>
  );
}

/**
 * Hvad personen har drukket i aften.
 *
 * Kortet åbnes fra stillingen, altså fra en liste over, hvem der er ude
 * LIGE NU — og det første, man vil vide, når man har trykket på et navn,
 * er hvad det tal på syv er lavet af.
 *
 * Fortrydelser vises som fortrudte frem for at forsvinde, præcis som i
 * Historikkens dagliste: forskellen mellem "har ikke drukket noget" og "har
 * fortrudt tre" er ikke ligegyldig, og en række, der bare var væk, ville
 * skjule den. Modposterne selv vises ikke — de er bogholderi, ikke
 * genstande.
 */
function IAften({ userId, navn }: { userId: Id<"users">; navn: string }) {
  const logs = useQuery(api.drinkLogs.getDrinkLogsForUser, {
    userId,
    limit: LOGGRAENSE,
  });

  if (logs === undefined) {
    return (
      <div className="arkgruppe">
        <h3>I aften</h3>
        <p className="hjaelp">Henter …</p>
      </div>
    );
  }

  const dagStart = getDrinkDayStart(Date.now());
  const idag = logs.filter((log) => log.timestamp >= dagStart);

  // Hvilke logninger er trukket tilbage. Modposten peger på sin original med
  // `removesLogId` — samme form, som convex/historik.ts læser.
  const fortrudte = new Set(
    idag
      .filter((log) => log.action === "remove")
      .map((log) => log.removesLogId)
      .filter((id): id is Id<"drinkLogs"> => id !== undefined),
  );

  const raekker = idag.filter(
    (log) => log.isReset !== true && log.action !== "remove",
  );

  if (raekker.length === 0) {
    return (
      <div className="arkgruppe">
        <h3>I aften</h3>
        <p className="hjaelp">{navn} har ikke logget noget endnu.</p>
      </div>
    );
  }

  return (
    <div className="arkgruppe">
      <h3>I aften</h3>
      {/* Genbruger Historikkens dagliste — det er den samme slags liste, og
          den skal se ens ud de to steder, man møder den. `fritstaaende`,
          fordi den her ikke hænger under en udfoldet dagrække. */}
      <div className="dagliste fritstaaende">
        {[...raekker].reverse().map((log) => {
          const fortrudt = fortrudte.has(log._id);
          return (
            <div
              key={log._id}
              className={fortrudt ? "logning fortrudt" : "logning"}
            >
              <span className="emoji">{emojiFor(log.categoryId)}</span>
              <span className="midt">
                <span className="navn">{log.variationName}</span>
                {(log.sizeLabel !== undefined || fortrudt) && (
                  <span className="under">
                    {/* `sizeLabel` findes kun på gamle rækker — størrelserne
                        er ude af logningen, se convex/constants.ts. */}
                    {log.sizeLabel}
                    {log.sizeLabel !== undefined && fortrudt && " · "}
                    {fortrudt && "fortrudt"}
                  </span>
                )}
              </span>
              <span className="tid">{klokken(log.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * De afgjorte Sladesh — med beviserne.
 *
 * Billederne har ligget i Convex-storage, siden appen blev bygget, og ingen
 * skærm har vist dem. To fotos per gennemført Sladesh, betalt for og aldrig
 * set.
 *
 * Serveren afgør, om billederne følger med: de sendes kun til de to parter.
 * Ser man en andens kort uden selv at have været med, får man rækken og
 * udfaldet, men ingen fotos — feltet er `null`, og der er ingen knap at
 * trykke på. Se `getSladeshHistorik` i convex/sladesh.ts for hvorfor.
 */
function Sladeshhistorik({ userId, navn }: { userId: Id<"users">; navn: string }) {
  const historik = useQuery(api.sladesh.getSladeshHistorik, {
    userId,
    limit: SLADESH_GRAENSE,
  });
  const [aabent, setAabent] = useState<string | undefined>();

  if (historik === undefined) {
    return (
      <div className="arkgruppe">
        <h3>Sladesh</h3>
        <p className="hjaelp">Henter …</p>
      </div>
    );
  }

  if (historik.length === 0) {
    return (
      <div className="arkgruppe">
        <h3>Sladesh</h3>
        <p className="hjaelp">{navn} har ingen afgjorte Sladesh endnu.</p>
      </div>
    );
  }

  return (
    <div className="arkgruppe">
      <h3>Sladesh</h3>
      <div className="adminliste">
        {historik.map((raekke) => {
          const beviser = [raekke.foerBillede, raekke.efterBillede].filter(
            (url): url is string => url !== null,
          );
          const udfoldet = aabent === raekke.challengeId;

          return (
            <div key={raekke.challengeId} className="sladeshraekke">
              <button
                className="sladeshtop"
                // Uden beviser er der intet at folde ud, og så skal rækken
                // heller ikke se ud som om der er.
                disabled={beviser.length === 0}
                aria-expanded={beviser.length === 0 ? undefined : udfoldet}
                onClick={() =>
                  setAabent(udfoldet ? undefined : raekke.challengeId)
                }
              >
                <span className={udfaldsklasse(raekke.status)} aria-hidden="true">
                  {udfaldsikon(raekke.status)}
                </span>
                <span className="midt">
                  <span className="navn">Fra {raekke.senderName}</span>
                  <span className="under">
                    {udfaldstekst(raekke.status)}
                    {raekke.venue !== undefined && ` · ${raekke.venue}`}
                    {" · "}
                    {klokken(raekke.completedAt ?? raekke.createdAt)}
                  </span>
                </span>
                {beviser.length > 0 && (
                  <span className="hjaelp">
                    {udfoldet ? "Skjul" : `${beviser.length} billeder`}
                  </span>
                )}
              </button>

              {udfoldet && (
                <div className="beviser">
                  {beviser.map((url, nummer) => (
                    <figure key={url}>
                      {/* `loading="lazy"`: billederne hentes først, når
                          rækken er foldet ud og figuren er i syne. */}
                      <img src={url} alt="" loading="lazy" />
                      <figcaption className="etiket">
                        {nummer === 0 ? "Fyldt" : "Tom"}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * De tre udfald har hver sin markering.
 *
 * Samme skelnen som varslingen til afsenderen gør: "gav op" og "nåede det
 * ikke" er to forskellige ting at have gjort. Se `sladeshUdfaldVarsling` i
 * convex/sladeshRules.ts.
 */
function udfaldsikon(status: string): string {
  if (status === "completed") return "🍺";
  if (status === "failed") return "🏳️";
  return "⏳";
}

function udfaldstekst(status: string): string {
  if (status === "completed") return "Gennemført";
  if (status === "failed") return "Opgivet";
  return "Løb ud";
}

function udfaldsklasse(status: string): string {
  return status === "completed" ? "udfald gennemfoert" : "udfald";
}

function emojiFor(categoryId: string): string {
  return DRINK_CATEGORIES.find((k) => k.id === categoryId)?.emoji ?? "🥤";
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
        <p className="kvitteret" role="status">
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
