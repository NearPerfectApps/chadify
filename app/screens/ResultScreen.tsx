import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Text,
  ActivityIndicator,
  Alert,
  Animated,
  SafeAreaView,
} from "react-native";
import { setAudioModeAsync, createAudioPlayer, AudioPlayer } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useAction, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import type { AppStackParamList } from "../navigation/AppNavigator";
import { useGuest } from "../context/GuestContext";
import { useTranslation } from "../context/LanguageContext";
import SignInPromptModal from "../components/SignInPromptModal";

type RouteProps = RouteProp<AppStackParamList, "Result">;

type State = "loading" | "revealing" | "success" | "error";

const FADE_OUT_DURATION = 6000;

function RotatingMessage() {
  const { strings } = useTranslation();
  const messages = strings.result.messages;
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const cycle = () => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setIndex((i) => (i + 1) % messages.length);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      });
    };
    const id = setInterval(cycle, 2200);
    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <Animated.Text style={[styles.loadingTitle, { opacity }]}>
      {messages[index]}
    </Animated.Text>
  );
}

export default function ResultScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { userPhotoStorageId } = route.params;

  const chadify = useAction(api.actions.chadify.run);
  const savePending = useMutation(api.transformations.savePending);
  const { isAnonymous, setPendingResult, clearPendingResult } = useGuest();

  const [state, setState] = useState<State>("loading");
  const [resultUri, setResultUri] = useState<string | null>(null);
  const [pendingStorageId, setPendingStorageId] = useState<Id<"_storage"> | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [signInPromptVisible, setSignInPromptVisible] = useState(false);
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const soundRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    runChadify();
    return () => {
      soundRef.current?.remove();
    };
  }, []);

  const startProgress = () => {
    progressAnim.setValue(0);
    progressAnimRef.current = Animated.timing(progressAnim, {
      toValue: 0.85,
      duration: 20000,
      useNativeDriver: false,
    });
    progressAnimRef.current.start();
  };

  const completeProgress = () => {
    progressAnimRef.current?.stop();
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const fadeVolume = async (
    player: AudioPlayer,
    from: number,
    to: number,
    durationMs: number
  ) => {
    const steps = 30;
    const stepMs = durationMs / steps;
    const delta = (to - from) / steps;
    let current = from;
    for (let i = 0; i < steps; i++) {
      current += delta;
      player.volume = Math.max(0, Math.min(1, current));
      await new Promise((r) => setTimeout(r, stepMs));
    }
  };

  const runChadify = async () => {
    setState("loading");
    setErrorMessage("");
    startProgress();
    try {
      // The action receives a Convex storageId, handles everything server-side
      const { url, storageId } = await chadify({ userPhotoStorageId });
      setResultUri(url);
      if (storageId) {
        setPendingStorageId(storageId);
        setPendingResult({ resultUri: url, storageId });
      }
      completeProgress();
      await playRevealSequence();
    } catch {
      setErrorMessage(t("result.errorGeneric"));
      setState("error");
    }
  };

  const playRevealSequence = async () => {
    setState("revealing");
    fadeAnim.setValue(0);

    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      const player = createAudioPlayer(require("../assets/chad.mp3"));
      player.volume = 0;
      player.play();
      soundRef.current = player;

      await fadeVolume(player, 0, 1, 3000);
      await new Promise((r) => setTimeout(r, 4500));

      setState("success");
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      const subscription = player.addListener("playbackStatusUpdate", async (status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          subscription.remove();
          player.remove();
          soundRef.current = null;
          return;
        }
        const remaining = (status.duration - status.currentTime) * 1000;
        if (remaining > 0 && remaining <= FADE_OUT_DURATION) {
          subscription.remove();
          await fadeVolume(player, 1, 0, FADE_OUT_DURATION);
          player.remove();
          soundRef.current = null;
        }
      });
    } catch {
      setState("success");
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
  };

  const saveToAppGallery = async () => {
    if (!resultUri) return;
    if (isAnonymous) {
      setSignInPromptVisible(true);
      return;
    }
    setSaving(true);
    try {
      const localPath = `${FileSystem.cacheDirectory}chadify_save_${Date.now()}.jpg`;
      const { uri: localUri } = await FileSystem.downloadAsync(resultUri, localPath);
      await MediaLibrary.saveToLibraryAsync(localUri);
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      Alert.alert(t("result.savedTitle"), t("result.savedBody"), [
        { text: t("common.ok"), onPress: () => navigation.navigate("Camera" as any) },
      ]);
    } catch {
      Alert.alert(t("common.error"), t("result.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleAfterSignIn = async () => {
    setSignInPromptVisible(false);
    if (!pendingStorageId) return;
    try {
      await savePending({ storageId: pendingStorageId });
      clearPendingResult();
      setPendingStorageId(null);
      Alert.alert(t("result.savedToGalleryTitle"), t("result.savedToGalleryBody"), [
        { text: t("result.viewGallery"), onPress: () => navigation.navigate("Gallery" as any) },
        { text: t("common.ok") },
      ]);
    } catch {
      // Non-fatal — the image is still viewable
    }
  };

  if (state === "loading" || state === "revealing") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#fff" />
        <RotatingMessage />
        <Text style={styles.loadingSubtitle}>{t("result.loadingSubtitle")}</Text>
        <View style={styles.progressBarContainer}>
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
        <Text style={styles.progressHint}>{t("result.progressHint")}</Text>
      </View>
    );
  }

  if (state === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>{t("result.errorTitle")}</Text>
        <Text style={styles.errorMessage}>{errorMessage}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={runChadify}>
          <Text style={styles.primaryButtonText}>{t("common.retry")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryButtonText}>{t("result.retakePhoto")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Text style={styles.successTitle}>{t("result.successTitle")}</Text>
      <Animated.View style={[styles.imageWrapper, { opacity: fadeAnim }]}>
        {resultUri && (
          <Image
            source={{ uri: resultUri }}
            style={styles.resultImage}
            resizeMode="cover"
          />
        )}
      </Animated.View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={saveToAppGallery}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryButtonText}>{t("result.saveToMyGallery")}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryButtonText}>{t("result.retake")}</Text>
        </TouchableOpacity>
      </View>

      <SignInPromptModal
        visible={signInPromptVisible}
        onClose={() => setSignInPromptVisible(false)}
        onSignedIn={handleAfterSignIn}
        title={t("result.signInPromptTitle")}
        subtitle={t("result.signInPromptSubtitle")}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  loadingTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 28,
    letterSpacing: 1,
    textAlign: "center",
  },
  loadingSubtitle: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
    marginTop: 12,
  },
  progressBarContainer: {
    width: "100%",
    height: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 2,
    marginTop: 24,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 2,
  },
  progressHint: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 11,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  successTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 6,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  imageWrapper: {
    flex: 1,
    width: "100%",
  },
  resultImage: {
    flex: 1,
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#111",
  },
  actions: {
    marginTop: 16,
    width: "100%",
    gap: 10,
  },
  primaryButton: {
    backgroundColor: "#fff",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  secondaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  errorTitle: {
    color: "#ff4c4c",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
  },
  errorMessage: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 36,
    lineHeight: 20,
  },
});
