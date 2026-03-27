import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
  Animated,
  PanResponder,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { useAuthActions } from "@convex-dev/auth/react";
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

type Props = {
  visible: boolean;
  onClose: () => void;
  onSignedIn?: () => void;
  title?: string;
  subtitle?: string;
};

const FEATURES = [
  { label: "Gallery", description: "Save & revisit all your transformations" },
  { label: "Cloud saves", description: "Your chads are safe, forever" },
  { label: "Credits & upgrades", description: "Unlock unlimited chadification" },
];

const OFFSCREEN = 700;

export default function SignInPromptModal({ visible, onClose, onSignedIn, title, subtitle }: Props) {
  const { signIn } = useAuthActions();
  const [loadingApple, setLoadingApple] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  // Controls whether the Modal node is in the tree at all
  const [mounted, setMounted] = useState(false);

  const translateY = useRef(new Animated.Value(OFFSCREEN)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Keep a stable ref to onClose so PanResponder (created once) always calls the latest version
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const animateIn = useCallback(() => {
    translateY.setValue(OFFSCREEN);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, bounciness: 4, speed: 14, useNativeDriver: true }),
    ]).start();
  }, []);

  const animateOut = useCallback((onDone?: () => void) => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: OFFSCREEN, duration: 230, useNativeDriver: true }),
    ]).start(() => onDone?.());
  }, []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Let Modal render one frame before animating in
      requestAnimationFrame(() => animateIn());
    } else {
      animateOut(() => setMounted(false));
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    animateOut(() => onCloseRef.current());
  }, [animateOut]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 8 && gs.dy > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          // Use ref so we always have the latest onClose
          Animated.parallel([
            Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: OFFSCREEN, duration: 230, useNativeDriver: true }),
          ]).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

  const [_request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: googleIosClientId ?? "missing",
    androidClientId: googleAndroidClientId ?? "missing",
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    redirectUri: AuthSession.makeRedirectUri({
      native: `com.googleusercontent.apps.652285520029-igdujb1aa2sb6m7rbc5hpj871sftk1uo:/`,
    }),
  });

  useEffect(() => {
    if (response?.type !== "success") return;
    const idToken = response.authentication?.idToken;
    if (!idToken) {
      Alert.alert("Sign in failed", "No ID token received from Google.");
      return;
    }
    setLoadingGoogle(true);
    signIn("google", { id_token: idToken })
      .then(() => onSignedIn?.())
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
      onSignedIn?.();
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") return;
      Alert.alert("Sign in failed", "Could not sign in with Apple. Please try again.");
    } finally {
      setLoadingApple(false);
    }
  };

  const handleGoogle = async () => {
    if (!googleIosClientId && Platform.OS === "ios") {
      Alert.alert("Configuration error", "Google Sign-In is not configured for this build.");
      return;
    }
    if (!googleAndroidClientId && Platform.OS === "android") {
      Alert.alert("Configuration error", "Google Sign-In is not configured for this build.");
      return;
    }
    setLoadingGoogle(true);
    try {
      await promptAsync();
    } catch {
      Alert.alert("Sign in failed", "Could not sign in with Google. Please try again.");
      setLoadingGoogle(false);
    }
  };

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={handleClose}>
      {/* Backdrop fades in independently */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />

      {/* Tap above the sheet to dismiss */}
      <TouchableOpacity style={styles.dismissArea} onPress={handleClose} activeOpacity={1} />

      {/* Sheet slides up; drag handle + entire sheet are swipeable */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        {/* Drag handle — primary swipe target */}
        <View style={styles.handleArea} {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>

        <Text style={styles.title}>{title ?? "Unlock Your Full Chad Experience"}</Text>
        <Text style={styles.subtitle}>
          {subtitle ?? "Sign in to save your transformations and access all features"}
        </Text>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.label} style={styles.featureRow}>
              <View style={styles.featureText}>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureDescription}>{f.description}</Text>
              </View>
            </View>
          ))}
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
            disabled={loadingGoogle || loadingApple}
            activeOpacity={0.85}
          >
            {loadingGoogle ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <>
                <AntDesign name="google" size={20} color="#000" style={styles.googleIcon} />
                <Text style={styles.googleButtonText}>Sign in with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.dismissButton} onPress={handleClose} activeOpacity={0.7}>
            <Text style={styles.dismissText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: "#111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  handleArea: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 20,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 20,
  },
  features: {
    gap: 16,
    marginBottom: 32,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  featureText: {
    flex: 1,
  },
  featureLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  featureDescription: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    marginTop: 2,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  googleIcon: {
    marginRight: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  googleButtonText: {
    color: "#000",
    fontSize: 17,
    fontWeight: "600",
  },
  dismissButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  dismissText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 14,
  },
});
