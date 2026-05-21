import React, { useRef, useState, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Modal,
  Linking,
} from "react-native";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import * as StoreReview from "expo-store-review";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { AppStackParamList } from "../navigation/AppNavigator";
import PaywallScreen from "./PaywallScreen";
import { useGuest } from "../context/GuestContext";
import { useTranslation } from "../context/LanguageContext";
import SignInPromptModal from "../components/SignInPromptModal";
import ShareRewardPrompt from "../components/ShareRewardPrompt";

const AI_CONSENT_KEY = "aiConsentGiven";
const FIRST_GENERATION_REVIEW_PROMPT_KEY = "firstGenerationReviewPromptSeen";
const PRIVACY_URL = "https://www.nearperfectapps.xyz/privacy/chadify";

type RouteProps = RouteProp<AppStackParamList, "Camera">;
type Nav = NativeStackNavigationProp<AppStackParamList, "Camera">;

export default function CameraScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProps>();
  const { t } = useTranslation();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("front");
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [signInPromptVisible, setSignInPromptVisible] = useState(false);
  const [reviewPromptVisible, setReviewPromptVisible] = useState(false);
  const [shareRewardVisible, setShareRewardVisible] = useState(false);
  const shareRewardStatus = useQuery(api.entitlements.getMyShareRewardStatus);
  const { isAnonymous } = useGuest();
  const cameraRef = useRef<CameraView>(null);
  const entitlements = useQuery(api.entitlements.getMyEntitlements);

  const canGenerate =
    entitlements?.lifetimeAccess ||
    (entitlements?.credits ?? 0) > 0 ||
    entitlements?.canUseFreeTier;

  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    const nextFreeAt = entitlements?.nextFreeAt;
    if (!nextFreeAt) { setCountdown(""); return; }
    const tick = () => {
      const ms = Math.max(0, nextFreeAt - Date.now());
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setCountdown(`${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [entitlements?.nextFreeAt]);

  useEffect(() => {
    SecureStore.getItemAsync(AI_CONSENT_KEY).then((value) => {
      if (!value) setConsentVisible(true);
    });
  }, []);

  useEffect(() => {
    if (!route.params?.showReviewPrompt) return;
    navigation.setParams({ showReviewPrompt: undefined });
    (async () => {
      const reviewShown = await maybeShowFirstGenerationReviewPrompt();
      // Avoid stacking modals: only offer the share reward on later generations,
      // once the first-generation review prompt has already been seen.
      if (!reviewShown && shareRewardStatus?.eligible === true) {
        setShareRewardVisible(true);
      }
    })();
  }, [route.params?.showReviewPrompt]);

  const maybeShowFirstGenerationReviewPrompt = async (): Promise<boolean> => {
    try {
      const alreadySeen = await SecureStore.getItemAsync(FIRST_GENERATION_REVIEW_PROMPT_KEY);
      if (alreadySeen) return false;

      await SecureStore.setItemAsync(FIRST_GENERATION_REVIEW_PROMPT_KEY, "true");
      setReviewPromptVisible(true);
      return true;
    } catch {
      // Review prompts are non-critical; never block the camera screen.
      return false;
    }
  };

  const handleRequestReview = async () => {
    setReviewPromptVisible(false);
    try {
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
      }
    } catch {
      // Native review availability is best-effort and may be throttled by the stores.
    }
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>{t("camera.permissionText")}</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>{t("camera.continue")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current || capturing || uploading) return;
    if (!canGenerate) {
      isAnonymous ? setSignInPromptVisible(true) : setPaywallVisible(true);
      return;
    }
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo) return;

      // Upload to Convex storage before navigating — the action receives a storageId, not a URI
      setCapturing(false);
      setUploading(true);
      const uploadUrl = await generateUploadUrl();
      const blob = await fileUriToBlob(photo.uri);
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      const { storageId } = await response.json();
      navigation.navigate("Result", { userPhotoStorageId: storageId });
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? String(e));
    } finally {
      setCapturing(false);
      setUploading(false);
    }
  };

  const pickFromGallery = async () => {
    if (busy) return;
    if (!canGenerate) {
      isAnonymous ? setSignInPromptVisible(true) : setPaywallVisible(true);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.85,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? "image/jpeg";

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const blob = await fileUriToBlob(asset.uri);
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: blob,
      });
      const { storageId } = await response.json();
      navigation.navigate("Result", { userPhotoStorageId: storageId });
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  };

  const busy = capturing || uploading;

  const handleConsentAgree = async () => {
    await SecureStore.setItemAsync(AI_CONSENT_KEY, "true");
    setConsentVisible(false);
  };

  return (
    <View style={styles.container}>
      <Modal visible={consentVisible} animationType="fade" transparent>
        <View style={styles.consentBackdrop}>
          <View style={styles.consentCard}>
            <Text style={styles.consentTitle}>{t("camera.consent.title")}</Text>
            <Text style={styles.consentBody}>
              {t("camera.consent.body1Prefix")}
              <Text style={styles.consentBold}>{t("camera.consent.body1Brand")}</Text>
              {t("camera.consent.body1Suffix")}
            </Text>
            <Text style={styles.consentBody}>{t("camera.consent.body2")}</Text>
            <TouchableOpacity
              style={styles.consentLinkButton}
              onPress={() => Linking.openURL(PRIVACY_URL)}
            >
              <Text style={styles.consentLink}>{t("camera.consent.readPolicy")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.consentAgreeButton} onPress={handleConsentAgree}>
              <Text style={styles.consentAgreeText}>{t("camera.consent.agree")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={paywallVisible} animationType="slide" onRequestClose={() => setPaywallVisible(false)}>
        <PaywallScreen onClose={() => setPaywallVisible(false)} />
      </Modal>

      <SignInPromptModal
        visible={signInPromptVisible}
        onClose={() => setSignInPromptVisible(false)}
        title={t("camera.signInPromptTitle")}
        subtitle={t("camera.signInPromptSubtitle")}
      />

      <ShareRewardPrompt
        visible={shareRewardVisible}
        onClose={() => setShareRewardVisible(false)}
      />

      <Modal
        visible={reviewPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewPromptVisible(false)}
      >
        <View style={styles.reviewBackdrop}>
          <View style={styles.reviewCard}>
            <Text style={styles.reviewStars}>★★★★★</Text>
            <Text style={styles.reviewTitle}>{t("result.reviewTitle")}</Text>
            <Text style={styles.reviewBody}>{t("result.reviewBody")}</Text>
            <TouchableOpacity style={styles.reviewPrimaryButton} onPress={handleRequestReview}>
              <Text style={styles.reviewPrimaryText}>{t("result.reviewCta")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reviewSecondaryButton}
              onPress={() => setReviewPromptVisible(false)}
            >
              <Text style={styles.reviewSecondaryText}>{t("result.reviewLater")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
        <SafeAreaView style={styles.overlay}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>CHADIFY</Text>
            <View style={styles.titleButtons}>
              <TouchableOpacity
                style={styles.creditsButton}
                onPress={() => isAnonymous ? setSignInPromptVisible(true) : setPaywallVisible(true)}
              >
                <Text style={styles.creditsText}>
                  {isAnonymous
                    ? countdown
                      ? t("camera.countdown", { time: countdown })
                      : t("camera.getCredits")
                    : entitlements?.lifetimeAccess
                    ? t("camera.lifetime")
                    : (entitlements?.credits ?? 0) > 0
                    ? t(
                        entitlements!.credits === 1
                          ? "camera.creditsOne"
                          : "camera.creditsOther",
                        { count: entitlements!.credits }
                      )
                    : countdown
                    ? t("camera.countdown", { time: countdown })
                    : t("camera.getCredits")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.creditsButton}
                onPress={() => isAnonymous ? setSignInPromptVisible(true) : navigation.navigate("Gallery")}
                disabled={busy}
              >
                <Text style={styles.creditsText}>{t("camera.gallery")}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.flipButton}
              onPress={() => setFacing((f) => (f === "front" ? "back" : "front"))}
              disabled={busy}
            >
              <Text style={[styles.flipIcon, busy && styles.iconDisabled]}>↺</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shutterRing, busy && styles.shutterDisabled]}
              onPress={takePicture}
              disabled={busy}
              activeOpacity={0.8}
            >
              {busy ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <View style={styles.shutterDisk} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.galleryButton}
              onPress={pickFromGallery}
              disabled={busy}
            >
              <Text style={[styles.galleryIcon, busy && styles.iconDisabled]}>⊕</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

async function fileUriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return await response.blob();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 40,
  },
  titleRow: {
    alignItems: "center",
    gap: 10,
  },
  titleButtons: {
    flexDirection: "row",
    gap: 8,
  },
  title: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 10,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  creditsButton: {
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  creditsText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 48,
  },
  shutterRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterDisk: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
  },
  flipButton: {
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  flipIcon: {
    color: "#fff",
    fontSize: 32,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  galleryButton: {
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  galleryIcon: {
    color: "#fff",
    fontSize: 28,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  iconDisabled: {
    opacity: 0.4,
  },
  permissionText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: "#fff",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  permissionButtonText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 16,
  },
  consentBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  consentCard: {
    backgroundColor: "#111",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  consentTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 16,
  },
  consentBody: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  consentBold: {
    color: "#fff",
    fontWeight: "600",
  },
  consentLinkButton: {
    marginBottom: 20,
  },
  consentLink: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    textDecorationLine: "underline",
  },
  consentAgreeButton: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  consentAgreeText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
  reviewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  reviewCard: {
    width: "100%",
    backgroundColor: "#111",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 24,
    alignItems: "center",
  },
  reviewStars: {
    color: "#fff",
    fontSize: 26,
    letterSpacing: 3,
    marginBottom: 16,
  },
  reviewTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  reviewBody: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },
  reviewPrimaryButton: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  reviewPrimaryText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
  reviewSecondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  reviewSecondaryText: {
    color: "rgba(255,255,255,0.38)",
    fontSize: 14,
  },
});
