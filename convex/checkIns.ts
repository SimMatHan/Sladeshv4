import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getDrinkDayStart } from "./constants";
import { erUdeIDag } from "./drinkRules";
import { requireCanViewUser, requireCurrentUser } from "./identity";
import { varslingUdeIAften } from "./kanaler";

/**
 * Check In.
 *
 * Historik-rækken og de afledte felter på brugeren skrives i SAMME mutation.
 * Convex-mutations er transaktionelle, så enten lander begge dele eller ingen
 * af dem — i den gamle Firebase-app var det to separate writes, der kunne
 * divergere hvis den anden fejlede.
 *
 * Man kan kun checke sig selv ind; identiteten kommer fra tokenet.
 */

export const checkIn = mutation({
  args: {
    venue: v.string(),
    channelId: v.optional(v.id("kanaler")),
    location: v.optional(v.object({ lat: v.number(), lng: v.number() })),
  },
  handler: async (ctx, args): Promise<Id<"checkIns">> => {
    const user = await requireCurrentUser(ctx);

    if (
      args.channelId !== undefined &&
      !user.joinedChannelIds.includes(args.channelId)
    ) {
      console.log("[CheckIn] afvist — ikke medlem af kanalen", {
        userId: user._id,
        channelId: args.channelId,
      });
      throw new ConvexError({
        code: "NOT_A_MEMBER",
        message: "Du er ikke medlem af den angivne Kanal.",
      });
    }

    const now = Date.now();

    // Regnes FØR patchen — bagefter er `checkInStatus` sand under alle
    // omstændigheder, og svaret ville altid være "ja, allerede ude".
    const varUdeIForvejen = erUdeIDag(user, getDrinkDayStart(now));

    const checkInId = await ctx.db.insert("checkIns", {
      userId: user._id,
      channelId: args.channelId,
      venue: args.venue,
      location: args.location ?? null,
      timestamp: now,
    });

    // Samme transaktion: brugerens Check In-tilstand.
    await ctx.db.patch(user._id, {
      checkInStatus: true,
      lastCheckIn: now,
      lastCheckInVenue: args.venue,
      checkInCount: (user.checkInCount ?? 0) + 1,
      // Ved check-in med position opdateres både `currentLocation` og den
      // live `location`, som kortet læser — som i det gamle checkInService.
      ...(args.location !== undefined
        ? {
            currentLocation: {
              lat: args.location.lat,
              lng: args.location.lng,
              venue: args.venue,
              timestamp: now,
            },
            location: {
              lat: args.location.lat,
              lng: args.location.lng,
              lastUpdated: now,
            },
          }
        : {}),
      // Check-in i en Kanal gør den samtidig til den aktive.
      ...(args.channelId !== undefined ? { activeChannelId: args.channelId } : {}),
      updatedAt: now,
    });

    // Stedet logges IKKE. Et sted plus et bruger-id er oplysninger om hvor et
    // bestemt menneske befandt sig — det hører hjemme i `checkIns`-rækken, som
    // brugeren selv kan se og slette, ikke i deployment-loggen.
    console.log("[CheckIn] registreret", {
      checkInId,
      userId: user._id,
      medPosition: args.location !== undefined,
      antal: (user.checkInCount ?? 0) + 1,
    });

    // Samme varsling som aftenens første genstand giver. De to er den
    // samme begivenhed set fra Kanalen — nogen er gået ud — og skal ikke
    // lyde forskelligt, fordi de kom ind ad hver sin dør.
    //
    // Kun hvis man ikke ALLEREDE var ude: checker man ind kl. 20 og igen
    // kl. 23, er den anden ikke en nyhed.
    if (!varUdeIForvejen && args.channelId !== undefined) {
      await varslingUdeIAften(ctx, args.channelId, user._id, user.displayName);
    }

    return checkInId;
  },
});

/** Melder den indloggede bruger ud igen. Historikken røres ikke. */
export const checkOut = mutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();

    await ctx.db.patch(user._id, {
      checkInStatus: false,
      currentLocation: null,
      lastStatusCheckedAt: now,
      updatedAt: now,
    });

    console.log("[CheckIn] checket ud", { userId: user._id });
  },
});

/**
 * Check In-historik.
 *
 * Uden `userId` returneres ens egen historik. Med `userId` kræves det, at man
 * deler mindst én Kanal med brugeren.
 */
export const getCheckInsForUser = query({
  args: {
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireCurrentUser(ctx);
    const targetId = args.userId ?? viewer._id;

    if (targetId !== viewer._id) {
      await requireCanViewUser(ctx, targetId);
    }

    return await ctx.db
      .query("checkIns")
      .withIndex("by_user_and_timestamp", (q) => q.eq("userId", targetId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});
