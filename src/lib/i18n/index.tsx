import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { translations, LANGS, type Lang } from "./translations";
import { setFormatLang } from "@/lib/format";

export { LANGS, type Lang };

const STORAGE_KEY = "polla-lang";
const DEFAULT_LANG: Lang = "es";

function isLang(v: unknown): v is Lang {
  return v === "es" || v === "en" || v === "fr";
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`,
  );
}

export type TFunc = (key: string, vars?: Record<string, string | number>) => string;

/** Read the persisted language without React context (SSR-safe; defaults to es). */
export function readLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LANG;
}

/** Context-free translate, for boundary components rendered outside the provider. */
export function tStatic(key: string, vars?: Record<string, string | number>): string {
  const lang = readLang();
  const dict = translations[lang] ?? translations[DEFAULT_LANG];
  const value = dict[key] ?? translations[DEFAULT_LANG][key] ?? key;
  return interpolate(value, vars);
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunc;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Start with the default to keep SSR and first client render identical,
  // then sync from localStorage after mount (avoids hydration mismatch).
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isLang(stored) && stored !== lang) {
        setLangState(stored);
        setFormatLang(stored);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setFormatLang(lang);
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setFormatLang(next);
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback<TFunc>(
    (key, vars) => {
      const dict = translations[lang] ?? translations[DEFAULT_LANG];
      const value = dict[key] ?? translations[DEFAULT_LANG][key] ?? key;
      return interpolate(value, vars);
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

/** Convenience hook returning just the translate function. */
export function useT(): TFunc {
  return useLanguage().t;
}
