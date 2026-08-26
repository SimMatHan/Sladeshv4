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
 * Skærmens hero er aftenens ene tal — genstande i dag, med promillen i
 * hjørnet og en bjælke mod Full Bender. Det var to ringe indtil videre; se
 * `.hero` i index.css for hvorfor de er væk.
 *
 * Under heroet står stimen som en stribe over ugen (Stimestribe.tsx).
 * Heroet er I AFTEN; striben er de syv dage, der førte hertil. Livstidspoint
 * og længste stræk er ægte information, men ikke skærmens hovedsag, og står
 * bart forneden.
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

      <Hero
        channelId={channelId}
        stilling={stilling}
        minUserId={mig._id}
        minPromille={minPromille}
        sidsteGenstandAt={mig.lastDrinkAt}
        onIndstil={() => setIndstillingerAabne(true)}
      />

      {/* Rækkefølgen er tidsmæssig: heroet er I AFTEN, striben er UGEN,
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

/* -------------------------------------------------------------------- heroet */

type PromilleSvar = NonNullable<
  ReturnType<typeof useQuery<typeof api.promille.getMinPromille>>
>;

type ScoreboardRaekker = NonNullable<
  ReturnType<typeof useQuery<typeof api.scoreboard.getScoreboard>>
>;

/**
 * Aftenens loft for fremdriftsbjælken.
 *
 * Genbruger Full Benders tærskel (20 genstande i ét run) fra
 * achievementRules.ts i stedet for at opfinde et nyt tal — 20 på én dag er
 * allerede appens etablerede "det er en stor aften"-reference, og det er
 * dét, hjælpelinjen til højre tæller ned mod.
 *
 * Bemærk at vinduet ikke er identisk: Full Bender måler RUNNET, bjælken
 * her DRIKKEDAGEN (`scoreboard.drinksToday`). Tallet er lånt, ikke
 * definitionen.
 */
const AFTENLOFT = (() => {
  const def = findAchievement("full_bender");
  return def === undefined ? 20 : taerskelFor(def);
})();

/**
 * Mig-fanens hero — ét stort tal, én bjælke, to hjælpelinjer.
 *
 * Se `.hero` i index.css for hvorfor de to ringe er væk, og hvorfor kortet
 * kun er fyldt i lys tilstand.
 *
 * ## Vis intet, du ikke ved
 *
 * Kortet tegnes, så snart det VED noget, og hver linje kan mangle for sig.
 * Promillen kræver vægt og køn; er de ikke udfyldt, står feltet som en
 * knap, der åbner Indstillinger, frem for som et gæt eller et nul. Uden
 * aktiv Kanal er der ingen genstande at tælle. Se
 * docs/redesign-kontrakt.md afsnit 7.
 */
function Hero({
  channelId,
  stilling,
  minUserId,
  minPromille,
  sidsteGenstandAt,
  onIndstil,
}: {
  channelId: Id<"kanaler"> | undefined;
  stilling: ScoreboardRaekker | undefined;
  minUserId: Id<"users">;
  minPromille: PromilleSvar | undefined;
  sidsteGenstandAt: number | undefined;
  onIndstil: () => void;
}) {
  // Man kan mangle på listen uden at det er en fejl — scoreboardet viser kun
  // dem der er MED i dag. Har man hverken logget eller checket ind, er
  // svaret ægte 0, ikke et opslag der fejlede.
  const egenRaekke = stilling?.find((raekke) => raekke.userId === minUserId);
  const drukketIDag = egenRaekke?.drinksToday ?? 0;

  const henter = stilling === undefined && channelId !== undefined;
  const andel = Math.min(drukketIDag / AFTENLOFT, 1);
  const mangler = Math.max(AFTENLOFT - drukketIDag, 0);

  return (
    <div className="kort hero">
      <div className="herotop">
        <div className="heroblok">
          <span className="etiket">I aften</span>
          <div className="herotal">
            <span className="tal">{henter ? "–" : genstande(drukketIDag)}</span>
            <span className="enhed">genstande</span>
          </div>
        </div>

        <Heropromille minPromille={minPromille} onIndstil={onIndstil} />
      </div>

      <div className="herobund">
        <div
          className="herobjaelke"
          role="progressbar"
          aria-valuenow={drukketIDag}
          aria-valuemin={0}
          aria-valuemax={AFTENLOFT}
          aria-label={`${genstande(drukketIDag)} af ${AFTENLOFT} genstande`}
        >
          <div className="fyld" style={{ width: `${andel * 100}%` }} />
        </div>

        <div className="herolinjer">
          <span>{sidsteGenstand(sidsteGenstandAt)}</span>
          <span>
            {mangler === 0
              ? "Full Bender \u{1F37B}"
              : `${genstande(mangler)} til Full Bender`}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Promillen i heroets højre hjørne.
 *
 * `‰`-tegnet er skåret fra: etiketten over tallet siger allerede
 * "Promille", og tegnet ville gøre et 28px-tal til et 28px-tal plus en
 * krølle. Selve formateringen delegeres stadig til `promille()` fra
 * lib/visning.ts — den eneste kilde til komma og decimaler i hele appen —
 * og kun det KENDTE, faste suffiks trimmes bagefter, så der ikke opstår en
 * anden kopi af talformateringen.
 */
function Heropromille({
  minPromille,
  onIndstil,
}: {
  minPromille: PromilleSvar | undefined;
  onIndstil: () => void;
}) {
  if (minPromille === undefined) {
    return (
      <div className="heroblok hoejre">
        <span className="etiket">Promille</span>
        <span className="heropromille tom">–</span>
      </div>
    );
  }

  // Gæt aldrig et tal. Uden vægt og køn regnes der ikke — se getMinPromille.
  if (!minPromille.konfigureret || minPromille.promille === null) {
    return (
      <button className="heroblok hoejre heroknap" onClick={onIndstil}>
        <span className="etiket">Promille</span>
        <span className="heropromille tom">Udfyld →</span>
      </button>
    );
  }

  return (
    <div className="heroblok hoejre">
      <span className="etiket">Promille</span>
      <span className="heropromille">
        {promille(minPromille.promille).replace(" \u2030", "")}
      </span>
    </div>
  );
}

/** "Sidste for 24 min siden" — eller intet at måle fra endnu. */
function sidsteGenstand(sidsteAt: number | undefined): string {
  if (sidsteAt === undefined) return "Ingen genstande endnu";

  const minutter = Math.max(0, Math.round((Date.now() - sidsteAt) / 60000));
  if (minutter < 1) return "Sidste lige nu";
  if (minutter < 60) return `Sidste for ${minutter} min siden`;

  const timer = Math.round(minutter / 60);
  return `Sidste for ${timer} t siden`;
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
