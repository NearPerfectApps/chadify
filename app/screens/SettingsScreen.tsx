import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Linking,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/AppNavigator";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useGuest } from "../context/GuestContext";
import { useLanguage } from "../context/LanguageContext";
import SignInPromptModal from "../components/SignInPromptModal";
import type { LanguagePreference } from "../lib/i18n";
import { useShareReward } from "../hooks/useShareReward";

const PRIVACY_URL = "https://www.nearperfectapps.xyz/privacy/chadify";
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { signOut } = useAuthActions();
  const deleteAccount = useMutation(api.users.deleteAccount);
  const shareRewardStatus = useQuery(api.entitlements.getMyShareRewardStatus);
  const { isAnonymous } = useGuest();
  const { t, preference, setPreference } = useLanguage();
  const { shareAndClaim, sharing } = useShareReward();
  const [deleting, setDeleting] = useState(false);
  const [signInPromptVisible, setSignInPromptVisible] = useState(false);

  const languageOptions: { key: LanguagePreference; label: string }[] = [
    { key: "system", label: t("settings.languageSystem") },
    { key: "en", label: t("settings.languageEnglish") },
    { key: "fr", label: t("settings.languageFrench") },
  ];

  const handleSignOut = () => {
    Alert.alert(t("settings.signOutConfirmTitle"), t("settings.signOutConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.signOut"),
        style: "destructive",
        onPress: async () => {
          await signOut();
          navigation.popToTop();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t("settings.deleteAccountConfirmTitle"),
      t("settings.deleteAccountConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.deleteAccount"),
          style: "destructive",
          onPress: () => confirmDeleteAccount(),
        },
      ]
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      t("settings.deleteAccountFinalTitle"),
      t("settings.deleteAccountFinalBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.deleteAccountFinalConfirm"),
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              // Sessions are deleted server-side — Convex will automatically
              // redirect to the auth screen once the token is invalidated.
            } catch {
              setDeleting(false);
              Alert.alert(t("common.error"), t("settings.deleteAccountFailed"));
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t("settings.title")}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!isAnonymous && shareRewardStatus != null && (
          <TouchableOpacity
            style={[styles.rewardCard, shareRewardStatus.claimed && styles.rewardCardDisabled]}
            onPress={shareAndClaim}
            activeOpacity={0.85}
            disabled={sharing || shareRewardStatus.claimed}
          >
            <View style={styles.rewardTextWrap}>
              <Text style={styles.rewardKicker}>{t("shareReward.kicker")}</Text>
              <Text style={styles.rewardTitle}>
                {shareRewardStatus.claimed
                  ? t("shareReward.disabledTitle")
                  : t("shareReward.settingsTitle")}
              </Text>
              <Text style={styles.rewardSubtitle}>
                {shareRewardStatus.claimed
                  ? t("shareReward.disabledSubtitle")
                  : t("shareReward.settingsSubtitle")}
              </Text>
            </View>
            <View style={styles.rewardIcon}>
              {sharing ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Feather
                  name={shareRewardStatus.claimed ? "check" : "share-2"}
                  size={19}
                  color="#000"
                />
              )}
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("settings.sectionLanguage")}</Text>
          {languageOptions.map((opt) => {
            const selected = preference === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={styles.row}
                onPress={() => setPreference(opt.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.rowLabel}>{opt.label}</Text>
                {selected && <Feather name="check" size={16} color="#fff" />}
              </TouchableOpacity>
            );
          })}
          <Text style={styles.sectionNote}>{t("settings.languageNote")}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("settings.sectionLegal")}</Text>
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL(PRIVACY_URL)}
          >
            <Text style={styles.rowLabel}>{t("settings.privacyPolicy")}</Text>
            <Feather name="external-link" size={14} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL(TERMS_URL)}
          >
            <Text style={styles.rowLabel}>{t("settings.termsOfUse")}</Text>
            <Feather name="external-link" size={14} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("settings.sectionAccount")}</Text>
          {isAnonymous ? (
            <TouchableOpacity style={styles.row} onPress={() => setSignInPromptVisible(true)}>
              <Text style={styles.rowLabel}>{t("settings.createAccount")}</Text>
              <Feather name="user-plus" size={14} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.row} onPress={handleSignOut}>
                <Text style={styles.rowLabel}>{t("settings.signOut")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.row} onPress={handleDeleteAccount} disabled={deleting}>
                {deleting ? (
                  <ActivityIndicator color="#ff4c4c" size="small" />
                ) : (
                  <Text style={styles.rowLabelDestructive}>{t("settings.deleteAccount")}</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        <SignInPromptModal
          visible={signInPromptVisible}
          onClose={() => setSignInPromptVisible(false)}
          title={t("settings.signInPromptTitle")}
          subtitle={t("settings.signInPromptSubtitle")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
  },
  backIcon: {
    color: "#fff",
    fontSize: 24,
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 4,
  },
  headerRight: {
    width: 44,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 32,
  },
  section: {
    gap: 2,
  },
  sectionTitle: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 8,
  },
  sectionNote: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 2,
  },
  rowLabel: {
    color: "#fff",
    fontSize: 15,
  },
  rowLabelDestructive: {
    color: "#ff4c4c",
    fontSize: 15,
  },
  rowValue: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 15,
  },
  rewardCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#d8ff3d",
    borderRadius: 22,
    padding: 18,
  },
  rewardCardDisabled: {
    backgroundColor: "rgba(216,255,61,0.35)",
  },
  rewardTextWrap: {
    flex: 1,
    paddingRight: 16,
  },
  rewardKicker: {
    color: "rgba(0,0,0,0.45)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.8,
    marginBottom: 6,
  },
  rewardTitle: {
    color: "#000",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 4,
  },
  rewardSubtitle: {
    color: "rgba(0,0,0,0.6)",
    fontSize: 13,
    lineHeight: 18,
  },
  rewardIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
});
