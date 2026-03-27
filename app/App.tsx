import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import * as SecureStore from "expo-secure-store";
import RootNavigator from "./navigation/RootNavigator";
import { GuestProvider } from "./context/GuestContext";

console.log('Convex URL:', process.env.EXPO_PUBLIC_CONVEX_URL);
const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

// expo-secure-store adapter — stores the session JWT in iOS Keychain / Android Keystore
const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export default function App() {
  return (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      <GuestProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </GuestProvider>
    </ConvexAuthProvider>
  );
}
