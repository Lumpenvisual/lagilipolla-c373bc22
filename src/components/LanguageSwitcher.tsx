import { Globe, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage, LANGS } from "@/lib/i18n";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, t } = useLanguage();
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={className} aria-label={t("nav.language")}>
          <Globe className="size-4" />
          <span className="ml-1.5 text-sm">{current.flag}</span>
          <span className="ml-1 hidden text-xs uppercase sm:inline">{current.code}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40 border-border bg-card">
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLang(l.code)}
            className="cursor-pointer gap-2"
          >
            <span>{l.flag}</span>
            <span className="flex-1">{l.label}</span>
            {l.code === lang && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
