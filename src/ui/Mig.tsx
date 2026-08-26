import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { findAchievement, taerskelFor } from "../../convex/achievementRules";
import { getDrinkDayStart } from "../../convex/constants";
import { useAuth } from "../contexts/AuthContext";
import { fejltekst, genstande, promille } from "../lib/visning";
import { Achievements } from "./Achievements";
import { Admin } from "./Admin";
import { Avatar } from "./Avatar";
import { Fremdriftsring } from "./Fremdriftsring";
import { TandhjulIkon } from "./Ikoner";
import { Indstillinger } from "./Indstillinger";
import { Stimestribe } from "./Stimestribe";

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
 * docs/redesign-oplaeg.md, afsnit 1.
 *
 * Under ringene står stimen som en stribe over ugen (Stimestribe.tsx).
 * Ringene er I AFTEN; striben er de syv dage, der førte hertil. Livstidspoint
 * og længste stræk er ægte information, men ikke skærmens hovedsag, og står
 * som én dæmpet linje til sidst.
 *
 * Trofæhylden og admin åbner som ark herfra — det er dét, `/achievements` og
 * `/admin` blev til, jf. rutekortet i docs/skaermkortlaegning.md. Admin-
 * knappen vises kun til admins, men det er `requireAdmin` på serveren, der
 * beskytter handlingerne; her skjules den blot.
 *
 * SENERE: støt-appen. Den hører også til her, jf. docs/brugerrejser.md.
 */
