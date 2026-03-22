import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  Alert,
} from "react-native";
import { useAuthActions } from "@convex-dev/auth/react";
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";

// Required for the OAuth redirect to complete properly on native
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { signIn } = useAuthActions();
  const [loadingApple, setLoadingApple] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  const [_request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    redirectUri: AuthSession.makeRedirectUri({
      native: `com.googleusercontent.apps.652285520029-igdujb1aa2sb6m7rbc5hpj871sftk1uo:/`,
    }),
  });

  // Handle Google OAuth response
  React.useEffect(() => {
    if (response?.type !== "success") return;
    const idToken = response.authentication?.idToken;
    if (!idToken) {
      Alert.alert("Sign in failed", "No ID token received from Google.");
      return;
    }
    setLoadingGoogle(true);
    signIn("google", { id_token: idToken })
      .catch(() => Alert.alert("Sign in failed", "Could not sign in with Google. Please try again."))
      .finally(() => setLoadingGoogle(false));
  }, [response]);

  const handleApple = async () => {
    setLoadingApple(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error("No identity token received.");
      await signIn("apple", { id_token: credential.identityToken });
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") return; // user dismissed
      Alert.alert("Sign in failed", "Could not sign in with Apple. Please try again.");
    } finally {
      setLoadingApple(false);
    }
  };

  const handleGoogle = async () => {
    setLoadingGoogle(true);
    try {
      await promptAsync();
      // result handled in the useEffect above
    } catch {
      Alert.alert("Sign in failed", "Could not sign in with Google. Please try again.");
      setLoadingGoogle(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>CHADIFY</Text>
          <Text style={styles.subtitle}>Sign in to transform yourself</Text>
        </View>

        <View style={styles.buttons}>
          {Platform.OS === "ios" && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={12}
              style={styles.appleButton}
              onPress={handleApple}
            />
          )}

          <TouchableOpacity
            style={[styles.googleButton, loadingGoogle && styles.buttonDisabled]}
            onPress={handleGoogle}
            disabled={loadingGoogle}
            activeOpacity={0.85}
          >
            {loadingGoogle ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#000",
  },
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingBottom: 48,
    paddingTop: 80,
  },
  header: {
    alignItems: "center",
  },
  title: {
    color: "#fff",
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: 12,
    marginBottom: 12,
  },
  subtitle: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 15,
    textAlign: "center",
  },
  buttons: {
    gap: 12,
  },
  appleButton: {
    width: "100%",
    height: 52,
  },
  googleButton: {
    backgroundColor: "#fff",
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  googleButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600",
  },
});
