import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const FREE_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

// ── Internal ──────────────────────────────────────────────────────────────────

export const getForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const upsertFromWebhook = internalMutation({
  args: {
    userId: v.string(),
    creditsToAdd: v.optional(v.number()),
    subscriptionType: v.optional(
      v.union(v.literal("none"), v.literal("monthly"), v.literal("annual"))
    ),
    subscriptionExpiresAt: v.optional(v.union(v.number(), v.null())),
    lifetimeAccess: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, creditsToAdd, subscriptionType, subscriptionExpiresAt, lifetimeAccess }) => {
    const existing = await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const now = Date.now();

    if (!existing) {
      await ctx.db.insert("userEntitlements", {
        userId,
        credits: creditsToAdd ?? 0,
        subscriptionType: subscriptionType ?? "none",
        subscriptionExpiresAt: subscriptionExpiresAt ?? undefined,
        lifetimeAccess: lifetimeAccess ?? false,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.patch(existing._id, {
      ...(creditsToAdd !== undefined ? { credits: existing.credits + creditsToAdd } : {}),
      ...(subscriptionType !== undefined ? { subscriptionType } : {}),
      ...(subscriptionExpiresAt !== undefined
        ? { subscriptionExpiresAt: subscriptionExpiresAt ?? undefined }
        : {}),
      ...(lifetimeAccess !== undefined ? { lifetimeAccess } : {}),
      updatedAt: now,
    });
  },
});

export const deductCredit = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const doc = await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!doc || doc.credits <= 0) throw new Error("No credits to deduct");
    await ctx.db.patch(doc._id, { credits: doc.credits - 1, updatedAt: Date.now() });
  },
});

export const recordFreeGeneration = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const now = Date.now();
    const doc = await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (doc) {
      await ctx.db.patch(doc._id, { lastFreeGenerationAt: now, updatedAt: now });
    } else {
      await ctx.db.insert("userEntitlements", {
        userId,
        credits: 0,
        subscriptionType: "none",
        lifetimeAccess: false,
        lastFreeGenerationAt: now,
        updatedAt: now,
      });
    }
  },
});

// ── Public ────────────────────────────────────────────────────────────────────

// Admin — grant credits or set lifetime for testing
// npx convex run entitlements:adminGrant '{"userId":"...","credits":10}'
// npx convex run entitlements:adminGrant '{"userId":"...","lifetimeAccess":true}'
export const adminGrant = internalMutation({
  args: {
    userId: v.string(),
    credits: v.optional(v.number()),
    lifetimeAccess: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, credits, lifetimeAccess }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!existing) {
      await ctx.db.insert("userEntitlements", {
        userId,
        credits: credits ?? 0,
        subscriptionType: "none",
        lifetimeAccess: lifetimeAccess ?? false,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        ...(credits !== undefined ? { credits: existing.credits + credits } : {}),
        ...(lifetimeAccess !== undefined ? { lifetimeAccess } : {}),
        updatedAt: now,
      });
    }
  },
});

export const getMyUserId = query({
  args: {},
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
  },
});

export const getMyEntitlements = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const doc = await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const now = Date.now();
    const lastFree = doc?.lastFreeGenerationAt ?? 0;
    const canUseFreeTier = now - lastFree >= FREE_COOLDOWN_MS;
    const nextFreeAt = canUseFreeTier ? null : lastFree + FREE_COOLDOWN_MS;

    const subscriptionActive =
      (doc?.subscriptionType ?? "none") !== "none" &&
      (doc?.subscriptionExpiresAt == null || doc.subscriptionExpiresAt > now);

    return {
      credits: doc?.credits ?? 0,
      subscriptionType: subscriptionActive ? (doc?.subscriptionType ?? "none") : "none",
      subscriptionExpiresAt: doc?.subscriptionExpiresAt ?? null,
      lifetimeAccess: doc?.lifetimeAccess ?? false,
      canUseFreeTier,
      nextFreeAt,
    };
  },
});
