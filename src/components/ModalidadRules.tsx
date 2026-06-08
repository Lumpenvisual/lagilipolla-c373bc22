import { Clock, Target, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n";
import { PRIZE_SPLIT } from "@/lib/constants";
import {
  MODALIDAD_SCOPE,
  MODALIDAD_ACCENT,
  type Modalidad,
} from "@/lib/concursos";

const MEDALS = ["🥇", "🥈", "🥉", "4️⃣"];

/** Rules + prize split specific to a modality (no global mixing). */
export function ModalidadRules({ modalidad }: { modalidad: Modalidad }) {
  const t = useT();
  const a = MODALIDAD_ACCENT[modalidad];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Scope + deadline */}
      <Card className="glass-card p-5">
        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-3">
            <Target className={`mt-0.5 size-5 shrink-0 ${a.text}`} />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("common.scope")}
              </p>
              <p className="mt-0.5 font-medium text-foreground">{t(MODALIDAD_SCOPE(modalidad))}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Clock className={`mt-0.5 size-5 shrink-0 ${a.text}`} />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("mod.rules.deadline")}
              </p>
              <p className="mt-0.5 font-medium text-foreground">{t("mod.rules.deadlineText")}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Prize split */}
      <Card className="glass-card border-gold/30 p-5">
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-gold" />
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("mod.rules.prizesIntro")}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {PRIZE_SPLIT.map((pct, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2.5"
            >
              <span className="text-xl">{MEDALS[i]}</span>
              <span className="font-display text-lg text-gold">{Math.round(pct * 100)}%</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
