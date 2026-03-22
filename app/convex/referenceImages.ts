import { internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";

// Returns all reference images ordered for future selection UI
export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("referenceImages")
      .withIndex("by_order")
      .collect();
  },
});

// Returns the first reference image (used as default until selection UI exists)
export const getFirst = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("referenceImages")
      .withIndex("by_order")
      .first();
  },
});

// Seed/update a reference image — run via: npx convex run referenceImages:upsert '{"label":"...","storageId":"...","order":0}'
export const upsert = mutation({
  args: {
    label: v.string(),
    storageId: v.id("_storage"),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("referenceImages")
      .withIndex("by_order", (q) => q.eq("order", args.order))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("referenceImages", args);
    }
  },
});
