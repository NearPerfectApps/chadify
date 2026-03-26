import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Permanently deletes the current user's account and all associated data.
// Removes: transformations (+ storage files), entitlements, auth sessions
// (+ refresh tokens), auth accounts, and the user record itself.
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // 1. Delete all transformation images from storage, then their records
    const transformations = await ctx.db
      .query("transformations")
      .withIndex("by_user", (q) => q.eq("userId", userId as string))
      .collect();
    for (const t of transformations) {
      await ctx.storage.delete(t.storageId);
      await ctx.db.delete(t._id);
    }

    // 2. Delete entitlements record
    const entitlements = await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q) => q.eq("userId", userId as string))
      .unique();
    if (entitlements) {
      await ctx.db.delete(entitlements._id);
    }

    // 3. Delete all sessions and their refresh tokens
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      const refreshTokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionIdAndParentRefreshTokenId", (q) =>
          q.eq("sessionId", session._id)
        )
        .collect();
      for (const token of refreshTokens) {
        await ctx.db.delete(token._id);
      }
      await ctx.db.delete(session._id);
    }

    // 4. Delete all linked auth accounts (Apple, Google)
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const account of accounts) {
      await ctx.db.delete(account._id);
    }

    // 5. Delete the user record itself
    await ctx.db.delete(userId);
  },
});
