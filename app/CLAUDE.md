<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

---

# Chadify

A React Native / Expo app that uses Google Gemini to transform a user's selfie into a gigachad portrait.

## Running locally

One command starts everything:

```sh
cd app
npm run dev
```

This runs **Expo** (cyan) and **Convex dev server** (magenta) concurrently. Or run them separately:

```sh
npm run start    # Expo only
npm run convex   # Convex only
```

Scan the QR code with **Expo Go** on your device.

## Project structure

```
app/
├── screens/          # All screens (Camera, Result, Gallery, Login, Paywall)
├── navigation/       # RootNavigator, AppNavigator, AuthNavigator
├── hooks/            # useRevenueCat.ts
├── convex/           # Backend (Convex functions)
│   ├── schema.ts
│   ├── auth.ts            # Apple + Google Sign In (native token verification)
│   ├── entitlements.ts    # Credit system
│   ├── transformations.ts # Image history
│   ├── referenceImages.ts # Gigachad reference images
│   ├── files.ts           # Upload URL generation
│   ├── http.ts            # RevenueCat webhook
│   └── actions/
│       └── chadify.ts     # Gemini API call (server-side)
├── App.tsx
└── app.json
```

## Environment variables

### `app/.env` (Expo — public, bundled into the app)

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_CONVEX_URL` | Convex deployment URL (set automatically by `npx convex dev`) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google OAuth iOS client ID |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Google OAuth Android client ID |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google OAuth web client ID |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | RevenueCat iOS SDK key (safe to commit — public key) |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat Android SDK key |

### Convex env vars (secrets — never in the app bundle)

Set with `npx convex env set KEY "value"`:

| Variable | Description |
|----------|-------------|
| `GOOGLE_AI_API_KEY` | Gemini API key (get at aistudio.google.com) |
| `REVENUECAT_WEBHOOK_SECRET` | Shared secret for RevenueCat webhook verification |
| `AUTH_APPLE_ID` | Apple bundle ID (`com.nearperfectapps.chadify`) — optional, hardcoded as fallback |
| `AUTH_GOOGLE_CLIENT_IDS` | Comma-separated Google client IDs for audience validation — optional |

## Auth

Apple Sign In and Google Sign In only. Implemented via custom `ConvexCredentials` providers in `convex/auth.ts` that verify native `id_token` JWTs using each provider's public JWKS endpoint. No private credentials needed for Apple verification.

## Credit system

**Generation priority:** lifetime access → credits → free tier (1 per 6h)

| Tier | Details |
|------|---------|
| Free | 1 generation per 6 hours |
| Credits | Purchasable packs (10 or 50), 1 credit = 1 generation |
| Monthly subscription | 100 credits/month (~5€/mo) |
| Annual subscription | 100 credits/month (~50€/yr) |
| Lifetime | Unlimited forever (~100€ one-time) |

Credits are granted server-side via the RevenueCat webhook (`POST /revenuecat` on the Convex HTTP router). The webhook URL is:
```
https://dazzling-seahorse-284.eu-west-1.convex.site/revenuecat
```

### Useful admin commands

```sh
# Grant credits to a user (get userId from Convex dashboard → Data → users)
npx convex run entitlements:adminGrant '{"userId":"...","credits":10}'

# Grant lifetime access
npx convex run entitlements:adminGrant '{"userId":"...","lifetimeAccess":true}'

# Reset daily transformations (for testing rate limits)
npx convex run transformations:adminResetToday '{"userId":"..."}'

# Seed the gigachad reference image (upload via dashboard → Storage first)
npx convex run referenceImages:upsert '{"label":"Classic Gigachad","storageId":"...","order":0}'
```

## Payments (RevenueCat)

RevenueCat product IDs (configured in App Store Connect + RevenueCat dashboard):

| Product ID | Type | Credits |
|-----------|------|---------|
| `chadify_credits_10` | Consumable | 10 |
| `chadify_credits_50` | Consumable | 50 |
| `chadify_subscription_monthly` | Auto-renewable subscription | 100/month |
| `chadify_subscription_annual` | Auto-renewable subscription | 100/month |
| `chadify_lifetime` | Non-consumable | Unlimited |

RevenueCat entitlements: `pro` (monthly + annual), `lifetime`.

⚠️ **`react-native-purchases` is a native module** — purchases don't work in Expo Go. Use `adminGrant` for testing credits locally. A dev build is required for end-to-end purchase testing.

## Building

```sh
# Development build (requires EAS + Apple Developer account with Admin role)
eas build --profile development --platform ios

# Simulator build (no signing required)
eas build --profile development-simulator --platform ios

# Production
eas build --profile production --platform ios
eas submit --profile production --platform ios
```
