import {
  convexAuth,
  createAccount,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { createRemoteJWKSet, jwtVerify } from "jose";

const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys")
);
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

/**
 * Apple Sign In — verifies the native id_token using Apple's public JWKS.
 * No private credentials are needed for verification.
 * Optionally set AUTH_APPLE_ID in Convex env vars (= your bundle identifier).
 */
const AppleNative = ConvexCredentials({
  id: "apple",
  authorize: async (credentials, ctx) => {
    const idToken = credentials.id_token as string | undefined;
    if (!idToken) throw new Error("Missing id_token");

    const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: "https://appleid.apple.com",
    });

    const appleId = payload.sub!;
    const email = payload.email as string | undefined;

    try {
      const existing = await retrieveAccount(ctx, {
        provider: "apple",
        account: { id: appleId },
      });
      return { userId: existing.user._id };
    } catch {
      // Account doesn't exist yet — create it
    }

    const { user } = await createAccount(ctx, {
      provider: "apple",
      account: { id: appleId },
      profile: { email: email ?? "" },
      shouldLinkViaEmail: !!email,
    });
    return { userId: user._id };
  },
});

/**
 * Google Sign In — verifies the native id_token using Google's public JWKS.
 * Optionally set AUTH_GOOGLE_CLIENT_IDS (comma-separated) in Convex env vars
 * to enable audience validation (recommended for production).
 */
const GoogleNative = ConvexCredentials({
  id: "google",
  authorize: async (credentials, ctx) => {
    const idToken = credentials.id_token as string | undefined;
    if (!idToken) throw new Error("Missing id_token");

    const rawClientIds = process.env.AUTH_GOOGLE_CLIENT_IDS ?? "";
    const clientIds = rawClientIds
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["accounts.google.com", "https://accounts.google.com"],
      ...(clientIds.length > 0 ? { audience: clientIds } : {}),
    });

    const googleId = payload.sub!;
    const email = payload.email as string | undefined;
    const name = payload.name as string | undefined;

    try {
      const existing = await retrieveAccount(ctx, {
        provider: "google",
        account: { id: googleId },
      });
      return { userId: existing.user._id };
    } catch {
      // Account doesn't exist yet — create it
    }

    const { user } = await createAccount(ctx, {
      provider: "google",
      account: { id: googleId },
      profile: { email: email ?? "", ...(name ? { name } : {}) },
      shouldLinkViaEmail: !!email,
    });
    return { userId: user._id };
  },
});

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [AppleNative, GoogleNative, Anonymous],
});
