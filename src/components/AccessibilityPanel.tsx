import { useState } from "react";
import { Accessibility, RotateCcw } from "lucide-react";
import { useA11y } from "@/lib/a11y";
import { useLanguage, LANGS, ENGLISH_ENABLED, type Lang } from "@/lib/i18n";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const SIZES: { value: "s" | "m" | "l" | "xl"; key: string }[] = [
  { value: "s", key: "a11y.fontSize.s" },
  { value: "m", key: "a11y.fontSize.m" },
  { value: "l", key: "a11y.fontSize.l" },
  { value: "xl", key: "a11y.fontSize.xl" },
];

export function AccessibilityPanel() {
  const t = useT();
  const { prefs, set, reset } = useA11y();
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t("a11y.open")}
          className="fixed bottom-4 right-4 z-50 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-background transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
        >
          <Accessibility className="size-6" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[22rem] overflow-y-auto border-border bg-card">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">{t("a11y.title")}</SheetTitle>
          <SheetDescription>{t("a11y.subtitle")}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Language — oculto mientras el catálogo "en" esté incompleto (ver
              ENGLISH_ENABLED en src/lib/i18n/index.tsx). */}
          {ENGLISH_ENABLED && (
            <section aria-labelledby="a11y-lang-label">
              <Label id="a11y-lang-label" className="text-sm font-medium">
                {t("a11y.language")}
              </Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {LANGS.map((l) => (
                  <Button
                    key={l.code}
                    type="button"
                    variant={l.code === lang ? "default" : "secondary"}
                    onClick={() => setLang(l.code as Lang)}
                    aria-pressed={l.code === lang}
                    className="justify-start"
                  >
                    <span className="mr-2" aria-hidden>
                      {l.flag}
                    </span>
                    {l.label}
                  </Button>
                ))}
              </div>
            </section>
          )}

          {/* Font size */}
          <section aria-labelledby="a11y-size-label">
            <Label id="a11y-size-label" className="text-sm font-medium">
              {t("a11y.fontSize")}
            </Label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {SIZES.map((s) => (
                <Button
                  key={s.value}
                  type="button"
                  variant={prefs.fontSize === s.value ? "default" : "secondary"}
                  onClick={() => set("fontSize", s.value)}
                  aria-pressed={prefs.fontSize === s.value}
                  className="min-h-11 px-0"
                >
                  <span
                    style={{
                      fontSize:
                        s.value === "s"
                          ? "0.85rem"
                          : s.value === "m"
                            ? "1rem"
                            : s.value === "l"
                              ? "1.15rem"
                              : "1.3rem",
                    }}
                  >
                    A
                  </span>
                </Button>
              ))}
            </div>
          </section>

          {/* Toggles */}
          <ToggleRow
            id="a11y-contrast"
            label={t("a11y.highContrast")}
            desc={t("a11y.highContrast.desc")}
            checked={prefs.highContrast}
            onChange={(v) => set("highContrast", v)}
          />
          <ToggleRow
            id="a11y-motion"
            label={t("a11y.reducedMotion")}
            desc={t("a11y.reducedMotion.desc")}
            checked={prefs.reducedMotion}
            onChange={(v) => set("reducedMotion", v)}
          />
          <ToggleRow
            id="a11y-dyslexia"
            label={t("a11y.dyslexia")}
            desc={t("a11y.dyslexia.desc")}
            checked={prefs.dyslexia}
            onChange={(v) => set("dyslexia", v)}
          />
          <ToggleRow
            id="a11y-underline"
            label={t("a11y.underline")}
            desc={t("a11y.underline.desc")}
            checked={prefs.underlineLinks}
            onChange={(v) => set("underlineLinks", v)}
          />

          <div className="pt-2">
            <Button variant="ghost" onClick={reset} className="w-full">
              <RotateCcw className="mr-2 size-4" aria-hidden /> {t("a11y.reset")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ToggleRow({
  id,
  label,
  desc,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
