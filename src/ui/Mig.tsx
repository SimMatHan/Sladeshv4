import { useRef, useState } from "react";
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
import { TandhjulIkon, VinkelIkon } from "./Ikoner";
import { Indstillinger } from "./Indstillinger";
import { Orb } from "./Orb";
import { tik } from "./haptik";
import { levendeStime } from "../../convex/streaks";
import { Stimestribe } from "./Stimestribe";

/**
 * Mig — den anden af de to faner.
 *
 * Egne tal, egne achievements, og de handlinger der kun angår én selv.
 * Nulstil run ligger HER og ikke på forsiden: den fjerner ens plads på listen
 * for resten af dagen, og det er ikke til at fortryde. Det er den ene
 * handling i appen, der spørger.
 *
 * Skærmens hero er en levende kugle med ét stort tal, og tre tal at vælge
 * det iblandt: I AFTEN, PROMILLE og STIME. Man skifter ved at swipe eller
 * ved at trykke på tallet under. Se `Hero` nedenfor og `Orb.tsx`.
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
        stime={levendeStime({
          now: Date.now(),
          currentDayStreak: mig.currentDayStreak,
          lastDrinkDayStart: mig.lastDrinkDayStart,
        })}
        laengsteStime={mig.longestStreak ?? 0}
        onIndstil={() => setIndstillingerAabne(true)}
      />

      {/* Rækkefølgen er tidsmæssig: heroet er I AFTEN, striben er UGEN,
          mærket er DET NÆSTE. */}
      {/* Den LEVENDE stime, ikke tælleren. `currentDayStreak` opdateres kun,
          når nogen logger noget, så striben sagde "2 dage" dagen efter man
          havde misset — ikke forkert regnet, bare ikke sandt længere. Samme
          funktion som "Ingen hviledag" måler med, så de to ikke kan komme
          til at vise hver sit. */}
      <Stimestribe
        stime={levendeStime({
          now: Date.now(),
          currentDayStreak: mig.currentDayStreak,
          lastDrinkDayStart: mig.lastDrinkDayStart,
        })}
      />

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
 * KUGLEN BLIVER ALDRIG FÆRDIG.
 *
 * Den målte før mod et loft: 20 genstande gav en fuldt mættet kugle, og
 * genstand 21 og 35 så ud præcis som genstand 20. Det var forkert på to
 * måder. Det gjorde 20 til et MÅL — noget man går efter, og så er aftenen
 * ligesom overstået — og det gjorde kuglen blind for alt derover, netop
 * på de aftener hvor der var mest at vise.
 *
 * Man logger, hvad man har lyst til. Kuglen skal følge med hele vejen.
 *
 * Derfor HALVERING frem for loft: hvert skridt lukker halvdelen af det, der
 * er tilbage op til fuld mætning. Kurven nærmer sig 1 uden nogensinde at nå
 * den, så der er altid et stykke igen, og enhver logning rykker noget.
 *
 *   1 - 0.5^(værdi / halvering)
 *
 * Til gengæld rykker den MEST i starten, hvor man kan se forskel, og mindre
 * og mindre derefter. Det er den ærlige form: forskellen på 2 og 3 genstande
 * betyder mere end forskellen på 32 og 33, og en skala der behandlede dem
 * ens, ville enten sprænge i toppen eller stå stille i bunden.
 *
 * Tallene nedenfor er altså IKKE mål. De er kun, hvor kuglen er halvvejs.
 */
function intensitetAf(vaerdi: number, halvering: number): number {
  // `!(x > 0)` frem for `x <= 0`, fordi den også fanger NaN. Et manglende
  // tal skal give en rolig kugle, ikke en ugyldig CSS-værdi.
  if (!(vaerdi > 0)) return 0;
  return 1 - Math.pow(0.5, vaerdi / halvering);
}

/**
 * Halvvejs ved otte genstande.
 *
 * Den ene af de tre, der IKKE er lånt, og det er med vilje. Appens etablerede
 * genstandstal — 20 for Full Bender, 10 for Obeerma — er alle sammen
 * achievement-mål, og at bruge et mål som kuglens halvvejspunkt ville hente
 * præcis dén "gå efter tallet"-følelse ind igen ad bagvejen.
 *
 * Otte er valgt efter en almindelig aften: de første par genstande rykker
 * tydeligt, en våd aften er godt oppe, og en meget våd aften har stadig et
 * stykke igen.
 */
const GENSTANDE_HALVERING = 8;

/**
 * Halvvejs ved 0,8 ‰ — hvor `beruselsesniveau()` i convex/promilleRules.ts
 * skifter fra "Let påvirket" til "Beruset".
 *
 * Lånt, fordi grænsen her betyder det samme som kuglen siger: det er
 * appens eget skel mellem "har fået noget" og "er påvirket".
 */
const PROMILLE_HALVERING = 0.8;

/**
 * Halvvejs ved "Ingen hviledag"s syv dage, som ugestriben lige under kuglen
 * allerede viser.
 *
 * En uge er værd at kunne se på kuglen — men den er nu MIDTEN, ikke enden.
 * Dag 8 og 20 bliver ved med at gøre den varmere.
 */
