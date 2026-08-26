import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BESKED_MAX_LAENGDE } from "../../convex/messageRules";
import { useSendMessage } from "../lib/optimistiskeKald";
import { getDrinkDayStart } from "../../convex/constants";
import { fejltekst, klokken } from "../lib/visning";
import { Avatar } from "./Avatar";
import { SendIkon } from "./Ikoner";

/**
 * Kanalens chat.
 *
 * `useQuery` ER abonnementet — Convex-queries er reaktive af sig selv, så der
 * er ingen lytter at rydde op efter. Det gamle repo havde et helt lag omkring
 * Firestores `onSnapshot` med cache og manuel afmelding; det er væk.
 *
 * To ting sker automatisk, mens man er her:
 *
 * - **Læst.** Kanalen markeres som læst ved åbning og hver gang der kommer en
 *   ny besked, mens man kigger. Det er dét, prikken på fanen holder øje med.
 * - **Til stede.** `setAktivChat` fortæller serveren, at netop denne chat er
 *   åben, så man ikke bliver varslet om beskeder, man sidder og læser. I det
 *   gamle repo skrev klienten trofast det samme felt — men ingen læste det.
 */

/** Beskeder tættere på hinanden end dette grupperes under ét navn. */
const SAMLE_VINDUE_MS = 5 * 60 * 1000;

