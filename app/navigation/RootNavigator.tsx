import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import AppNavigator from "./AppNavigator";
import { api } from "../convex/_generated/api";
import { loginRevenueCat } from "../hooks/useRevenueCat";

export default function RootNavigator() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const userId = useQuery(api.entitlements.getMyUserId);
  const anonSignInAttempted = useRef(false);

  // Silently sign in as anonymous on first launch (no existing session)
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !anonSignInAttempted.current) {
      anonSignInAttempted.current = true;
      signIn("anonymous").catch(() => {
        // Reset so the next render can retry if needed
        anonSignInAttempted.current = false;
      });
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && userId) {
      loginRevenueCat(userId);
    }
  }, [isAuthenticated, userId]);

  if (isLoading || (!isAuthenticated && !anonSignInAttempted.current)) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return <AppNavigator />;
}