const STIME_HALVERING = (() => {
  const def = findAchievement("ingen_hviledag");
  return def === undefined ? 7 : taerskelFor(def);
})();

/**
 * Mig-fanens hero — én levende kugle med ét tal, og tre tal at vælge det
 * iblandt.
 *
 * Forlægget er Ultrahumans ringapp. Kuglen selv bor i Orb.tsx; her ligger
 * VALGET af, hvad den viser.
 *
 * ## Tre tal, ikke ét kort med det hele
 *
 * Her stod ét kort med genstande, promille, en bjælke og to hjælpelinjer —
 * fem oplysninger på én flade, alle lige store. Nu er der ét stort tal ad
 * gangen, og de to andre står som små tal under, klar til at blive valgt.
 * Det er den samme information; forskellen er, at skærmen nu siger, hvad
 * der er vigtigst, i stedet for at overlade det til øjet.
 *
 * Rækkefølgen er aftenens: hvor meget har jeg fået (I AFTEN), hvad gør det
 * ved mig (PROMILLE), og hvor længe har jeg holdt det gående (STIME).
 *
 * ## Man skifter ved at swipe ELLER ved at trykke
 *
 * Swipet er det, forlægget gør, og det er rart. Men det er også usynligt,
 * og en handling, man ikke kan se, findes ikke for den, der ikke prøver.
 * Tallene under kuglen er derfor rigtige knapper med `role="tab"` — samme
 * mønster som `Faner`, så tastatur og skærmlæser kommer med.
 *
 * ## Vis intet, du ikke ved
 *
 * Hvert tal kan mangle for sig. Promillen kræver vægt og køn; er de ikke
 * udfyldt, står feltet som en vej til Indstillinger frem for som et gæt
 * eller et nul. Uden aktiv Kanal er der ingen genstande at tælle. Se
 * docs/redesign-kontrakt.md afsnit 7.
 */
type Orbvalg = "aften" | "promille" | "stime";

/** Hvor langt fingeren skal føres, før det tæller som et swipe. */
const SWIPELAENGDE = 44;

const ORBRAEKKEFOELGE: readonly Orbvalg[] = ["aften", "promille", "stime"];