export function Mig({
  channelId,
  onOplaasninger,
}: {
  channelId: Id<"kanaler"> | undefined;
  /**
   * Melder achievements op til skallen, som ejer fejringskøen.
   *
   * `resetRun` kan låse op — "Are you sure about that?" tæller netop
   * nulstillinger — så en nulstilling herfra skal fejres som en logning.
   */
  onOplaasninger: (ider: string[]) => void;
}) {
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
      const resultat = await resetRun({ channelId });
      setSpoerger(false);
      if (resultat.nyeAchievements.length > 0) {
        onOplaasninger(resultat.nyeAchievements);
      }
    } catch (error) {
      setFejl(fejltekst(error));
    } finally {
      setArbejder(false);
    }
  };

  return (
    <>
      {/* Emailen er væk. Den bekræftede, hvem man er logget ind som — det
          hører hjemme i Indstillinger, ikke på den skærm man åbner hver
          aften. Tandhjulet står i stedet dér, hvor man kigger efter sig
          selv, og tager en knap ud af bunken forneden. */}
      <div className="profiltop">
        <Avatar emoji={mig.emoji} navn={mig.displayName} farve={mig.avatarColor} stor />
        <div className="navnblok">
          <div className="navn">{mig.displayName}</div>
          <Profilundertekst channelId={channelId} />
        </div>
        <button
          className="profilhandling"
          aria-label="Indstillinger"
          onClick={() => setIndstillingerAabne(true)}
        >
          <TandhjulIkon />
        </button>
      </div>

      {/* To ringe, ikke tre. Den tredje — næste mærke — er en fremdrift mod
          en tærskel og læses bedre som en bjælke; se AchievementRaekke. */}
      <div className="kort ringraekker">
        <PromilleRaekke minPromille={minPromille} onIndstil={() => setIndstillingerAabne(true)} />
        <GenstandeRaekke channelId={channelId} stilling={stilling} minUserId={mig._id} />
      </div>

      {/* Rækkefølgen er tidsmæssig: ringene er I AFTEN, striben er UGEN,
          mærket er DET NÆSTE. */}
      <Stimestribe stime={mig.currentDayStreak ?? 0} />

      <AchievementRaekke
        naesteMilepael={naesteMilepael}
        achievements={achievements}
        onAaben={() => setHyldeAaben(true)}
      />

      {/* Livstidstallene BART på baggrunden — etiket over tal, ingen kasse.
          De lånte `.talgitter` fra Admin, og tre hvide kort her oven på
          ringkortet, stimekortet og mærkekortet gjorde skærmen til en
          stak kasser. Se `.livstid` i index.css. */}
      <div className="livstid">
        <div>
          <span className="etiket">Point</span>
          <div className="vaerdi">{genstande(mig.totalPoints ?? 0)}</div>
        </div>
        <div>
          <span className="etiket">Længste</span>
          <div className="vaerdi">{mig.longestStreak ?? 0}</div>
        </div>
        <div>
          <span className="etiket">Check ins</span>
          <div className="vaerdi">{mig.checkInCount ?? 0}</div>
        </div>
      </div>

      <div className="knapraekke">
        {mig.isAdmin === true && (
          <button className="knap" onClick={() => setAdminAabent(true)}>
            Admin
          </button>
        )}

        {spoerger ? (
          <div className="kort bekraeftkort">
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

/**
 * "Ballade · tirsdag" under navnet.
 *
 * Den stod i skallens header sammen med kanalnavnet. Headeren er skjult på
 * denne fane nu (se App.tsx), fordi mockuppen har ÉN titel på Mig og ikke
 * to, og linjen er flyttet herned, hvor design/Main.dc.html har den.
 *
 * Egen komponent, så kun den henter kanalopslaget — samme mønster som
 * `KanalNavn` i App.tsx og underteksterne i Sideundertekst.tsx. Convex
 * deler ét abonnement mellem identiske kald, så opslaget er gratis: skallen
 * henter allerede den samme kanal med de samme argumenter.
 */
function Profilundertekst({ channelId }: { channelId: Id<"kanaler"> | undefined }) {
  const kanal = useQuery(
    api.kanaler.getKanal,
    channelId === undefined ? "skip" : { channelId },
  );

  // DRIKKEDAGEN, ikke kalenderdagen. Kl. 03 om lørdagen står man stadig i
  // fredagens aften, og det er den, resten af appen tæller efter.
  const ugedag = new Intl.DateTimeFormat("da-DK", { weekday: "long" }).format(
    new Date(getDrinkDayStart(Date.now())),
  );

  // Uden Kanal, eller mens den hentes, står ugedagen alene. Et gæt på
  // kanalnavnet ville stå forkert i det halve sekund, opslaget tager.
  const navn = kanal === undefined || kanal === null ? undefined : kanal.name;

  return (
    <span className="undernavn">
      {navn === undefined ? ugedag : `${navn} · ${ugedag}`}
    </span>
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

/**
 * Status → ringvariabel.
 *
 * Den returnerede FØR en rigtig farve: `--medgang`, `--fare`, `--accent`.
 * Det holdt, så længe ringene stod på et neutralt kort. I lys er kortet nu
 * fyldt med accentfarven, og på flaskegrøn er `--medgang` (#1b6b4a) næsten
 * usynlig og `--accent` er selve baggrunden. Hvilken farve der kan læses,
 * afhænger af fladen — og fladen kender kun CSS. Så her vælges kun
 * BETYDNINGEN, og `.ringraekker` i index.css binder den til en farve pr.
 * tema.
 */
function farveForNiveau(status: "online" | "warning" | "danger" | undefined): string {
  if (status === "online") return "var(--ringrolig)";
  if (status === "danger") return "var(--ringfare)";
  return "var(--ringvarsel)"; // "warning", og default mens ukendt
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
    return <p className="midtstillet">Henter achievements …</p>;
  }

  const oplaaste = achievements.filter((a) => a.unlocked).length;

  // `naesteMilepael` er null når alt opnåeligt allerede er låst op — en
  // fejring, ikke en tom tilstand.
  if (naesteMilepael === null) {
    return (
      <button className="kort taettest" onClick={onAaben}>
        <span className="badgebillede lille alt-oplaast" aria-hidden="true">
          🎉
        </span>
        <div className="taettestmidt">
          <span className="etiket">Næste mærke</span>
          <div className="titel">Alle låst op</div>
          <span className="hjaelp">
            {oplaaste} af {achievements.length} optjent
          </span>
          <Medaljestribe achievements={achievements} />
        </div>
      </button>
    );
  }

  const def = findAchievement(naesteMilepael.achievementId);

  return (
    <button className="kort taettest" onClick={onAaben}>
      {/* Genbruger `.badgebillede lille` fra hylden, så mærket ser ens ud
          de to steder det vises. Definitionen har billedet; brugerens
          tæller hører til i hylden og gentages ikke her. */}
      <span className="badgebillede lille">
        {def === undefined ? "🏆" : <img src={def.image} alt="" />}
      </span>

      <div className="taettestmidt">
        <span className="etiket">Tættest på</span>
        <div className="titel">{def?.title ?? "Næste mærke"}</div>
        <div
          className="bjaelke"
          role="progressbar"
          aria-valuenow={naesteMilepael.current}
          aria-valuemin={0}
          aria-valuemax={naesteMilepael.threshold}
          aria-label={`${def?.title ?? "Næste mærke"}: ${naesteMilepael.current} af ${naesteMilepael.threshold}`}
        >
          <div className="fyld" style={{ width: `${naesteMilepael.percentage}%` }} />
        </div>
        <Medaljestribe achievements={achievements} />
      </div>

      <span className="hjaelp taettesttal">
        {naesteMilepael.current}/{naesteMilepael.threshold}
      </span>
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
