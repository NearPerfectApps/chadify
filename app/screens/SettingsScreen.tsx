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
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useGuest } from "../context/GuestContext";
import SignInPromptModal from "../components/SignInPromptModal";

const PRIVACY_URL = "https://www.nearperfectapps.xyz/privacy/chadify";
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { signOut } = useAuthActions();
  const deleteAccount = useMutation(api.users.deleteAccount);
  const { isAnonymous } = useGuest();
  const [deleting, setDeleting] = useState(false);
  const [signInPromptVisible, setSignInPromptVisible] = useState(false);

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This will permanently delete your account and all your transformations. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => confirmDeleteAccount(),
        },
      ]
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Are you sure?",
      "All your data will be deleted immediately and cannot be recovered.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, delete everything",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              // Sessions are deleted server-side — Convex will automatically
              // redirect to the auth screen once the token is invalidated.
            } catch {
              setDeleting(false);
              Alert.alert("Error", "Failed to delete account. Please try again.");
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
        <Text style={styles.title}>SETTINGS</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LANGUAGE</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Language</Text>
            <Text style={styles.rowValue}>English</Text>
          </View>
          <Text style={styles.sectionNote}>More languages coming soon.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LEGAL</Text>
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL(PRIVACY_URL)}
          >
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <Feather name="external-link" size={14} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL(TERMS_URL)}
          >
            <Text style={styles.rowLabel}>Terms of Use</Text>
            <Feather name="external-link" size={14} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          {isAnonymous ? (
            <TouchableOpacity style={styles.row} onPress={() => setSignInPromptVisible(true)}>
              <Text style={styles.rowLabel}>Create account</Text>
              <Feather name="user-plus" size={14} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.row} onPress={handleSignOut}>
                <Text style={styles.rowLabel}>Sign out</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.row} onPress={handleDeleteAccount} disabled={deleting}>
                {deleting ? (
                  <ActivityIndicator color="#ff4c4c" size="small" />
                ) : (
                  <Text style={styles.rowLabelDestructive}>Delete account</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        <SignInPromptModal
          visible={signInPromptVisible}
          onClose={() => setSignInPromptVisible(false)}
          title="Create Your Account"
          subtitle="Sign in to save your transformations and unlock all features"
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
});