function Hero({
  channelId,
  stilling,
  minUserId,
  minPromille,
  sidsteGenstandAt,
  stime,
  laengsteStime,
  onIndstil,
}: {
  channelId: Id<"kanaler"> | undefined;
  stilling: ScoreboardRaekker | undefined;
  minUserId: Id<"users">;
  minPromille: PromilleSvar | undefined;
  sidsteGenstandAt: number | undefined;
  stime: number;
  laengsteStime: number;
  onIndstil: () => void;
}) {
  const [valg, setValg] = useState<Orbvalg>("aften");
  const traek = useRef<{ x: number; y: number } | undefined>(undefined);

  // Man kan mangle på listen uden at det er en fejl — scoreboardet viser kun
  // dem der er MED i dag. Har man hverken logget eller checket ind, er
  // svaret ægte 0, ikke et opslag der fejlede.
  const egenRaekke = stilling?.find((raekke) => raekke.userId === minUserId);
  const drukketIDag = egenRaekke?.drinksToday ?? 0;
  const henter = stilling === undefined && channelId !== undefined;
  const mangler = Math.max(AFTENLOFT - drukketIDag, 0);

  const kanPromille =
    minPromille !== undefined &&
    minPromille.konfigureret &&
    minPromille.promille !== null;

  const skift = (ny: Orbvalg) => {
    if (ny === valg) return;
    setValg(ny);
    // Kvitteringen for et valg, man har taget med fingeren. Gør intet på
    // iOS — se haptik.ts.
    tik();
  };

  /** Et skridt til siden. Standser i enderne frem for at rulle rundt: en
      liste på tre, der er cirkulær, føles som om man har mistet overblikket. */
  const skridt = (retning: 1 | -1) => {
    const i = ORBRAEKKEFOELGE.indexOf(valg) + retning;
    if (i < 0 || i >= ORBRAEKKEFOELGE.length) return;
    skift(ORBRAEKKEFOELGE[i]);
  };

  const felter: Record<
    Orbvalg,
    { etiket: string; tal: string; under?: string; intensitet: number }
  > = {
    aften: {
      etiket: "I aften",
      tal: henter ? "–" : genstande(drukketIDag),
      under:
        mangler === 0
          ? "Full Bender \u{1F37B}"
          : `${genstande(mangler)} til Full Bender`,
      // Mens stillingen hentes, står tallet som "–", og en kugle der glødede
      // bag en tankestreg ville love noget, vi endnu ikke ved.
      intensitet: henter ? 0 : intensitetAf(drukketIDag, GENSTANDE_HALVERING),
    },
    promille: {
      etiket: "Promille",
      tal: kanPromille
        ? promille(minPromille.promille as number).replace(" \u2030", "")
        : "–",
      under: kanPromille ? sidsteGenstand(sidsteGenstandAt) : "Udfyld vægt og køn",
      // Uden vægt og køn er der intet at afspejle — feltet er en vej til
      // Indstillinger, ikke et tal. Se "Vis intet, du ikke ved" ovenfor.
      intensitet: kanPromille
        ? intensitetAf(minPromille.promille as number, PROMILLE_HALVERING)
        : 0,
    },
    stime: {
      etiket: stime === 1 ? "Dag i træk" : "Dage i træk",
      tal: String(stime),
      under: laengsteStime > 0 ? `Længste ${laengsteStime}` : "Ingen stime endnu",
      intensitet: intensitetAf(stime, STIME_HALVERING),
    },
  };

  const aktiv = felter[valg];
  const indeks = ORBRAEKKEFOELGE.indexOf(valg);

  return (
    <div
      className="orbhero"
      onPointerDown={(event) => {
        traek.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const t = traek.current;
        traek.current = undefined;
        if (t === undefined) return;

        const dx = event.clientX - t.x;
        // VANDRET skal vinde over lodret. Uden det ville en rulning ned ad
        // siden, der starter oven på kuglen, skifte tal undervejs.
        if (Math.abs(dx) < SWIPELAENGDE || Math.abs(dx) < Math.abs(event.clientY - t.y)) {
          return;
        }
        skridt(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        traek.current = undefined;
      }}
    >
      {/* `key` tvinger en ny kugle frem ved hvert skifte, så tallet toner
          ind i stedet for at hoppe fra et ciffer til et andet. */}
      {/*
        PILENE SIGER, AT DER ER MERE TIL SIDERNE.
        Swipet var usynligt: kuglen så ud som ét tal, og de tre knapper under
        den kunne lige så godt være en visning. En pil i hver side er det, en
        telefonbruger læser uden at tænke over det, og den lille bevægelse
        udad gør det til en opfordring frem for en pynt.

        De SLUKKES frem for at fjernes i enderne — rækken ruller ikke rundt,
        og en pil, der forsvandt, ville flytte kuglen et par pixels til
        siden, hver gang man skiftede.
      */}
      <div className="orbmidte">
        <span
          className={indeks === 0 ? "orbpil venstre slukket" : "orbpil venstre"}
          aria-hidden="true"
        >
          <VinkelIkon />
        </span>

        <Orb
          key={valg}
          tal={aktiv.tal}
          etiket={aktiv.etiket}
          undertekst={aktiv.under}
          intensitet={aktiv.intensitet}
        />

        <span
          className={
            indeks === ORBRAEKKEFOELGE.length - 1 ? "orbpil slukket" : "orbpil"
          }
          aria-hidden="true"
        >
          <VinkelIkon />
        </span>
      </div>

      <div className="orbvaelger" role="tablist" aria-label="Vælg tal">
        {ORBRAEKKEFOELGE.map((id) => {
          const felt = felter[id];
          const valgt = id === valg;

          // Promillen uden vægt og køn er den ene, der fører et andet sted
          // hen: den er ikke et tal, man kan vælge, men noget der mangler.
          if (id === "promille" && !kanPromille && minPromille !== undefined) {
            return (
              <button key={id} className="orbstat mangler" onClick={onIndstil}>
                <span className="etiket">Promille</span>
                <span className="vaerdi">Udfyld →</span>
              </button>
            );
          }

          return (
            <button
              key={id}
              role="tab"
              aria-selected={valgt}
              className={valgt ? "orbstat valgt" : "orbstat"}
              onClick={() => skift(id)}
            >
              <span className="etiket">{felt.etiket}</span>
              <span className="vaerdi">{felt.tal}</span>
            </button>
          );
        })}
      </div>
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
        </div>

        <span className="taettesthoejre">
          <span className="hjaelp taettesttal">
            {oplaaste}/{achievements.length}
          </span>
          <span className="taettestvinkel" aria-hidden="true">
            <VinkelIkon />
          </span>
        </span>
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
      </div>

      <span className="taettesthoejre">
        <span className="hjaelp taettesttal">
          {naesteMilepael.current}/{naesteMilepael.threshold}
        </span>
        <span className="taettestvinkel" aria-hidden="true">
          <VinkelIkon />
        </span>
      </span>
    </button>
  );
}

/*
 * EMOJI-STRIBEN ER VÆK.
 *
 * `Medaljestribe` tegnede alle tolv mærker som emojier under fremdriften,
 * de låste nedtonet. Tanken var, at den skulle LOKKE.
 *
 * Den lokkede ikke. Tolv emojier i én stribe kan ikke læses som tolv ting
 * — de bliver ét mønster, og fordi de fleste er grå, ligner mønsteret mest
 * af alt en fejl. Kortet havde seks ting at se på (billede, etiket, titel,
 * bjælke, stribe, tæller og en "se alle"-linje), og det blev en visning,
 * man skulle afkode, frem for en dør, man kunne trykke på.
 *
 * Fremdriftsbjælken røg med af samme grund: `0/1` til højre siger allerede
 * det samme med færre streger.
 *
 * Mærkerne findes stadig — med billede, navn, fremdrift og historik — inde
 * i hylden, som knappen fører hen til. Det er dér, man kan nå at se på dem.
 */
