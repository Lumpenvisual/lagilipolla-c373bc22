import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n";
import {
  MODALIDAD_LABEL,
  MODALIDAD_ICON,
  MODALIDAD_ACCENT,
  MODALIDAD_IDEAL,
  MODALIDAD_COMMITMENT,
  MODALIDAD_TAGLINE,
  MODALIDAD_SCOPE,
  type Modalidad,
} from "@/lib/concursos";

/** Large selectable card for a modality — used on the home and onboarding. */
export function ModalidadCard({
  modalidad,
  index = 0,
  ctaKey = "play.choose",
}: {
  modalidad: Modalidad;
  index?: number;
  ctaKey?: string;
}) {
  const t = useT();
  const Icon = MODALIDAD_ICON[modalidad];
  const a = MODALIDAD_ACCENT[modalidad];

  return (
    <Link
      to="/jugar/$modalidad"
      params={{ modalidad }}
      className="animate-fade-up group block"
      style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
    >
      <Card
        className={`glass-card flex h-full flex-col p-6 transition-all duration-300 hover:-translate-y-1.5 ${a.ring}`}
      >
        <div className="flex items-center justify-between">
          <div
            className={`flex size-12 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110 ${a.chip}`}
          >
            <Icon className="size-6" />
          </div>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${a.chip}`}
          >
            {t(MODALIDAD_COMMITMENT(modalidad))}
          </span>
        </div>

        <h3 className="mt-4 font-display text-2xl tracking-wide">{t(MODALIDAD_LABEL[modalidad])}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t(MODALIDAD_TAGLINE(modalidad))}</p>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("common.idealFor")}:
            </span>
            <span className="text-foreground">{t(MODALIDAD_IDEAL(modalidad))}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("common.scope")}:
            </span>
            <span className="text-foreground">{t(MODALIDAD_SCOPE(modalidad))}</span>
          </div>
        </div>

        <div className="mt-auto pt-5">
          <span className={`inline-flex items-center gap-1 text-sm font-semibold ${a.text}`}>
            {t(ctaKey)} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Card>
    </Link>
  );
}
