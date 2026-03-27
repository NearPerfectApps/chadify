import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";

// Public — used by GalleryScreen via usePaginatedQuery
export const listForCurrentUser = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { page: [], isDone: true, continueCursor: "" };

    const results = await ctx.db
      .query("transformations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(paginationOpts);

    // Resolve storage URLs server-side — no TTL, no client-side signed URL calls
    const page = await Promise.all(
      results.page.map(async (item) => ({
        _id: item._id,
        createdAt: item.createdAt,
        url: await ctx.storage.getUrl(item.storageId),
      }))
    );

    return { ...results, page };
  },
});

// Internal — called from the chadify action for rate limiting
export const countTodayForUser = internalQuery({
  args: { userId: v.string(), since: v.number() },
  handler: async (ctx, { userId, since }) => {
    const rows = await ctx.db
      .query("transformations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.gte(q.field("createdAt"), since))
      .collect();
    return rows.length;
  },
});

// Public — deletes a transformation and its stored image (owner-only)
export const remove = mutation({
  args: { id: v.id("transformations") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const record = await ctx.db.get(id);
    if (!record || record.userId !== userId) throw new Error("Not found");
    await ctx.storage.delete(record.storageId);
    await ctx.db.delete(id);
  },
});

// Admin-only — resets today's rate limit for a given userId (for testing)
export const adminResetToday = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const rows = await ctx.db
      .query("transformations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.gte(q.field("createdAt"), todayStart.getTime()))
      .collect();
    await Promise.all(rows.map((r) => ctx.db.delete(r._id)));
    return `Deleted ${rows.length} records`;
  },
});

// Public — called by the client after an anonymous user signs in, to save
// their pending transformation result into their new (real) account gallery
export const savePending = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    await ctx.db.insert("transformations", {
      userId: userId as string,
      storageId,
      createdAt: Date.now(),
    });
  },
});

// Internal — called from the chadify action after successful generation
export const insert = internalMutation({
  args: {
    userId: v.string(),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("transformations", args);
  },
});