export function Chat({
  channelId,
  minUserId,
  onVaelgPerson,
}: {
  channelId: Id<"kanaler">;
  minUserId: Id<"users"> | undefined;
  onVaelgPerson: (userId: Id<"users">) => void;
}) {
  const beskeder = useQuery(api.messages.getMessages, { channelId });
  // Optimistisk: beskeden står i tråden, i det sekund man trykker send, og
  // erstattes af serverens, når den lander. Uden dækning bliver den stående,
  // indtil Convex faar sendt den — man har ikke tabt det, man skrev.
  const sendMessage = useSendMessage();
  const markerLaest = useMutation(api.messages.markerLaest);
  const setAktivChat = useMutation(api.messages.setAktivChat);

  const [tekst, setTekst] = useState("");
  const [fejl, setFejl] = useState<string | undefined>();
  const bunden = useRef<HTMLDivElement>(null);

  // Til stede, så længe chatten er åben OG synlig. Ryddes i oprydningen, også
  // når man skifter Kanal — ellers ville serveren tro, man stadig kigger på
  // den forrige.
  //
  // `visibilitychange` er med, fordi det almindelige er at låse telefonen med
  // appen åben. Uden det ville man stå som "læser med" resten af aftenen og
  // aldrig blive varslet. Det er et bedste forsøg: lukkes fanen brat, når
  // mutationen ikke altid frem. Serveren bør derfor på sigt også have et
  // udløb på feltet — noteret her, fordi det først bider, når varslinger
  // faktisk leveres.
  useEffect(() => {
    const meld = () => {
      void setAktivChat(document.hidden ? {} : { channelId });
    };

    meld();
    document.addEventListener("visibilitychange", meld);

    return () => {
      document.removeEventListener("visibilitychange", meld);
      void setAktivChat({});
    };
  }, [channelId, setAktivChat]);

  // Læst — ved åbning og hver gang den nyeste besked skifter. At markere på
  // hver ny besked er ikke overflødigt: det ER definitionen på at læse med.
  const nyesteAt = beskeder?.[beskeder.length - 1]?.createdAt;
  useEffect(() => {
    void markerLaest({ channelId });
  }, [channelId, nyesteAt, markerLaest]);

  // Ny besked → rul ned. `auto` frem for `smooth`, fordi en animation midt i
  // en samtale får listen til at hoppe, mens man læser.
  useEffect(() => {
    bunden.current?.scrollIntoView({ block: "end" });
  }, [nyesteAt]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const raa = tekst.trim();
    if (raa.length === 0) return;

    // Feltet tømmes med det samme: skrives der videre, mens kaldet er
    // undervejs, må det nye ikke blive slettet af svaret.
    setTekst("");
    setFejl(undefined);

    try {
      await sendMessage({ channelId, text: raa });
    } catch (error) {
      setFejl(fejltekst(error));
      setTekst(raa);
    }
  };

  return (
    <div className="chat">
      {beskeder === undefined ? (
        <p className="midtstillet">Henter beskeder …</p>
      ) : beskeder.length === 0 ? (
        <div className="tom">
          <div className="stort">💬</div>
          <p>Ingen har sagt noget endnu.</p>
          <p className="hjaelp">
            Beskeder forsvinder af sig selv efter et døgn.
          </p>
        </div>
      ) : (
        <div className="beskeder">
          {beskeder.map((besked, nummer) => {
            const forrige = beskeder[nummer - 1];
            // Samme afsender kort efter sig selv: gentag ikke navn og avatar.
            const samlet =
              forrige !== undefined &&
              forrige.senderId === besked.senderId &&
              besked.createdAt - forrige.createdAt < SAMLE_VINDUE_MS &&
              getDrinkDayStart(forrige.createdAt) ===
                getDrinkDayStart(besked.createdAt);

            // DRIKKEDAGEN, ikke kalenderdagen — kl. 02 hører til aftenen
            // før, og det er den grænse, resten af appen regner efter.
            const nyDag =
              forrige === undefined ||
              getDrinkDayStart(forrige.createdAt) !==
                getDrinkDayStart(besked.createdAt);

            return (
              <Fragment key={besked._id}>
                {nyDag && (
                  <span className="dagsskel etiket">
                    {dagsnavn(besked.createdAt)}
                  </span>
                )}
                <div
                  className={
                    besked.senderId === minUserId
                      ? samlet
                        ? "besked min samlet"
                        : "besked min"
                      : samlet
                        ? "besked samlet"
                        : "besked"
                  }
                >
                  {!samlet && besked.senderId !== minUserId && (
                    <button
                      className="afsender"
                      onClick={() => onVaelgPerson(besked.senderId)}
                    >
                      <Avatar
                        emoji={besked.senderEmoji}
                        navn={besked.senderName}
                        farve={undefined}
                      />
                      <span className="navn">{besked.senderName}</span>
                    </button>
                  )}
                  <div className="boble">
                    {besked.text}
                    <span className="tid">{klokken(besked.createdAt)}</span>
                  </div>
                </div>
              </Fragment>
            );
          })}
          <div ref={bunden} />
          {/* Fodnoten stod kun i den TOMME tilstand — men det er, mens man
              skriver, at det er værd at vide, at det forsvinder igen. */}
          <p className="chatfod">
            Beskeder forsvinder af sig selv efter et døgn.
          </p>
        </div>
      )}

      <form className="skriver" onSubmit={(event) => void send(event)}>
        <input
          className="felt"
          value={tekst}
          placeholder="Skriv en besked"
          maxLength={BESKED_MAX_LAENGDE}
          enterKeyHint="send"
          onChange={(event) => setTekst(event.target.value)}
        />
        <button
          className="sendknap"
          type="submit"
          disabled={tekst.trim().length === 0}
          aria-label="Send"
        >
          <SendIkon />
        </button>
      </form>

      {fejl !== undefined && <p className="fejl">{fejl}</p>}
    </div>
  );
}

/**
 * "I dag", "I går" — eller datoen, hvis en besked mod forventning er ældre.
 *
 * Regnet på DRIKKEDAGEN, ikke kalenderdagen: kl. 02 er man stadig i aftenen
 * før, og en skillelinje ved midnat ville dele én aften i to.
 *
 * Beskeder ryddes efter et døgn (se convex/crons.ts), så de to første
 * tilfælde dækker i praksis alt. Den sidste er der, fordi "i praksis" ikke
 * er det samme som "altid" — en cron, der ikke er kørt, må ikke give en
 * skillelinje uden navn.
 */
function dagsnavn(tidspunkt: number): string {
  const dag = getDrinkDayStart(tidspunkt);
  const idag = getDrinkDayStart(Date.now());

  if (dag === idag) return "I dag";

  const etDoegn = 24 * 60 * 60 * 1000;
  if (idag - dag <= etDoegn) return "I går";

  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "long",
  }).format(new Date(dag));
}
