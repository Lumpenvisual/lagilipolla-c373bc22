import { useMemo, useState } from "react";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Lock, ArrowLeft, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMatches, useMyPredictions, type Match, type Prediction } from "@/hooks/useData";
import { useConcurso, useConcursoMatches } from "@/hooks/useConcursos";
import { PredictionCard } from "@/components/PredictionCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { autoPredict } from "@/lib/autopredict.functions";
import { dateLabelET, isLocked, hoursUntil } from "@/lib/format";
import { TOTAL_MATCHES } from "@/lib/constants";
import { useT, tStatic, type TFunc } from "@/lib/i18n";

export const Route = createFileRoute("/predictions")({
  validateSearch: (search: Record<string, unknown>): { concurso?: string } => ({
    concurso: typeof search.concurso === "string" ? search.concurso : undefined,
  }),
  head: () => ({ meta: [{ title: tStatic("pred.meta.title") }] }),
  component: PredictionsPage,
});

const JORNADAS = [1, 2, 3] as const;

function PredictionsPage() {
  const router = useRouter();
  const t = useT();
  const { concurso } = Route.useSearch();
  const { user, participant, loading } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!user || participant?.estado_pago !== "aprobado") {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md items-center px-4">
        <Card className="w-full border-border bg-card p-8 text-center card-shadow">
          <h1 className="font-display text-2xl tracking-wide">{t("pred.restricted.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("pred.restricted.body")}</p>
          <Button className="mt-6" onClick={() => router.navigate({ to: "/dashboard" })}>
            {t("pred.restricted.cta")}
          </Button>
        </Card>
      </main>
    );
  }

  return <PredictionsContent participantId={participant.id} concursoId={concurso} t={t} />;
}

