import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import AppNavigator from "./AppNavigator";
import { api } from "../convex/_generated/api";
import { loginRevenueCat } from "../hooks/useRevenueCat";
import { providerSignInFlow } from "../lib/authFlow";

export default function RootNavigator() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const userId = useQuery(api.entitlements.getMyUserId);
  // true once anonymous sign-in resolves (success or failure)
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      setAuthReady(true);
      return;
    }
    // Don't fall back to anonymous while a real provider sign-in is mid-flight
    // (signOut → signIn("google"/"apple")). Otherwise we'd race and reattach the
    // anonymous session before the new provider session is created.
    if (providerSignInFlow.isActive()) return;
    signIn("anonymous")
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && userId) {
      loginRevenueCat(userId);
    }
  }, [isAuthenticated, userId]);

  if (!authReady) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return <AppNavigator />;
}
