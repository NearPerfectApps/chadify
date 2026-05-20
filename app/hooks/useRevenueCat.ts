import { useEffect, useState } from "react";
import { Platform, Alert } from "react-native";
import Purchases, {
  PurchasesOfferings,
  PurchasesPackage,
  LOG_LEVEL,
} from "react-native-purchases";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { t } from "../lib/i18n";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";

let _configured = false;

// Configure RevenueCat once at app boot — must happen before any logIn / purchase call.
export function configureRevenueCat() {
  if (_configured) return;
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  const apiKey = Platform.select({ ios: IOS_KEY, android: ANDROID_KEY }) ?? IOS_KEY;
  Purchases.configure({ apiKey });
  _configured = true;
}

export function useRevenueCat() {
  const [isReady, setIsReady] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const entitlements = useQuery(api.entitlements.getMyEntitlements);

  useEffect(() => {
    const init = async () => {
      try {
        configureRevenueCat();
        const o = await Purchases.getOfferings();
        setOfferings(o);
        setIsReady(true);
      } catch (e) {
        console.warn("[RevenueCat] init failed:", e);
        setIsReady(true); // still mark ready so UI doesn't stay in loading
      }
    };
    init();
  }, []);

  // Log in the RevenueCat customer with the Convex user ID so webhooks can
  // identify the user. Called once entitlements are loaded (userId is implicit).
  // In practice, entitlements query resolving means the user is authenticated.
  useEffect(() => {
    if (!isReady || entitlements === undefined) return;
    // entitlements === null means not authenticated yet — skip
    // We identify via getMyEntitlements being non-null as a proxy for being logged in.
    // The actual userId is managed by the app — RevenueCat doesn't need it for
    // the paywall display, only for webhook attribution. Set it via loginRevenueCat().
  }, [isReady, entitlements]);

  const purchase = async (pkg: PurchasesPackage) => {
    try {
      await Purchases.purchasePackage(pkg);
      // Credits are granted via webhook → Convex → reactive useQuery update
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert(t("paywall.purchaseFailed"), e.message ?? t("paywall.pleaseTryAgain"));
        throw e;
      }
    }
  };

  const restorePurchases = async () => {
    try {
      await Purchases.restorePurchases();
      Alert.alert(t("paywall.restoredTitle"), t("paywall.restoredBody"));
    } catch (e: any) {
      Alert.alert(t("paywall.restoreFailed"), e.message ?? t("paywall.pleaseTryAgain"));
    }
  };

  const getPackage = (identifier: string): PurchasesPackage | null => {
    if (!offerings?.current) return null;
    return offerings.current.availablePackages.find(
      (p) => p.offeringIdentifier === identifier || p.identifier === identifier
        || p.product.identifier === identifier
    ) ?? null;
  };

  return {
    isReady,
    offerings,
    entitlements,
    purchase,
    restorePurchases,
    getPackage,
  };
}

// Call this after login to attribute purchases to the correct Convex user
export async function loginRevenueCat(convexUserId: string) {
  try {
    await Purchases.logIn(convexUserId);
  } catch (e) {
    console.warn("[RevenueCat] logIn failed:", e);
  }
}

// Call this on sign-out
export async function logoutRevenueCat() {
  try {
    await Purchases.logOut();
  } catch (e) {
    console.warn("[RevenueCat] logOut failed:", e);
  }
}
