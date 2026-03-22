/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_chadify from "../actions/chadify.js";
import type * as auth from "../auth.js";
import type * as entitlements from "../entitlements.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as referenceImages from "../referenceImages.js";
import type * as transformations from "../transformations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/chadify": typeof actions_chadify;
  auth: typeof auth;
  entitlements: typeof entitlements;
  files: typeof files;
  http: typeof http;
  referenceImages: typeof referenceImages;
  transformations: typeof transformations;
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
