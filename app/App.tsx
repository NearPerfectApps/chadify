import React from "react";
import { Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import * as SecureStore from "expo-secure-store";
import RootNavigator from "./navigation/RootNavigator";
import { GuestProvider } from "./context/GuestContext";
import { LanguageProvider } from "./context/LanguageContext";
import { configureRevenueCat } from "./hooks/useRevenueCat";

if (Platform.OS !== "web") {
  configureRevenueCat();
}

console.log('Convex URL:', process.env.EXPO_PUBLIC_CONVEX_URL);
const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

// Native: expo-secure-store (iOS Keychain / Android Keystore).
// Web: localStorage — expo-secure-store has no web implementation.
const secureStorage =
  Platform.OS === "web"
    ? {
        getItem: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
        setItem: async (key: string, value: string) => {
          globalThis.localStorage?.setItem(key, value);
        },
        removeItem: async (key: string) => {
          globalThis.localStorage?.removeItem(key);
        },
      }
    : {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      };

export default function App() {
  return (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      <LanguageProvider>
        <GuestProvider>
          <NavigationContainer>
            <StatusBar style="light" />
            <RootNavigator />
          </NavigationContainer>
        </GuestProvider>
      </LanguageProvider>
    </ConvexAuthProvider>
  );
}
