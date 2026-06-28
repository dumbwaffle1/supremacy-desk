/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auditLogs from "../auditLogs.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as fixtures from "../fixtures.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as leagues from "../leagues.js";
import type * as ledger from "../ledger.js";
import type * as lib_game from "../lib/game.js";
import type * as lib_invite from "../lib/invite.js";
import type * as lib_ledger from "../lib/ledger.js";
import type * as lib_trading from "../lib/trading.js";
import type * as migrate from "../migrate.js";
import type * as players from "../players.js";
import type * as push from "../push.js";
import type * as pushNode from "../pushNode.js";
import type * as reminders from "../reminders.js";
import type * as settlement from "../settlement.js";
import type * as standings from "../standings.js";
import type * as tournament from "../tournament.js";
import type * as trades from "../trades.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auditLogs: typeof auditLogs;
  auth: typeof auth;
  crons: typeof crons;
  fixtures: typeof fixtures;
  games: typeof games;
  http: typeof http;
  leagues: typeof leagues;
  ledger: typeof ledger;
  "lib/game": typeof lib_game;
  "lib/invite": typeof lib_invite;
  "lib/ledger": typeof lib_ledger;
  "lib/trading": typeof lib_trading;
  migrate: typeof migrate;
  players: typeof players;
  push: typeof push;
  pushNode: typeof pushNode;
  reminders: typeof reminders;
  settlement: typeof settlement;
  standings: typeof standings;
  tournament: typeof tournament;
  trades: typeof trades;
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
