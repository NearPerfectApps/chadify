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
import { Audio } from "expo-av";
import * as MediaLibrary from "expo-media-library";
import { chadifyImage } from "../services/replicateService";

interface Props {
  userPhotoUri: string;
  onRetake: () => void;
}

type State = "loading" | "revealing" | "success" | "error";

const MESSAGES = [
  "Chadifying your appearance...",
  "Maximizing jaw definition...",
  "Applying gigachad energy...",
  "Unleashing your inner chad...",
];

const FADE_OUT_DURATION = 6000; // ms before end to start fading audio

function RotatingMessage() {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const cycle = () => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setIndex((i) => (i + 1) % MESSAGES.length);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      });
    };
    const id = setInterval(cycle, 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <Animated.Text style={[styles.loadingTitle, { opacity }]}>
      {MESSAGES[index]}
    </Animated.Text>
  );
}

export default function ResultScreen({ userPhotoUri, onRetake }: Props) {
  const [state, setState] = useState<State>("loading");
  const [resultUri, setResultUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [mediaPermission, requestMediaPermission] =
    MediaLibrary.usePermissions();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    runChadify();
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  const fadeVolume = async (
    sound: Audio.Sound,
    from: number,
    to: number,
    durationMs: number,
  ) => {
    const steps = 30;
    const stepMs = durationMs / steps;
    const delta = (to - from) / steps;
    let current = from;
    for (let i = 0; i < steps; i++) {
      current += delta;
      await sound.setVolumeAsync(Math.max(0, Math.min(1, current)));
      await new Promise((r) => setTimeout(r, stepMs));
    }
  };

  const runChadify = async () => {
    setState("loading");
    setErrorMessage("");
    try {
      const uri = await chadifyImage(userPhotoUri);
      setResultUri(uri);
      await playRevealSequence();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong",
      );
      setState("error");
    }
  };

  const playRevealSequence = async () => {
    setState("revealing");
    fadeAnim.setValue(0);

    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/chad.mp3"),
        { shouldPlay: true, volume: 0 },
      );
      soundRef.current = sound;

      // Fade audio in over 3s
      await fadeVolume(sound, 0, 1, 3000);

      // Wait remaining time before reveal (7.5s total from audio start)
      await new Promise((r) => setTimeout(r, 4500));

      // Reveal image
      setState("success");
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      // Monitor for fade-out near end
      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          await sound.unloadAsync();
          soundRef.current = null;
          return;
        }
        const remaining = (status.durationMillis ?? 0) - status.positionMillis;
        if (remaining > 0 && remaining <= FADE_OUT_DURATION) {
          sound.setOnPlaybackStatusUpdate(null);
          await fadeVolume(sound, 1, 0, FADE_OUT_DURATION);
          await sound.unloadAsync();
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

  const saveToGallery = async () => {
    if (!resultUri) return;
    if (!mediaPermission?.granted) {
      const { granted } = await requestMediaPermission();
      if (!granted) {
        Alert.alert(
          "Permission needed",
          "Allow photo library access to save your chad image.",
        );
        return;
      }
    }
    setSaving(true);
    try {
      await MediaLibrary.saveToLibraryAsync(resultUri);
      Alert.alert(
        "Saved!",
        "Your chad transformation is in your photo library.",
      );
    } catch {
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (state === "loading" || state === "revealing") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#fff" />
        <RotatingMessage />
        <Text style={styles.loadingSubtitle}>This may take a moment</Text>
      </View>
    );
  }

  if (state === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Transformation Failed</Text>
        <Text style={styles.errorMessage}>{errorMessage}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={runChadify}>
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onRetake}>
          <Text style={styles.secondaryButtonText}>Retake Photo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Text style={styles.successTitle}>GIGACHAD UNLOCKED</Text>
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
          onPress={saveToGallery}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryButtonText}>Save to Gallery</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onRetake}>
          <Text style={styles.secondaryButtonText}>Retake</Text>
        </TouchableOpacity>
      </View>
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
