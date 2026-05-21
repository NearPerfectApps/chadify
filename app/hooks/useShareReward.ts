import { useState } from "react";
import { Alert, Share } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useLanguage } from "../context/LanguageContext";

const APP_SHARE_URL = "https://apps.apple.com/fr/app/ultimate-chadify/id6760938416";

export function useShareReward() {
  const { t } = useLanguage();
  const claimShareReward = useMutation(api.entitlements.claimShareReward);
  const [sharing, setSharing] = useState(false);

  const shareAndClaim = async () => {
    if (sharing) return false;

    setSharing(true);

    let shared = false;
    try {
      const result = await Share.share({
        title: t("shareReward.shareTitle"),
        message: `${t("shareReward.shareMessage")} ${APP_SHARE_URL}`,
        url: APP_SHARE_URL,
      });
      shared = result.action !== Share.dismissedAction;
    } catch {
      setSharing(false);
      Alert.alert(t("common.error"), t("shareReward.failed"));
      return false;
    }

    if (!shared) {
      setSharing(false);
      return false;
    }

    try {
      const reward = await claimShareReward();
      if (reward.creditsAdded > 0) {
        Alert.alert(t("shareReward.claimedTitle"), t("shareReward.claimedBody"));
      } else {
        Alert.alert(t("shareReward.alreadyClaimedTitle"), t("shareReward.alreadyClaimedBody"));
      }
      return true;
    } catch {
      Alert.alert(t("common.error"), t("shareReward.claimRetryBody"));
      return false;
    } finally {
      setSharing(false);
    }
  };

  return { shareAndClaim, sharing };
}
