/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as checkIns from "../checkIns.js";
import type * as constants from "../constants.js";
import type * as drinkLogs from "../drinkLogs.js";
import type * as identity from "../identity.js";
import type * as kanaler from "../kanaler.js";
import type * as migrering from "../migrering.js";
import type * as scoreboard from "../scoreboard.js";
import type * as sladesh from "../sladesh.js";
import type * as streaks from "../streaks.js";
import type * as testing from "../testing.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  checkIns: typeof checkIns;
  constants: typeof constants;
  drinkLogs: typeof drinkLogs;
  identity: typeof identity;
  kanaler: typeof kanaler;
  migrering: typeof migrering;
  scoreboard: typeof scoreboard;
  sladesh: typeof sladesh;
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
