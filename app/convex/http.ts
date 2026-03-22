import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";

const http = httpRouter();

// Required by @convex-dev/auth
auth.addHttpRoutes(http);

// ── RevenueCat webhook ────────────────────────────────────────────────────────

// Product ID → credit/entitlement mapping
const PRODUCT_GRANTS: Record<string, {
  credits: number;
  subscriptionType?: "monthly" | "annual";
  lifetimeAccess?: boolean;
}> = {
  chadify_credits_10:           { credits: 10 },
  chadify_credits_50:           { credits: 50 },
  chadify_subscription_monthly: { credits: 100, subscriptionType: "monthly" },
  chadify_subscription_annual:  { credits: 100, subscriptionType: "annual" },
  chadify_lifetime:             { credits: 0,   lifetimeAccess: true },
};

http.route({
  path: "/revenuecat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Verify shared secret
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    const auth_header = request.headers.get("Authorization");
    // RevenueCat sends the secret as the raw Authorization value (no "Bearer" prefix)
    if (!secret || auth_header !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const event = body?.event;
    if (!event) return new Response("OK", { status: 200 });

    const { type, app_user_id: userId, product_id, expiration_at_ms } = event;
    if (!userId) return new Response("OK", { status: 200 });

    const grant = PRODUCT_GRANTS[product_id];

    if (type === "INITIAL_PURCHASE" || type === "RENEWAL" || type === "NON_RENEWING_PURCHASE") {
      if (!grant) {
        console.warn("[revenuecat] Unknown product_id:", product_id);
        return new Response("OK", { status: 200 });
      }
      await ctx.runMutation(internal.entitlements.upsertFromWebhook, {
        userId,
        ...(grant.credits > 0 ? { creditsToAdd: grant.credits } : {}),
        ...(grant.subscriptionType ? {
          subscriptionType: grant.subscriptionType,
          subscriptionExpiresAt: expiration_at_ms ?? null,
        } : {}),
        ...(grant.lifetimeAccess ? { lifetimeAccess: true } : {}),
      });
    } else if (type === "EXPIRATION") {
      await ctx.runMutation(internal.entitlements.upsertFromWebhook, {
        userId,
        subscriptionType: "none",
        subscriptionExpiresAt: null,
      });
    }
    // CANCELLATION — no action, subscription remains active until EXPIRATION fires

    return new Response("OK", { status: 200 });
  }),
});

export default http;
