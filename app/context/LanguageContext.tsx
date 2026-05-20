import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";
import {
  AppLanguage,
  LanguagePreference,
  LOCALES,
  resolveSystemLocale,
  setI18nLocale,
  t as translate,
} from "../lib/i18n";

const STORAGE_KEY = "languagePreference";

type Ctx = {
  /** What the user selected — "system", "en", or "fr". */
  preference: LanguagePreference;
  /** The actual resolved language used to render strings. */
  language: AppLanguage;
  setPreference: (pref: LanguagePreference) => Promise<void>;
  /** Translate a key. Re-runs whenever `language` changes because consumers re-render. */
  t: (key: string, options?: Record<string, unknown>) => string;
  /** Raw access to the active locale tree (for arrays, structured values). */
  strings: (typeof LOCALES)[AppLanguage];
};

const LanguageContext = createContext<Ctx | null>(null);

function getSystemLanguage(): AppLanguage {
  const tag = Localization.getLocales()[0]?.languageTag;
  return resolveSystemLocale(tag);
}

function resolveLanguage(pref: LanguagePreference): AppLanguage {
  return pref === "system" ? getSystemLanguage() : pref;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>("system");
  const [language, setLanguage] = useState<AppLanguage>(() => getSystemLanguage());

  // Apply locale to i18n-js immediately so any non-React caller (e.g. t() before
  // first render) gets the right strings.
  useEffect(() => {
    setI18nLocale(language);
  }, [language]);

  // Load persisted preference once at startup.
  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        const pref: LanguagePreference =
          stored === "en" || stored === "fr" || stored === "system" ? stored : "system";
        setPreferenceState(pref);
        setLanguage(resolveLanguage(pref));
      })
      .catch(() => {
        // Fall back to the system default we already set.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback(async (pref: LanguagePreference) => {
    setPreferenceState(pref);
    setLanguage(resolveLanguage(pref));
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, pref);
    } catch {
      // Non-fatal — the choice still applies for the current session.
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      preference,
      language,
      setPreference,
      t: translate,
      strings: LOCALES[language],
    }),
    [preference, language, setPreference]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}

export function useTranslation() {
  const { t, strings, language } = useLanguage();
  return { t, strings, language };
}