function PredictionsContent({
  participantId,
  concursoId,
  t,
}: {
  participantId: string;
  concursoId?: string;
  t: TFunc;
}) {
  const { data: allMatches = [], isLoading: ml } = useMatches();
  const { data: concursoMatches = [], isLoading: cml } = useConcursoMatches(concursoId);
  const { data: concurso } = useConcurso(concursoId);
  const { data: preds = [], refetch } = useMyPredictions(participantId);
  const [jornada, setJornada] = useState<number>(1);
  const runAutoPredict = useServerFn(autoPredict);
  const [aiState, setAiState] = useState<"idle" | "running">("idle");
  const [aiConfirm, setAiConfirm] = useState(false);

  const scoped = !!concursoId;
  const matches = scoped ? concursoMatches : allMatches;
  const loading = scoped ? cml : ml;

  const predByMatch = useMemo(() => {
    const m = new Map<number, Prediction>();
    for (const p of preds) m.set(p.match_id, p);
    return m;
  }, [preds]);

  const now = Date.now();

  // Predictable matches in current view (exclude "Por definir" knockouts)
  const viewMatches = useMemo(
    () => matches.filter((m) => m.equipo_local !== "Por definir"),
    [matches],
  );

  const total = scoped ? viewMatches.length : TOTAL_MATCHES;
  const predictedCount = viewMatches.filter(
    (m) => predByMatch.get(m.id)?.goles_local_pred != null,
  ).length;

  const lockedNoPred = viewMatches.filter(
    (m) => isLocked(m.kickoff_time, now) && predByMatch.get(m.id)?.goles_local_pred == null,
  ).length;
  const toComplete = viewMatches.filter(
    (m) => !isLocked(m.kickoff_time, now) && predByMatch.get(m.id)?.goles_local_pred == null,
  ).length;

  const soon = viewMatches.filter(
    (m) =>
      !isLocked(m.kickoff_time, now) &&
      hoursUntil(m.kickoff_time, now) <= 6 &&
      predByMatch.get(m.id)?.goles_local_pred == null,
  ).length;

  // Group matches by date label; for the global (non-scoped) view, also filter by jornada.
  const grouped = useMemo(() => {
    const list = scoped ? viewMatches : viewMatches.filter((m) => m.jornada === jornada);
    const groups: { label: string; matches: Match[] }[] = [];
    for (const m of list) {
      const label = dateLabelET(m.kickoff_time);
      let g = groups.find((x) => x.label === label);
      if (!g) {
        g = { label, matches: [] };
        groups.push(g);
      }
      g.matches.push(m);
    }
    return groups;
  }, [viewMatches, jornada, scoped]);

  const undefinedCount = matches.length - viewMatches.length;

  // Matches the AI can fill: predictable, still open, and not yet committed.
  const aiEligible = useMemo(
    () =>
      viewMatches.filter(
        (m) =>
          !isLocked(m.kickoff_time, now) &&
          predByMatch.get(m.id)?.goles_local_pred == null,
      ),
    [viewMatches, predByMatch, now],
  );

  async function handleAutoPredict() {
    setAiConfirm(false);
    if (aiEligible.length === 0) return;
    setAiState("running");
    try {
      const predictions = await runAutoPredict({
        data: {
          matches: aiEligible.map((m) => ({
            id: m.id,
            equipo_local: m.equipo_local,
            equipo_visitante: m.equipo_visitante,
            grupo: m.grupo ?? "",
            fase: m.fase ?? "grupos",
          })),
        },
      });

      const rows = predictions.map((p) => ({
        participant_id: participantId,
        match_id: p.match_id,
        goles_local_pred: p.goles_local_pred,
        goles_visitante_pred: p.goles_visitante_pred,
      }));

      const { error } = await supabase
        .from("predictions")
        .upsert(rows, { onConflict: "participant_id,match_id" });
      if (error) throw error;

      await refetch();
      toast.success(t("pred.ai.success", { n: rows.length }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("pred.ai.error"));
    } finally {
      setAiState("idle");
    }
  }


  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
      {scoped && (
        <Button asChild variant="ghost" size="sm" className="mb-3 px-0 text-muted-foreground">
          <Link to="/concursos/$id" params={{ id: concursoId! }}>
            <ArrowLeft className="size-4" /> {t("pred.backToContest")}
          </Link>
        </Button>
      )}
      <h1 className="font-display text-4xl tracking-wide">
        <span aria-hidden>⚽ </span>{t("pred.title")}
      </h1>
      <p className="text-sm text-muted-foreground">
        {scoped
          ? concurso?.nombre ?? t("pred.defaultContest")
          : t("pred.groupStageSub", { n: TOTAL_MATCHES })}
      </p>

      {/* Progress */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("pred.progress")}</span>
          <span className="font-medium text-foreground">
            {predictedCount}/{total}
          </span>
        </div>
        <Progress value={total ? (predictedCount / total) * 100 : 0} className="mt-2 h-2" />
      </div>

      {/* AI auto-prediction */}
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">{t("pred.ai.title")}</p>
            <p className="text-xs text-muted-foreground">
              {aiEligible.length > 0
                ? t("pred.ai.subtitle", { n: aiEligible.length })
                : t("pred.ai.none")}
            </p>
          </div>
        </div>
        <Button
          variant="hero"
          className="shrink-0"
          disabled={aiEligible.length === 0 || aiState === "running"}
          onClick={() => setAiConfirm(true)}
        >
          {aiState === "running" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {t("pred.ai.running")}
            </>
          ) : (
            <>
              <Sparkles className="size-4" /> {t("pred.ai.cta")}
            </>
          )}
        </Button>
      </div>

      <AlertDialog open={aiConfirm} onOpenChange={setAiConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pred.ai.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("pred.ai.confirmBody", { n: aiEligible.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleAutoPredict}>
              {t("pred.ai.confirmCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Important rule */}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        <Lock className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>{t("pred.importantTitle")}</strong> {t("pred.important")}
        </span>
      </div>

      {scoped && undefinedCount > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-info/40 bg-info/10 p-3 text-sm text-info">
          <AlertTriangle className="size-4 shrink-0" />
          {t(undefinedCount === 1 ? "pred.tbaNote_one" : "pred.tbaNote_other", { n: undefinedCount })}
        </div>
      )}

      {soon > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm text-gold">
          <AlertTriangle className="size-4 shrink-0" />
          {t(soon === 1 ? "pred.soon_one" : "pred.soon_other", { n: soon })}
        </div>
      )}

      {/* Tabs (only for global group-stage view) */}
      {!scoped && (
        <div className="mt-6 flex gap-2">
          {JORNADAS.map((j) => (
            <button
              key={j}
              onClick={() => setJornada(j)}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                jornada === j
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("pred.jornada", { n: j })}
            </button>
          ))}
        </div>
      )}

      {/* Matches grouped by date */}
      <div className="mt-6 space-y-8">
        {grouped.length === 0 ? (
          <Card className="border-border bg-card p-8 text-center text-sm text-muted-foreground card-shadow">
            {t("pred.empty")}
          </Card>
        ) : (
          grouped.map((g) => (
            <div key={g.label}>
              <h2 className="mb-3 font-display text-xl tracking-wide text-muted-foreground">{g.label}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {g.matches.map((m) => (
                  <PredictionCard
                    key={m.id}
                    match={m}
                    prediction={predByMatch.get(m.id) ?? null}
                    participantId={participantId}
                    onSaved={() => refetch()}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-3 text-center text-xs sm:text-sm">
          <span className="text-primary">{t("pred.bar.predicted", { n: predictedCount })}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-destructive">{t("pred.bar.locked", { n: lockedNoPred })}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-info">{t("pred.bar.toComplete", { n: toComplete })}</span>
        </div>
      </div>
    </main>
  );
}
