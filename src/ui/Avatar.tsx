import { gradientFor } from "../lib/visning";

/**
 * Avataren: en emoji på en farvet cirkel.
 *
 * Farven kommer fra `users.avatarColor` (ét af syv navne) og emojien fra
 * `users.emoji`. Har brugeren ikke valgt en emoji, bruges forbogstavet i
 * navnet — det er stadig genkendeligt på en liste, hvor en tom cirkel ikke er.
 */
export function Avatar({
  emoji,
  navn,
  farve,
  stor = false,
}: {
  emoji?: string;
  navn: string;
  farve?: string;
  stor?: boolean;
}) {
  const tegn = emoji ?? navn.trim().charAt(0).toLocaleUpperCase("da-DK") ?? "?";

  return (
    <div
      className={stor ? "avatar stor" : "avatar"}
      style={{ background: gradientFor(farve) }}
      aria-hidden="true"
    >
      {tegn}
    </div>
  );
}
