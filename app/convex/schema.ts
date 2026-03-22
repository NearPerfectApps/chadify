import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  transformations: defineTable({
    userId: v.string(),          // auth subject ID from getAuthUserId()
    storageId: v.id("_storage"), // Convex file storage — result image only
    createdAt: v.number(),       // Date.now()
  }).index("by_user", ["userId", "createdAt"]),

  // Per-user credit balance, subscription state, and free-tier tracking
  userEntitlements: defineTable({
    userId: v.string(),
    credits: v.number(),
    lifetimeAccess: v.boolean(),
    subscriptionType: v.union(v.literal("none"), v.literal("monthly"), v.literal("annual")),
    subscriptionExpiresAt: v.optional(v.number()),
    lastFreeGenerationAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Reference images users can transform into (e.g. classic gigachad, etc.)
  referenceImages: defineTable({
    label: v.string(),        // e.g. "Classic Gigachad"
    storageId: v.id("_storage"),
    order: v.number(),        // controls display order in future selection UI
  }).index("by_order", ["order"]),
});
