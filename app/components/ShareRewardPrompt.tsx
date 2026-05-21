import React from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useLanguage } from "../context/LanguageContext";
import { useShareReward } from "../hooks/useShareReward";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function ShareRewardPrompt({ visible, onClose }: Props) {
  const { t } = useLanguage();
  const dismissPrompt = useMutation(api.entitlements.dismissShareRewardPrompt);
  const { shareAndClaim, sharing } = useShareReward();

  const handleDismiss = async () => {
    onClose();
    try {
      await dismissPrompt();
    } catch {
      // Non-fatal: if the dismiss write fails, the prompt may show again on the next generation.
    }
  };

  const handleShare = async () => {
    const ok = await shareAndClaim();
    if (ok) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>{t("shareReward.kicker")}</Text>
          <Text style={styles.title}>{t("shareReward.title")}</Text>
          <Text style={styles.body}>{t("shareReward.body")}</Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleShare}
            activeOpacity={0.85}
            disabled={sharing}
          >
            {sharing ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.primaryText}>{t("shareReward.shareNow")}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleDismiss}>
            <Text style={styles.secondaryText}>{t("shareReward.maybeLater")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    borderRadius: 28,
    backgroundColor: "#f4f0df",
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  kicker: {
    color: "rgba(0,0,0,0.48)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 10,
  },
  title: {
    color: "#000",
    fontSize: 28,
    lineHeight: 31,
    fontWeight: "900",
    marginBottom: 12,
  },
  body: {
    color: "rgba(0,0,0,0.65)",
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 22,
  },
  primaryButton: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#d8ff3d",
  },
  primaryText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  secondaryButton: {
    alignItems: "center",
    paddingTop: 16,
  },
  secondaryText: {
    color: "rgba(0,0,0,0.48)",
    fontSize: 14,
    fontWeight: "700",
  },
});
