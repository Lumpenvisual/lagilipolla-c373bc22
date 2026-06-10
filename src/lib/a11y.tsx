import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type FontSize = "s" | "m" | "l" | "xl";

export interface A11yPrefs {
  fontSize: FontSize;
  highContrast: boolean;
  reducedMotion: boolean;
  dyslexia: boolean;
  underlineLinks: boolean;
}

const DEFAULTS: A11yPrefs = {
  fontSize: "m",
  highContrast: false,
  reducedMotion: false,
  dyslexia: false,
  underlineLinks: false,
};

const STORAGE_KEY = "polla-a11y";

interface Ctx {
  prefs: A11yPrefs;
  set: <K extends keyof A11yPrefs>(key: K, value: A11yPrefs[K]) => void;
  reset: () => void;
}

const A11yContext = createContext<Ctx | null>(null);

function load(): A11yPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<A11yPrefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function apply(prefs: A11yPrefs) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.dataset.a11yFontSize = prefs.fontSize;
  html.classList.toggle("a11y-contrast", prefs.highContrast);
  html.classList.toggle("a11y-reduce-motion", prefs.reducedMotion);
  html.classList.toggle("a11y-dyslexia", prefs.dyslexia);
  html.classList.toggle("a11y-underline", prefs.underlineLinks);
}

export function A11yProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULTS);

  // Hydrate on mount + honor user OS reduced-motion if no stored pref.
  useEffect(() => {
    const stored = load();
    let next = stored;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        next = { ...stored, reducedMotion: true };
      }
    } catch {
      /* ignore */
    }
    setPrefs(next);
    apply(next);
  }, []);

  const set = useCallback<Ctx["set"]>((key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      apply(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setPrefs(DEFAULTS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    apply(DEFAULTS);
  }, []);

  const value = useMemo(() => ({ prefs, set, reset }), [prefs, set, reset]);
  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

export function useA11y(): Ctx {
  const ctx = useContext(A11yContext);
  if (!ctx) throw new Error("useA11y must be used within A11yProvider");
  return ctx;
}
