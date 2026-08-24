import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { findAchievement, taerskelFor } from "../../convex/achievementRules";
import { useAuth } from "../contexts/AuthContext";
import { fejltekst, genstande, promille } from "../lib/visning";
import { Achievements } from "./Achievements";
import { Admin } from "./Admin";
import { Avatar } from "./Avatar";
import { Fremdriftsring } from "./Fremdriftsring";
import { Indstillinger } from "./Indstillinger";

/**
 * Mig — den anden af de to faner.
 *
 * Egne tal, egne achievements, og de handlinger der kun angår én selv.
 * Nulstil run ligger HER og ikke på forsiden: den fjerner ens plads på listen
 * for resten af dagen, og det er ikke til at fortryde. Det er den ene
 * handling i appen, der spørger.
 *
 * Skærmens hero er TRE rækker, hver med en ring og et rigtigt tal: promille,
 * dagens genstande, og den achievement man er tættest på. Se
 * docs/redesign-oplaeg.md, afsnit 1. De to gamle tal — livstidspoint og
 * længste stræk — er ikke droppet, kun nedtonet til én linje under ringene;
 * de er ægte information, men ikke skærmens hovedsag.
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
  const naesteMilepael = useQuery(api.achievements.getNaesteMilepael, {});
  const achievements = useQuery(api.achievements.getAchievementsForUser, {});
  const stilling = useQuery(
    api.scoreboard.getScoreboard,
    channelId === undefined ? "skip" : { channelId },
  );
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

  return (
    <>
      <div className="profiltop">
        <Avatar emoji={mig.emoji} navn={mig.displayName} farve={mig.avatarColor} stor />
        <div>
          <div className="navn">{mig.displayName}</div>
          <div className="email">{mig.email}</div>
        </div>
      </div>

      <div className="kort ringraekker">
        <PromilleRaekke minPromille={minPromille} onIndstil={() => setIndstillingerAabne(true)} />
        <GenstandeRaekke channelId={channelId} stilling={stilling} minUserId={mig._id} />
        <AchievementRaekke
          naesteMilepael={naesteMilepael}
          achievements={achievements}
          onAaben={() => setHyldeAaben(true)}
        />
      </div>

      {/* De to gamle talkort — livstidspoint og længste stræk. Ægte tal, men
          ikke skærmens hovedsag længere, så de står som én dæmpet linje. */}
      <p className="hjaelp livstidstal">
        {genstande(mig.totalPoints ?? 0)} point i alt · længste stræk{" "}
        {mig.longestStreak ?? 0} dage
      </p>

      <div className="knapraekke">
        <button className="knap" onClick={() => setIndstillingerAabne(true)}>
          Indstillinger
        </button>

        {mig.isAdmin === true && (
          <button className="knap" onClick={() => setAdminAabent(true)}>
            Admin
          </button>
        )}

        {spoerger ? (
          <div className="kort nulstilbekraeft">
            <p>Din stilling starter forfra. Historikken bliver stående.</p>
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

/* ------------------------------------------------------------------ ringene */

type PromilleSvar = NonNullable<
  ReturnType<typeof useQuery<typeof api.promille.getMinPromille>>
>;

/**
 * Ringens visuelle loft for promille.
 *
 * IKKE en af `beruselsesniveau`s grænser (0.3 / 0.8 / 1.5 i
 * convex/promilleRules.ts) — det tal må ikke duplikeres herude, for så kan de
 * to komme ud af trit. Dette er i stedet et uafhængigt, rundt visningsloft:
 * et helt frit valg af hvornår ringen ser "fuld" ud, og har ingen betydning
 * ud over det. Farven, ikke fyldningsgraden, er det der siger noget om
 * niveauet — se `farveForNiveau` nedenfor.
 */
const PROMILLE_RING_LOFT = 2;

/** Status → farve. Genbruger eksisterende tokens; ingen nye opfundet. */
function farveForNiveau(status: "online" | "warning" | "danger" | undefined): string {
  if (status === "online") return "var(--medgang)";
  if (status === "danger") return "var(--fare)";
  return "var(--accent)"; // "warning", og default mens ukendt
}

/**
 * Promillen uden ‰-tegnet, til at stå inde i en 100px ring.
 *
 * Selve formateringen (komma, to decimaler) delegeres til `promille()` fra
 * lib/visning.ts — den eneste kilde til det format i hele appen. Kun det
 * KENDTE, faste suffiks trimmes bagefter, så der ikke opstår en anden kopi af
 * selve tal-formateringen, der kunne komme ud af trit med den rigtige.
 */
function kompaktPromille(vaerdi: number): string {
  return promille(vaerdi).replace(" ‰", "");
}

function PromilleRaekke({
  minPromille,
  onIndstil,
}: {
  minPromille: PromilleSvar | undefined;
  onIndstil: () => void;
}) {
  if (minPromille === undefined) {
    return (
      <div className="ringraekke">
        <Fremdriftsring andel={0} stoerrelse={100} tykkelse={8} srLabel="Henter promille">
          <span className="ringtal">–</span>
        </Fremdriftsring>
        <div className="ringtekst">
          <span className="titel">Promille</span>
          <span className="hjaelp">Henter …</span>
        </div>
      </div>
    );
  }

  // Gæt aldrig et tal. Uden vægt og køn regnes der ikke — se getMinPromille.
  if (!minPromille.konfigureret || minPromille.promille === null) {
    return (
      <button className="ringraekke ringraekke--knap" onClick={onIndstil}>
        <Fremdriftsring andel={0} stoerrelse={100} tykkelse={8} srLabel="Promille ikke konfigureret">
          <span className="ringtal ringtal--tomt">?</span>
        </Fremdriftsring>
        <div className="ringtekst">
          <span className="titel">Promille</span>
          <span className="hjaelp">Udfyld vægt og køn i indstillinger →</span>
        </div>
      </button>
    );
  }

  const andel = Math.min(minPromille.promille / PROMILLE_RING_LOFT, 1);

  return (
    <div className="ringraekke">
      <Fremdriftsring
        andel={andel}
        stoerrelse={100}
        tykkelse={8}
        farve={farveForNiveau(minPromille.niveau?.status)}
        srLabel={`Promille ${promille(minPromille.promille)}`}
      >
        <span className="ringtal ringtal--kompakt">{kompaktPromille(minPromille.promille)}</span>
      </Fremdriftsring>
      <div className="ringtekst">
        <span className="titel">Promille</span>
        <span className="hjaelp">
          {minPromille.niveau?.label}
          {minPromille.timerTilAedru !== null &&
            minPromille.timerTilAedru > 0 &&
            ` · ædru om ca. ${minPromille.timerTilAedru} t`}
        </span>
      </div>
    </div>
  );
}

type ScoreboardRaekker = NonNullable<
  ReturnType<typeof useQuery<typeof api.scoreboard.getScoreboard>>
>;

/**
 * Ringens visuelle loft for dagens genstande.
 *
 * Genbruger Full Benders tærskel (20, "run_drinks" uden kategori) fra
 * achievementRules.ts, i stedet for at opfinde et nyt tal — 20 genstande på
 * én dag er allerede appens etablerede "det er en stor aften"-reference.
 *
 * Bemærk vinduet ikke er identisk: Full Bender måler RUNNET, denne ring
 * DRIKKEDAGEN (`scoreboard.drinksToday`) — to nært beslægtede, men ikke
 * samme, tidsvinduer. Loftet er lånt for tallet, ikke for definitionen.
 */
const GENSTANDE_RING_LOFT = (() => {
  const def = findAchievement("full_bender");
  return def === undefined ? 20 : taerskelFor(def);
})();

function GenstandeRaekke({
  channelId,
  stilling,
  minUserId,
}: {
  channelId: Id<"kanaler"> | undefined;
  stilling: ScoreboardRaekker | undefined;
  minUserId: Id<"users">;
}) {
  if (channelId === undefined) {
    return (
      <div className="ringraekke">
        <Fremdriftsring andel={0} stoerrelse={100} tykkelse={8} srLabel="Ingen aktiv Kanal">
          <span className="ringtal ringtal--tomt">–</span>
        </Fremdriftsring>
        <div className="ringtekst">
          <span className="titel">I dag</span>
          <span className="hjaelp">Ingen aktiv Kanal</span>
        </div>
      </div>
    );
  }

  if (stilling === undefined) {
    return (
      <div className="ringraekke">
        <Fremdriftsring andel={0} stoerrelse={100} tykkelse={8} srLabel="Henter dagens genstande">
          <span className="ringtal">–</span>
        </Fremdriftsring>
        <div className="ringtekst">
          <span className="titel">I dag</span>
          <span className="hjaelp">Henter …</span>
        </div>
      </div>
    );
  }

  // Man kan mangle på listen uden at det er en fejl — scoreboardet viser kun
  // dem der er MED i dag (logget noget, eller checket ind). Har man ikke gjort
  // nogen af delene, er svaret ægte 0, ikke en fejlende opslag.
  const egenRaekke = stilling.find((r) => r.userId === minUserId);
  const drukketIDag = egenRaekke?.drinksToday ?? 0;

  const andel = Math.min(drukketIDag / GENSTANDE_RING_LOFT, 1);

  return (
    <div className="ringraekke">
      <Fremdriftsring
        andel={andel}
        stoerrelse={100}
        tykkelse={8}
        srLabel={`${genstande(drukketIDag)} genstande i dag`}
      >
        <span className="ringtal">{genstande(drukketIDag)}</span>
      </Fremdriftsring>
      <div className="ringtekst">
        <span className="titel">I dag</span>
        <span className="hjaelp">
          {drukketIDag === 0 ? "Ingen genstande endnu" : "Genstande i Kanalen"}
        </span>
      </div>
    </div>
  );
}

type AchievementListe = NonNullable<
  ReturnType<typeof useQuery<typeof api.achievements.getAchievementsForUser>>
>;
type NaesteMilepael = ReturnType<
  typeof useQuery<typeof api.achievements.getNaesteMilepael>
>;

function AchievementRaekke({
  naesteMilepael,
  achievements,
  onAaben,
}: {
  naesteMilepael: NaesteMilepael;
  achievements: AchievementListe | undefined;
  onAaben: () => void;
}) {
  if (naesteMilepael === undefined || achievements === undefined) {
    return (
      <div className="ringraekke">
        <Fremdriftsring andel={0} stoerrelse={100} tykkelse={8} srLabel="Henter achievements">
          <span className="ringtal">–</span>
        </Fremdriftsring>
        <div className="ringtekst">
          <span className="titel">Næste mærke</span>
          <span className="hjaelp">Henter …</span>
        </div>
      </div>
    );
  }

  const oplaaste = achievements.filter((a) => a.unlocked).length;

  // `naesteMilepael` er null når alt opnåeligt allerede er låst op — en
  // fejring, ikke en tom tilstand.
  if (naesteMilepael === null) {
    return (
      <button className="ringraekke ringraekke--knap" onClick={onAaben}>
        <Fremdriftsring andel={1} stoerrelse={100} tykkelse={8} farve="var(--medgang)" srLabel="Alle achievements låst op">
          <span className="ringtal">🎉</span>
        </Fremdriftsring>
        <div className="ringtekst">
          <span className="titel">Næste mærke</span>
          <span className="hjaelp">
            {oplaaste} af {achievements.length} — alle låst op!
          </span>
          <Medaljestribe achievements={achievements} />
        </div>
      </button>
    );
  }

  const def = findAchievement(naesteMilepael.achievementId);
  const andel = naesteMilepael.percentage / 100;

  return (
    <button className="ringraekke ringraekke--knap" onClick={onAaben}>
      <Fremdriftsring
        andel={andel}
        stoerrelse={100}
        tykkelse={8}
        srLabel={`${def?.title ?? "Næste mærke"}: ${naesteMilepael.current} af ${naesteMilepael.threshold}`}
      >
        <span className="ringtal">
          {naesteMilepael.current}/{naesteMilepael.threshold}
        </span>
      </Fremdriftsring>
      <div className="ringtekst">
        <span className="titel">
          {def?.emoji ?? "🏆"} {def?.title ?? "Næste mærke"}
        </span>
        <span className="hjaelp">
          {oplaaste} af {achievements.length} optjent
        </span>
        <Medaljestribe achievements={achievements} />
      </div>
    </button>
  );
}

/**
 * Emoji-striben. Dens opgave er at LOKKE — de rigtige badges med billeder,
 * fremdrift og historik ligger i hylden bagved arket. Derfor kun emojier,
 * ingen tal, ingen navne: nok til at vække nysgerrighed, ikke til at
 * informere færdigt.
 */
function Medaljestribe({ achievements }: { achievements: AchievementListe }) {
  return (
    <div className="medaljer">
      {achievements.map((achievement) => (
        <span
          key={achievement.achievementId}
          className={achievement.unlocked ? undefined : "laast"}
        >
          {achievement.emoji ?? "🏆"}
        </span>
      ))}
    </div>
  );
}
