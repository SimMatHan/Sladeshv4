import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * Broadcast-bjælken — admins besked til alle, i toppen af appen.
 *
 * ## Hvorfor den er her og ikke i en notifikation
 *
 * I det gamle repo blev en broadcast leveret som push. Den kanal findes ikke
 * i v4 endnu, så beskeden ville ingen steder nå. En bjælke i appen når dem,
 * der åbner appen — hvilket er alle, der overhovedet kan reagere på den.
 *
 * ## Om at lukke den
 *
 * Lukningen huskes i `sessionStorage`, ikke på serveren. En broadcast er
 * kortlivet og gælder alle; at give hver bruger en "læst"-række i databasen
 * ville være en tabel mere at holde ved lige for en besked, der slukkes igen
 * om et par timer. Prisen er, at bjælken kommer igen i en ny fane — og det er
 * den rigtige vej at fejle for noget, admin har vurderet vigtigt nok til at
 * sende ud.
 */
export function Broadcastbjaelke() {
  const broadcasts = useQuery(api.broadcasts.getMineBroadcasts, {});
  const [lukkede, setLukkede] = useState<readonly string[]>(() => laesLukkede());

  if (broadcasts === undefined || broadcasts.length === 0) return null;

  const synlige = broadcasts.filter((broadcast) => !lukkede.includes(broadcast._id));
  if (synlige.length === 0) return null;

  const luk = (id: string) => {
    const opdateret = [...lukkede, id];
    setLukkede(opdateret);
    gemLukkede(opdateret);
  };

  return (
    <>
      {synlige.map((broadcast) => (
        <div key={broadcast._id} className="broadcast" role="status">
          <div className="broadcastindhold">
            <div className="broadcasttitel">{broadcast.title}</div>
            <div className="broadcasttekst">{broadcast.body}</div>
          </div>
          <button
            className="broadcastluk"
            aria-label="Luk beskeden"
            onClick={() => luk(broadcast._id)}
          >
            ×
          </button>
        </div>
      ))}
    </>
  );
}

const NOEGLE = "lukkedeBroadcasts";

/**
 * `sessionStorage` kaster i private vinduer og når lagring er slået fra. En
 * bjælke, der ikke kan huske at være lukket, er stadig bedre end en app, der
 * ikke starter.
 */
function laesLukkede(): readonly string[] {
  try {
    const gemt = sessionStorage.getItem(NOEGLE);
    if (gemt === null) return [];
    const parsed: unknown = JSON.parse(gemt);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function gemLukkede(ider: readonly string[]): void {
  try {
    sessionStorage.setItem(NOEGLE, JSON.stringify(ider));
  } catch {
    // Ingen lagring tilgængelig. Bjælken kommer igen ved genindlæsning.
  }
}
