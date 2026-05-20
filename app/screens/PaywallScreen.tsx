import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { PurchasesPackage } from "react-native-purchases";
import { useRevenueCat } from "../hooks/useRevenueCat";
import { useTranslation } from "../context/LanguageContext";

type Props = {
  onClose: () => void;
};

type Section = {
  title: string;
  items: {
    productId: string;
    label: string;
    description: string;
    highlight?: boolean;
  }[];
};

export default function PaywallScreen({ onClose }: Props) {
  const { offerings, purchase, restorePurchases, getPackage, isReady, entitlements } =
    useRevenueCat();
  const { t } = useTranslation();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const sections: Section[] = [
    {
      title: t("paywall.sectionCredits"),
      items: [
        {
          productId: "chadify_credits_10",
          label: t("paywall.credits10Label"),
          description: t("paywall.credits10Desc"),
        },
        {
          productId: "chadify_credits_50",
          label: t("paywall.credits50Label"),
          description: t("paywall.credits50Desc"),
        },
      ],
    },
    {
      title: t("paywall.sectionSubscription"),
      items: [
        {
          productId: "chadify_subscription_monthly",
          label: t("paywall.monthlyLabel"),
          description: t("paywall.monthlyDesc"),
        },
        {
          productId: "chadify_subscription_annual",
          label: t("paywall.annualLabel"),
          description: t("paywall.annualDesc"),
          highlight: true,
        },
      ],
    },
    {
      title: t("paywall.sectionUnlimited"),
      items: [
        {
          productId: "chadify_lifetime",
          label: t("paywall.lifetimeLabel"),
          description: t("paywall.lifetimeDesc"),
          highlight: true,
        },
      ],
    },
  ];

  const handlePurchase = async (productId: string) => {
    const pkg = getPackage(productId);
    if (!pkg) return;
    setLoadingId(productId);
    try {
      await purchase(pkg);
      onClose();
    } catch {
      // error already handled inside purchase()
    } finally {
      setLoadingId(null);
    }
  };

  const priceFor = (productId: string): string => {
    const pkg = getPackage(productId);
    if (!pkg) return "—";
    return pkg.product.priceString;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <Text style={styles.title}>{t("paywall.title")}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="x" size={20} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      {entitlements && (
        <View style={styles.statusBadge}>
          {entitlements.lifetimeAccess ? (
            <Text style={styles.statusText}>{t("paywall.statusLifetime")}</Text>
          ) : entitlements.credits > 0 ? (
            <Text style={styles.statusText}>
              {t(
                entitlements.credits === 1
                  ? "paywall.statusCreditsOne"
                  : "paywall.statusCreditsOther",
                { count: entitlements.credits }
              )}
            </Text>
          ) : (
            <Text style={styles.statusText}>{t("paywall.statusFreeTier")}</Text>
          )}
        </View>
      )}

      <Text style={styles.subtitle}>{t("paywall.subtitle")}</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => (
              <TouchableOpacity
                key={item.productId}
                style={[styles.row, item.highlight && styles.rowHighlight]}
                onPress={() => handlePurchase(item.productId)}
                disabled={loadingId !== null || !isReady}
                activeOpacity={0.8}
              >
                <View style={styles.rowLeft}>
                  <Text style={[styles.rowLabel, item.highlight && styles.rowLabelHighlight]}>
                    {item.label}
                  </Text>
                  <Text style={styles.rowDescription}>{item.description}</Text>
                </View>
                <View style={styles.rowRight}>
                  {loadingId === item.productId ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.rowPrice, item.highlight && styles.rowPriceHighlight]}>
                      {isReady ? priceFor(item.productId) : "—"}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <TouchableOpacity style={styles.restoreButton} onPress={restorePurchases}>
          <Text style={styles.restoreText}>{t("paywall.restore")}</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>{t("paywall.legal")}</Text>

        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => Linking.openURL("https://www.nearperfectapps.xyz/privacy/chadify")}>
            <Text style={styles.legalLink}>{t("paywall.privacyPolicy")}</Text>
          </TouchableOpacity>
          <Text style={styles.legalLinkSeparator}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL("https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")}>
            <Text style={styles.legalLink}>{t("paywall.termsOfUse")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerLeft: {
    width: 32,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 4,
  },
  closeButton: {
    width: 32,
    alignItems: "flex-end",
  },
  statusBadge: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 10,
  },
  statusText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  subtitle: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  rowHighlight: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "#1e1e1e",
  },
  rowLeft: {
    flex: 1,
    gap: 3,
  },
  rowLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  rowLabelHighlight: {
    fontWeight: "700",
  },
  rowDescription: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
  },
  rowRight: {
    marginLeft: 16,
    minWidth: 60,
    alignItems: "flex-end",
  },
  rowPrice: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    fontWeight: "600",
  },
  rowPriceHighlight: {
    color: "#fff",
    fontWeight: "700",
  },
  restoreButton: {
    alignSelf: "center",
    paddingVertical: 12,
    marginBottom: 8,
  },
  restoreText: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 13,
  },
  legal: {
    color: "rgba(255,255,255,0.18)",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 12,
  },
  legalLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
  },
  legalLink: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 11,
    textDecorationLine: "underline",
  },
  legalLinkSeparator: {
    color: "rgba(255,255,255,0.15)",
    fontSize: 11,
  },
});
