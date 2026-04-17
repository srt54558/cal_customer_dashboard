/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as ingestion from "../ingestion.js";
import type * as lib_linear from "../lib/linear.js";
import type * as lib_session from "../lib/session.js";
import type * as notifications from "../notifications.js";
import type * as ops from "../ops.js";
import type * as portal from "../portal.js";
import type * as sync from "../sync.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  comments: typeof comments;
  crons: typeof crons;
  http: typeof http;
  ingestion: typeof ingestion;
  "lib/linear": typeof lib_linear;
  "lib/session": typeof lib_session;
  notifications: typeof notifications;
  ops: typeof ops;
  portal: typeof portal;
  sync: typeof sync;
  webhooks: typeof webhooks;
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
