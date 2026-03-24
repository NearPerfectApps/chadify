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
} from "react-native";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { AppStackParamList } from "../navigation/AppNavigator";
import PaywallScreen from "./PaywallScreen";

type Nav = NativeStackNavigationProp<AppStackParamList, "Camera">;

export default function CameraScreen() {
  const navigation = useNavigation<Nav>();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("front");
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
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
        <Text style={styles.permissionText}>
          Camera access is required to chadify yourself
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current || capturing || uploading) return;
    if (!canGenerate) {
      setPaywallVisible(true);
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
      Alert.alert("Error", e?.message ?? String(e));
    } finally {
      setCapturing(false);
      setUploading(false);
    }
  };

  const pickFromGallery = async () => {
    if (busy) return;
    if (!canGenerate) {
      setPaywallVisible(true);
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
      Alert.alert("Error", e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  };

  const busy = capturing || uploading;

  return (
    <View style={styles.container}>
      <Modal visible={paywallVisible} animationType="slide" onRequestClose={() => setPaywallVisible(false)}>
        <PaywallScreen onClose={() => setPaywallVisible(false)} />
      </Modal>

      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
        <SafeAreaView style={styles.overlay}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>CHADIFY</Text>
            <View style={styles.titleButtons}>
              <TouchableOpacity style={styles.creditsButton} onPress={() => setPaywallVisible(true)}>
                <Text style={styles.creditsText}>
                  {entitlements?.lifetimeAccess
                    ? "∞  Lifetime"
                    : (entitlements?.credits ?? 0) > 0
                    ? `◆  ${entitlements!.credits} credit${entitlements!.credits === 1 ? "" : "s"}`
                    : countdown
                    ? `⏱  ${countdown}`
                    : "◆  Get credits"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.creditsButton}
                onPress={() => navigation.navigate("Gallery")}
                disabled={busy}
              >
                <Text style={styles.creditsText}>⊞  Gallery</Text>
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
});
