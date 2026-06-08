import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { flag } from "@/lib/flags";
import { formatET, formatUTC, isLocked } from "@/lib/format";
import { getMatchStatus, type MatchLike, type PredLike } from "@/lib/matchStatus";
import { useT } from "@/lib/i18n";
import type { Match, Prediction } from "@/hooks/useData";

type SaveState = "idle" | "saving" | "error";

function clampScore(v: string): number | null {
  if (v === "") return null;
  const n = Math.max(0, Math.min(20, Math.floor(Number(v))));
  return Number.isNaN(n) ? null : n;
}

function filterDigits(v: string): string {
  return v.replace(/\D/g, "");
}

function allowOnlyDigits(e: React.KeyboardEvent<HTMLInputElement>) {
  const key = e.key;
  if (
    key === "Backspace" || key === "Delete" || key === "Tab" ||
    key === "ArrowLeft" || key === "ArrowRight" || key === "Home" || key === "End" ||
    /^[0-9]$/.test(key)
  ) {
    return;
  }
  e.preventDefault();
}

export function PredictionCard({
  match,
  prediction,
  participantId,
  onSaved,
}: {
  match: Match;
  prediction: Prediction | null;
  participantId: string;
  onSaved: () => void;
}) {
  const t = useT();
  const [local, setLocal] = useState<string>(prediction?.goles_local_pred?.toString() ?? "");
  const [visit, setVisit] = useState<string>(prediction?.goles_visitante_pred?.toString() ?? "");
  const [save, setSave] = useState<SaveState>("idle");

  const locked = isLocked(match.kickoff_time);
  const hasResult = match.goles_local != null && match.goles_visitante != null;

  // A prediction that already has scores is committed and can no longer be edited.
  const committed = !!prediction && prediction.goles_local_pred != null && prediction.goles_visitante_pred != null;
  const readOnly = locked || committed;

  const matchLike: MatchLike = match;
  const predLike: PredLike | null = prediction;
  const status = getMatchStatus(matchLike, predLike);

  async function handleSave() {
    const l = clampScore(local);
    const v = clampScore(visit);
    if (l == null || v == null) return;
    setSave("saving");
    const { error } = await supabase
      .from("predictions")
      .upsert(
        { participant_id: participantId, match_id: match.id, goles_local_pred: l, goles_visitante_pred: v },
        { onConflict: "participant_id,match_id" },
      );
    if (error) {
      setSave("error");
    } else {
      setSave("idle");
      onSaved();
    }
  }

  const canSave = !readOnly && clampScore(local) != null && clampScore(visit) != null && save !== "saving";

  return (
    <Card className="relative border-border bg-card p-4 card-shadow">
      <span
        className={`absolute right-3 top-3 rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.className}`}
      >
        {status.emoji} {t(status.labelKey)}
      </span>

      <div className="text-xs text-muted-foreground">
        {t("card.group", { g: match.grupo, n: match.numero_partido })}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="text-right">
          <div className="text-lg leading-none">{flag(match.equipo_local)}</div>
          <div className="mt-1 text-sm font-medium">{match.equipo_local}</div>
        </div>

        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            max={20}
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={readOnly}
            value={local}
            onKeyDown={allowOnlyDigits}
            onChange={(e) => setLocal(filterDigits(e.target.value))}
            className="h-12 w-12 px-0 text-center font-display text-2xl"
            aria-label={t("card.goalsFor", { team: match.equipo_local })}
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="number"
            min={0}
            max={20}
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={readOnly}
            value={visit}
            onKeyDown={allowOnlyDigits}
            onChange={(e) => setVisit(filterDigits(e.target.value))}
            className="h-12 w-12 px-0 text-center font-display text-2xl"
            aria-label={t("card.goalsFor", { team: match.equipo_visitante })}
          />
        </div>

        <div className="text-left">
          <div className="text-lg leading-none">{flag(match.equipo_visitante)}</div>
          <div className="mt-1 text-sm font-medium">{match.equipo_visitante}</div>
        </div>
      </div>

      {hasResult && (
        <p className="mt-3 text-center text-sm">
          {t("card.result")} <span className="font-display text-lg text-gold">{match.goles_local} — {match.goles_visitante}</span>
        </p>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>📍 {match.estadio}</span>
        <span className="text-right">
          🕐 {formatET(match.kickoff_time)}
          <br />
          <span className="text-[10px]">({formatUTC(match.kickoff_time)})</span>
        </span>
      </div>

      {/* Action area */}
      {readOnly ? (
        <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-muted/50 py-2 text-xs text-muted-foreground">
          <Lock className="size-3" />
          {committed && !locked ? t("card.committed") : t("card.locked")}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <Button size="sm" className="w-full" disabled={!canSave} onClick={handleSave}>
            {save === "saving" ? (
              t("common.saving")
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-4" /> {t("card.save")}
              </span>
            )}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {t("card.warnImmutable")}
          </p>
          {save === "error" && (
            <p className="text-center text-xs text-destructive">{t("card.saveError")}</p>
          )}
        </div>
      )}
    </Card>
  );
}
