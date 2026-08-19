import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  AFSENDER_STANDARD_EMOJI,
  AFSENDER_STANDARD_GRADIENT,
  AFSENDER_STANDARD_NAVN,
} from "../../convex/messageRules";
import { medGenstand, vaegtForStoerrelse } from "./optimistisk";

/**
 * Mutations, der viser resultatet med det samme.
 *
 * Convex' `withOptimisticUpdate` skriver et gæt ind i klientens egen kopi af
 * queryresultaterne. Alle `useQuery` på det resultat gentegner øjeblikkeligt,
 * og gættet ryger af sig selv, når serverens svar lander — også hvis mutationen
 * fejler. Man kan altså ikke komme til at efterlade skærmen i en løgn.
 *
 * Kun de to hyppigste handlinger har det: at logge en genstand og at sende en
 * besked. Resten af appen er ting, man gør sjældent, og hvor en halv brøkdel
 * af et sekund ikke er forskellen på, om appen føles i live.
 *
 * Reglerne for, HVAD gættet er, ligger i src/lib/optimistisk.ts, hvor de kan
 * afprøves uden en browser.
 */

export function useLogDrink() {
  return useMutation(api.drinkLogs.logDrink).withOptimisticUpdate(
    (localStore, args) => {
      const mig = localStore.getQuery(api.users.getMe, {});
      if (mig === undefined || mig === null) return;

      // `logDrink` uden channelId logger i ens aktive Kanal — samme regel som
      // serveren. Er der ingen, er der heller ingen stilling at flytte.
      const channelId = args.channelId ?? mig.activeChannelId;
      if (channelId === undefined) return;

      const raekker = localStore.getQuery(api.scoreboard.getScoreboard, {
        channelId,
      });
      // Står stillingen ikke åben, er der ingenting at gætte på. Serverens
      // svar bygger den, når den bliver vist.
      if (raekker === undefined) return;

      localStore.setQuery(
        api.scoreboard.getScoreboard,
        { channelId },
        medGenstand(
          raekker,
          {
            userId: mig._id,
            name: mig.displayName || "Anonym",
            avatar: mig.emoji ?? "🍺",
            // Farven kan ramme ved siden af for dem, der aldrig har valgt en:
            // serveren udleder da en ud fra bruger-id'et. Den retter sig selv
            // et øjeblik senere, og en avatar i den forkerte farve i et halvt
            // sekund er en billigere pris end en stilling, der står stille.
            color: mig.avatarColor ?? "amber",
            profileEmoji: mig.profileEmoji,
            profileGradient: mig.profileGradient,
          },
          vaegtForStoerrelse(args.categoryId, args.sizeId),
          Date.now(),
        ),
      );
    },
  );
}

export function useSendMessage() {
  return useMutation(api.messages.sendMessage).withOptimisticUpdate(
    (localStore, args) => {
      const mig = localStore.getQuery(api.users.getMe, {});
      if (mig === undefined || mig === null) return;

      const beskeder = localStore.getQuery(api.messages.getMessages, {
        channelId: args.channelId,
      });
      if (beskeder === undefined) return;

      const nu = Date.now();

      // Et midlertidigt id. Det bruges kun som React-nøgle, indtil serverens
      // rigtige besked træder i stedet — derfor et præfiks, så det aldrig kan
      // forveksles med et rigtigt Convex-id, hvis det skulle slippe ud.
      const foreloebigtId = `optimistisk-${nu}-${Math.random()}` as Id<"messages">;

      const foreloebig: Doc<"messages"> = {
        _id: foreloebigtId,
        _creationTime: nu,
        channelId: args.channelId,
        senderId: mig._id,
        text: args.text.trim(),
        createdAt: nu,
        senderName: mig.displayName.trim() || AFSENDER_STANDARD_NAVN,
        senderEmoji: mig.profileEmoji ?? AFSENDER_STANDARD_EMOJI,
        senderGradient: mig.profileGradient ?? AFSENDER_STANDARD_GRADIENT,
      };

      localStore.setQuery(
        api.messages.getMessages,
        { channelId: args.channelId },
        [...beskeder, foreloebig],
      );
    },
  );
}
