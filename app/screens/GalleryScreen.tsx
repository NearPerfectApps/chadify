import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  SafeAreaView,
  Alert,
  Modal,
  Share,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { usePaginatedQuery, useMutation } from "convex/react";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { AppStackParamList } from "../navigation/AppNavigator";
import { useGuest } from "../context/GuestContext";
import { useTranslation } from "../context/LanguageContext";
import SignInPromptModal from "../components/SignInPromptModal";

type Nav = NativeStackNavigationProp<AppStackParamList, "Gallery">;

const COLUMN_COUNT = 2;
const GAP = 8;
const PADDING = 16;
const ITEM_SIZE = (Dimensions.get("window").width - PADDING * 2 - GAP) / COLUMN_COUNT;
const PAGE_SIZE = 20;

type Item = {
  _id: Id<"transformations">;
  createdAt: number;
  url: string | null;
};

type SelectedItem = { id: Id<"transformations">; url: string };

export default function GalleryScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const removeTransformation = useMutation(api.transformations.remove);
  const { isAnonymous } = useGuest();

  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [signInPromptVisible, setSignInPromptVisible] = useState(false);

  useEffect(() => {
    if (isAnonymous) setSignInPromptVisible(true);
  }, [isAnonymous]);

  const { results, status, loadMore } = usePaginatedQuery(
    api.transformations.listForCurrentUser,
    {},
    { initialNumItems: PAGE_SIZE }
  );

  const handleShare = async () => {
    if (!selected) return;
    setSharing(true);
    try {
      const localPath = `${FileSystem.cacheDirectory}chadify_share_${Date.now()}.jpg`;
      const { uri } = await FileSystem.downloadAsync(selected.url, localPath);
      await Share.share({ url: uri });
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      Alert.alert(t("common.error"), t("gallery.shareFailed"));
    } finally {
      setSharing(false);
    }
  };

  const handleDelete = () => {
    if (!selected) return;
    Alert.alert(t("gallery.deleteConfirmTitle"), t("gallery.deleteConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await removeTransformation({ id: selected.id });
            setSelected(null);
          } catch {
            Alert.alert(t("common.error"), t("gallery.deleteFailed"));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const isLoadingFirst = status === "LoadingFirstPage";

  const renderItem = ({ item }: { item: Item }) => (
    <TouchableOpacity
      style={styles.itemContainer}
      onPress={() => item.url && setSelected({ id: item._id, url: item.url })}
      activeOpacity={0.85}
    >
      {item.url ? (
        <Image source={{ uri: item.url }} style={styles.itemImage} resizeMode="cover" />
      ) : (
        <View style={[styles.itemImage, styles.itemPlaceholder]}>
          <ActivityIndicator color="rgba(255,255,255,0.3)" size="small" />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t("gallery.title")}</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Settings")} style={styles.settingsButton}>
          <Feather name="settings" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {isLoadingFirst ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t("gallery.emptyTitle")}</Text>
          <Text style={styles.emptySubtext}>{t("gallery.emptySubtitle")}</Text>
        </View>
      ) : (
        <FlatList
          data={results as Item[]}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          numColumns={COLUMN_COUNT}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          onEndReached={() => {
            if (status === "CanLoadMore") loadMore(PAGE_SIZE);
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            status === "CanLoadMore" ? (
              <View style={styles.loadMoreIndicator}>
                <ActivityIndicator color="rgba(255,255,255,0.4)" size="small" />
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => {}} tintColor="#fff" />
          }
        />
      )}

      <SignInPromptModal
        visible={signInPromptVisible}
        onClose={() => { setSignInPromptVisible(false); navigation.goBack(); }}
        title={t("gallery.signInPromptTitle")}
        subtitle={t("gallery.signInPromptSubtitle")}
      />

      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelected(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="x" size={18} color="#fff" />
            </TouchableOpacity>

            {selected && (
              <Image
                source={{ uri: selected.url }}
                style={styles.fullImage}
                resizeMode="cover"
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, sharing && styles.buttonDisabled]}
                onPress={handleShare}
                disabled={sharing || deleting}
                activeOpacity={0.85}
              >
                {sharing ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <>
                    <Feather name="share" size={16} color="#000" style={styles.buttonIcon} />
                    <Text style={styles.modalButtonText}>{t("gallery.share")}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButtonDestructive, deleting && styles.buttonDisabled]}
                onPress={handleDelete}
                disabled={sharing || deleting}
                activeOpacity={0.85}
              >
                {deleting ? (
                  <ActivityIndicator color="#ff4c4c" size="small" />
                ) : (
                  <>
                    <Feather name="trash-2" size={16} color="#ff4c4c" style={styles.buttonIcon} />
                    <Text style={styles.modalButtonDestructiveText}>{t("gallery.delete")}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: PADDING,
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
  settingsButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  grid: {
    padding: PADDING,
    gap: GAP,
  },
  row: {
    gap: GAP,
  },
  itemContainer: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 10,
    overflow: "hidden",
  },
  itemImage: {
    width: "100%",
    height: "100%",
  },
  itemPlaceholder: {
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubtext: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
  },
  loadMoreIndicator: {
    paddingVertical: 20,
    alignItems: "center",
  },
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 24,
    backgroundColor: "transparent",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullImage: {
    width: "100%",
    aspectRatio: 0.82,
    borderRadius: 24,
  },
  modalActions: {
    flexDirection: "row",
    paddingTop: 10,
    paddingBottom: 14,
    gap: 10,
  },
  modalButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonIcon: {
    marginRight: 7,
  },
  modalButtonText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },
  modalButtonDestructive: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,80,80,0.4)",
  },
  modalButtonDestructiveText: {
    color: "#ff4c4c",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
