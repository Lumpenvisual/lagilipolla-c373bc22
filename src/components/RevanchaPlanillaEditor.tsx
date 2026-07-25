import { useEffect, useState } from "react";
import { Loader2, Save, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useTournamentState, useRevanchaPick, useSaveRevanchaPick } from "@/hooks/usePolla";
import { useT } from "@/lib/i18n";
import { MatchScoreRow } from "@/components/MatchScoreRow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  revanchaMatches,
  isRevanchaLocked,
  lastGol,
  scoreState,
  type PickMatches,
} from "@/lib/polla";

/**
 * Versión reducida de PlanillaEditor: solo semis + final, sin grupos ni especiales (La
 * Revancha no los tiene). Reutiliza MatchScoreRow (extraído de PlanillaEditor) para no
 * duplicar el JSX de "equipo — marcador — equipo", y useRevanchaPick/useSaveRevanchaPick
 * (hooks paralelos a useMyPick/useSavePick que escriben en `revancha_picks`, nunca en
 * `picks`).
 */
export function RevanchaPlanillaEditor({ participantId }: { participantId: string }) {
  const t = useT();
  const { data: ts, isLoading: tsLoading } = useTournamentState();
  const { data: pick, isLoading: pickLoading } = useRevanchaPick(participantId);
  const save = useSaveRevanchaPick(participantId);

  const [extra, setExtra] = useState<PickMatches>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    if (pick) {
      setExtra(pick.extra_matches ?? {});
      setInitialized(true);
    } else if (!pickLoading && ts) {
      setInitialized(true);
    }
  }, [pick, pickLoading, ts, initialized]);

  if (tsLoading || pickLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!ts) return null;

  const matches = revanchaMatches(ts);
  const locked = isRevanchaLocked(ts);
  const savedExtra = pick?.extra_matches ?? {};
  const isFieldLocked = (id: string, f: "gh" | "ga") => savedExtra[id]?.[f] != null;

  const setScore = (id: string, field: "gh" | "ga", raw: string) => {
    const n = lastGol(raw);
    setExtra((prev) => ({
      ...prev,
      [id]: { gh: prev[id]?.gh ?? null, ga: prev[id]?.ga ?? null, [field]: n },
    }));
  };

  const submit = async () => {
    if (locked) {
      toast.error(
        ts.revancha_abierta ? t("revancha.planilla.closed") : t("revancha.planilla.notOpen"),
      );
      return;
    }
    const badMatches = matches.filter((m) => scoreState(extra[m.id]) === "invalido");
    if (badMatches.length) {
      toast.error(
        t("revancha.planilla.errInvalid", {
          matches: badMatches.map((m) => `${m.local}–${m.visitante}`).join(", "),
        }),
        { duration: 6000 },
      );
      return;
    }
    try {
      await save.mutateAsync(extra);
      toast.success(t("revancha.planilla.saved"));
    } catch (e) {
      toast.error(
        t("revancha.planilla.saveFailed", { err: e instanceof Error ? e.message : "error" }),
      );
    }
  };

  const done = matches.filter((m) => scoreState(extra[m.id]) === "completo").length;

  return (
    <div>
      <Card className="mb-6 flex items-start gap-3 border-gold/40 bg-gold/10 p-4 text-sm text-gold">
        <Trophy className="mt-0.5 size-5 shrink-0" />
        <span>{t("revancha.planilla.banner")}</span>
      </Card>

      {matches.length === 0 ? (
        <Card className="border-border bg-card p-6 text-center text-sm text-muted-foreground card-shadow">
          {t("revancha.planilla.noMatches")}
        </Card>
      ) : (
        <>
          {locked && (
            <Card className="mb-6 border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {ts.revancha_abierta ? t("revancha.planilla.closed") : t("revancha.planilla.notOpen")}
            </Card>
          )}

          <Card className="border-border bg-card card-shadow divide-y divide-border">
            {matches.map((m) => {
              const p = extra[m.id] ?? { gh: null, ga: null };
              return (
                <MatchScoreRow
                  key={m.id}
                  match={m}
                  groups={ts.groups}
                  value={p}
                  ghDisabled={locked || isFieldLocked(m.id, "gh")}
                  gaDisabled={locked || isFieldLocked(m.id, "ga")}
                  onChange={(field, raw) => setScore(m.id, field, raw)}
                />
              );
            })}
          </Card>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              {t("revancha.planilla.progress", { done, total: matches.length })}
            </span>
            <Button variant="hero" disabled={locked || save.isPending} onClick={submit}>
              {save.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              {t("revancha.planilla.save")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
