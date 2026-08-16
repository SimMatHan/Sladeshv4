/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as achievementRules from "../achievementRules.js";
import type * as achievements from "../achievements.js";
import type * as beaconRules from "../beaconRules.js";
import type * as beacons from "../beacons.js";
import type * as checkIns from "../checkIns.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as drinkLogs from "../drinkLogs.js";
import type * as drinkRules from "../drinkRules.js";
import type * as identity from "../identity.js";
import type * as kanaler from "../kanaler.js";
import type * as messageRules from "../messageRules.js";
import type * as messages from "../messages.js";
import type * as migrering from "../migrering.js";
import type * as promille from "../promille.js";
import type * as promilleRules from "../promilleRules.js";
import type * as scoreboard from "../scoreboard.js";
import type * as sladesh from "../sladesh.js";
import type * as sladeshRules from "../sladeshRules.js";
import type * as streaks from "../streaks.js";
import type * as testing from "../testing.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  achievementRules: typeof achievementRules;
  achievements: typeof achievements;
  beaconRules: typeof beaconRules;
  beacons: typeof beacons;
  checkIns: typeof checkIns;
  constants: typeof constants;
  crons: typeof crons;
  drinkLogs: typeof drinkLogs;
  drinkRules: typeof drinkRules;
  identity: typeof identity;
  kanaler: typeof kanaler;
  messageRules: typeof messageRules;
  messages: typeof messages;
  migrering: typeof migrering;
  promille: typeof promille;
  promilleRules: typeof promilleRules;
  scoreboard: typeof scoreboard;
  sladesh: typeof sladesh;
  sladeshRules: typeof sladeshRules;
  streaks: typeof streaks;
  testing: typeof testing;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
