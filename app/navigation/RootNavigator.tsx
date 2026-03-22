import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useConvexAuth, useQuery } from "convex/react";
import AuthNavigator from "./AuthNavigator";
import AppNavigator from "./AppNavigator";
import { api } from "../convex/_generated/api";
import { loginRevenueCat, logoutRevenueCat } from "../hooks/useRevenueCat";

export default function RootNavigator() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const userId = useQuery(api.entitlements.getMyUserId);

  useEffect(() => {
    if (isAuthenticated && userId) {
      loginRevenueCat(userId);
    } else if (!isAuthenticated) {
      logoutRevenueCat();
    }
  }, [isAuthenticated, userId]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return isAuthenticated ? <AppNavigator /> : <AuthNavigator />;
}
