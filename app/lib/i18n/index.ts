import { I18n } from "i18n-js";
import en from "./locales/en";
import fr from "./locales/fr";

export type AppLanguage = "en" | "fr";
export type LanguagePreference = AppLanguage | "system";

export const LOCALES = { en, fr } as const;

export const i18n = new I18n(LOCALES, {
  defaultLocale: "en",
  enableFallback: true,
  missingBehavior: "guess",
});

export function resolveSystemLocale(
  localeTag: string | null | undefined
): AppLanguage {
  if (!localeTag) return "en";
  const base = localeTag.toLowerCase().split(/[-_]/)[0];
  return base === "fr" ? "fr" : "en";
}

export function setI18nLocale(language: AppLanguage) {
  i18n.locale = language;
}

export function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}
