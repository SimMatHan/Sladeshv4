import { AVATAR_COLORS, EMOJI_MAX, NAVN_MAX } from "../../convex/constants";
import { gradientFor } from "../lib/visning";
import { Avatar } from "./Avatar";

/**
 * Hvem er du: navn, emoji og farve.
 *
 * Delt mellem onboarding og indstillinger, fordi det er de samme tre felter —
 * første gang og hver gang. Havde de to skærme haft hver sin kopi, ville de
 * skride fra hinanden, første gang der kom et felt til.
 *
 * Komponenten gemmer ikke selv. Onboarding vil sige "Fortsæt" og
 * indstillingerne "Gem", og hvad der sker bagefter er også forskelligt.
 */

/**
 * Emojier at vælge imellem.
 *
 * Et lille udvalg frem for en fuld emoji-vælger: man skal kunne trykke sig
 * igennem det på et sekund, og en avatar skal kunne kendes fra de andre på en
 * liste. Feltet nedenunder tager alt andet, for dem der har noget bestemt i
 * tankerne.
 */
const EMOJIER = [
  "🍺", "🍷", "🥃", "🍸", "🍾", "🌮",
  "🚀", "🔥", "⚡", "🎯", "🎸", "🏆",
  "🐻", "🦊", "🐺", "🦅", "🐙", "🦖",
  "😎", "🤠", "🥳", "👑", "💀", "🫡",
];

export type Profilvaerdier = {
  displayName: string;
  emoji: string | undefined;
  avatarColor: string;
};

export function ProfilFelter({
  vaerdier,
  onAendret,
}: {
  vaerdier: Profilvaerdier;
  onAendret: (naeste: Profilvaerdier) => void;
}) {
  const saet = (aendring: Partial<Profilvaerdier>) =>
    onAendret({ ...vaerdier, ...aendring });

  return (
    <>
      {/* Forhåndsvisning øverst: man skal kunne se, hvad de andre kommer til
          at se, mens man vælger — ikke bagefter. */}
      <div className="profiltop">
        <Avatar
          emoji={vaerdier.emoji}
          navn={vaerdier.displayName}
          farve={vaerdier.avatarColor}
          stor
        />
        <div>
          <div className="navn">{vaerdier.displayName || "Dit navn"}</div>
          <div className="email">Sådan ser du ud på stillingen</div>
        </div>
      </div>

      <div className="arkgruppe">
        <h3>Navn</h3>
        <input
          className="felt"
          value={vaerdier.displayName}
          maxLength={NAVN_MAX}
          placeholder="Hvad kalder de dig?"
          onChange={(event) => saet({ displayName: event.target.value })}
        />
      </div>

      <div className="arkgruppe">
        <h3>Emoji</h3>
        <div className="emojigitter">
          {EMOJIER.map((emoji) => (
            <button
              key={emoji}
              className="emojiknap"
              aria-pressed={vaerdier.emoji === emoji}
              onClick={() =>
                // Et tryk på den valgte fjerner den igen. Så kan man komme
                // tilbage til forbogstavet uden at skulle finde en "ingen".
                saet({ emoji: vaerdier.emoji === emoji ? undefined : emoji })
              }
            >
              {emoji}
            </button>
          ))}
        </div>
        <input
          className="felt"
          value={vaerdier.emoji ?? ""}
          maxLength={EMOJI_MAX}
          placeholder="… eller skriv en anden"
          onChange={(event) =>
            saet({ emoji: event.target.value.trim() || undefined })
          }
        />
      </div>

      <div className="arkgruppe">
        <h3>Farve</h3>
        <div className="farver">
          {AVATAR_COLORS.map((farve) => (
            <button
              key={farve.name}
              className="farve"
              aria-pressed={vaerdier.avatarColor === farve.name}
              aria-label={farve.name}
              style={{ background: gradientFor(farve.name) }}
              onClick={() => saet({ avatarColor: farve.name })}
            />
          ))}
        </div>
      </div>
    </>
  );
}
