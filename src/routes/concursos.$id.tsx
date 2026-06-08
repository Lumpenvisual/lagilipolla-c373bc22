import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  Users,
  ListChecks,
  Clock,
  Coins,
  Trophy,
  Target,
  Lock,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useConcurso,
  useConcursoMatches,
  useConcursoLeaderboard,
  useMyInscripciones,
} from "@/hooks/useConcursos";
import { useMyPredictions } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { flag } from "@/lib/flags";
import { formatCAD, formatET, dateLabelET, isLocked } from "@/lib/format";
import { getMatchStatus } from "@/lib/matchStatus";
import { calculatePrizes, MEDALS, positionLabel } from "@/lib/prizes";
import { useT, tStatic } from "@/lib/i18n";
import {
  MODALIDAD_LABEL,
  MODALIDAD_ICON,
  ESTADO_META,
  PAGO_META,
  type Modalidad,
  type EstadoConcurso,
} from "@/lib/concursos";

export const Route = createFileRoute("/concursos/$id")({
  head: () => ({ meta: [{ title: tStatic("detail.meta.title") }] }),
  component: ConcursoDetailPage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md px-4 py-16 text-center" role="alert">
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button asChild className="mt-4" variant="secondary">
        <Link to="/concursos">{tStatic("detail.backToContests")}</Link>
      </Button>
    </main>
  ),
  notFoundComponent: () => (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-muted-foreground">{tStatic("detail.notFound")}</p>
    </main>
  ),
});

function ConcursoDetailPage() {
  const { id } = Route.useParams();
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, participant } = useAuth();

  const { data: concurso, isLoading: cl } = useConcurso(id);
  const { data: matches = [], isLoading: ml } = useConcursoMatches(id);
  const { data: leaderboard = [] } = useConcursoLeaderboard(id);
  const { data: inscripciones = [] } = useMyInscripciones(participant?.id);
  const { data: predictions = [] } = useMyPredictions(participant?.id);
  const [joining, setJoining] = useState(false);
  const [prompt, setPrompt] = useState<
    { mode: "login" | "join" | "pending" | "tba"; match: string } | null
  >(null);

  const myInscripcion = inscripciones.find((i) => i.concurso_id === id);
  const pozo = concurso ? concurso.cuota * leaderboard.length : 0;
  const prizes = useMemo(() => calculatePrizes(leaderboard, pozo), [leaderboard, pozo]);
  const teamsDefined = matches.some((m) => m.equipo_local !== "Por definir");

  const predByMatch = useMemo(() => {
    const map = new Map<number, (typeof predictions)[number]>();
    for (const p of predictions) map.set(p.match_id, p);
    return map;
  }, [predictions]);

  // The player can predict once their account is approved and teams are set.
  const canPredict = participant?.estado_pago === "aprobado" && teamsDefined;

  if (cl) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!concurso) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-muted-foreground">{t("detail.notFound")}</p>
        <Button asChild className="mt-4" variant="secondary">
          <Link to="/concursos">{t("common.back")}</Link>
        </Button>
      </main>
    );
  }

  const Icon = MODALIDAD_ICON[concurso.modalidad as Modalidad];
  const estadoMeta = ESTADO_META[concurso.estado as EstadoConcurso];
  const canJoin =
    user && participant && !myInscripcion && (concurso.estado === "abierto" || concurso.estado === "cerrado");

  const joinContest = async () => {
    if (!participant) return;
    setJoining(true);
    const { error } = await supabase.from("inscripciones").insert({
      concurso_id: id,
      participant_id: participant.id,
      estado_pago: "pendiente",
    });
    setJoining(false);
    if (error) {
      toast.error(t("detail.join.error"));
      return;
    }
    setPrompt(null);
    toast.success(t("detail.join.success"));
    qc.invalidateQueries({ queryKey: ["my-inscripciones", participant.id] });
    qc.invalidateQueries({ queryKey: ["concursos-overview"] });
  };

  // Decide what happens when a player taps a match row — always friendly & guided.
  const handleMatchClick = (m: (typeof matches)[number]) => {
    const label = `${m.equipo_local} vs ${m.equipo_visitante}`;
    const defined = m.equipo_local !== "Por definir";
    if (!user) {
      setPrompt({ mode: "login", match: label });
      return;
    }
    if (!participant) return; // organizer accounts don't play
    if (!myInscripcion) {
      setPrompt({ mode: "join", match: label });
      return;
    }
    if (myInscripcion.estado_pago !== "aprobado") {
      setPrompt({ mode: "pending", match: label });
      return;
    }
    if (!defined) {
      setPrompt({ mode: "tba", match: label });
      return;
    }
    if (isLocked(m.kickoff_time)) return; // predictions already closed
    router.navigate({ to: "/predictions", search: { concurso: id } });
  };

  // Group matches by ET date for display
  const grouped: { label: string; matches: typeof matches }[] = [];
  for (const m of matches) {
    const label = dateLabelET(m.kickoff_time);
    let g = grouped.find((x) => x.label === label);
    if (!g) {
      g = { label, matches: [] };
      grouped.push(g);
    }
    g.matches.push(m);
  }

  const stats = [
    { icon: Coins, label: t("detail.stat.pozo"), value: formatCAD(pozo), gold: true },
    { icon: Users, label: t("detail.stat.jugadores"), value: leaderboard.length },
    { icon: ListChecks, label: t("detail.stat.partidos"), value: matches.length },
    { icon: Coins, label: t("detail.stat.cuota"), value: formatCAD(concurso.cuota) },
  ];

  return (
    <main className="relative mx-auto max-w-5xl px-4 py-8">
      <div className="ambient-blob -top-16 right-1/4 hidden bg-gold/15 sm:block" aria-hidden />

      <Button asChild variant="ghost" size="sm" className="mb-4 px-0 text-muted-foreground">
        <Link to="/concursos">
          <ArrowLeft className="size-4" /> {t("nav.concursos")}
        </Link>
      </Button>

      {/* Header */}
      <Card className="glass-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <Icon className="size-3.5" /> {t(MODALIDAD_LABEL[concurso.modalidad as Modalidad])}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${estadoMeta.cls}`}>
            <span className={`size-1.5 rounded-full ${estadoMeta.dot}`} /> {t(estadoMeta.labelKey)}
          </span>
          {concurso.deadline && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> {t("detail.closes", { date: formatET(concurso.deadline) })}
            </span>
          )}
        </div>
        <h1 className="mt-3 font-display text-3xl tracking-wide sm:text-4xl">{concurso.nombre}</h1>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s, i) => (
            <div key={i} className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <s.icon className="size-3.5" />
                <span className="text-[11px] uppercase tracking-wider">{s.label}</span>
              </div>
              <p className={`mt-1 font-display text-2xl ${s.gold ? "text-gold" : "text-foreground"}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Join / actions */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!user ? (
            <Button asChild variant="hero">
              <Link to="/login">{t("detail.loginToJoin")}</Link>
            </Button>
          ) : !participant ? (
            <p className="text-sm text-muted-foreground">{t("detail.orgNoPlay")}</p>
          ) : myInscripcion ? (
            <span
              className={`rounded-full border px-3 py-1.5 text-sm ${
                PAGO_META[myInscripcion.estado_pago as keyof typeof PAGO_META].cls
              }`}
            >
              {PAGO_META[myInscripcion.estado_pago as keyof typeof PAGO_META].emoji}{" "}
              {t(PAGO_META[myInscripcion.estado_pago as keyof typeof PAGO_META].labelKey)}
            </span>
          ) : canJoin ? (
            <Button variant="hero" className="cta-pulse" disabled={joining} onClick={joinContest}>
              {joining ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {t("detail.join", { fee: formatCAD(concurso.cuota) })}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t("detail.noJoin")}</p>
          )}

          {participant?.estado_pago === "aprobado" && teamsDefined && (
            <Button
              variant="secondary"
              onClick={() => router.navigate({ to: "/predictions", search: { concurso: id } })}
            >
              <Target className="size-4" /> {t("detail.predict")}
            </Button>
          )}
        </div>

        {myInscripcion?.estado_pago === "pendiente" && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm text-gold">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <span>{t("detail.pendingNote", { fee: formatCAD(concurso.cuota) })}</span>
          </div>
        )}
      </Card>

      {/* Leaderboard */}
      <section className="mt-8">
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-gold" />
          <h2 className="font-display text-2xl tracking-wide">{t("detail.lb.title")}</h2>
        </div>
        {leaderboard.length === 0 ? (
          <Card className="mt-4 border-border bg-card p-8 text-center text-sm text-muted-foreground card-shadow">
            {t("detail.lb.empty")}
          </Card>
        ) : (
          <Card className="mt-4 overflow-hidden border-border bg-card card-shadow">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="p-3">{t("common.pos")}</th>
                    <th className="p-3">{t("common.player")}</th>
                    <th className="p-3 text-center">{t("common.pts")}</th>
                    <th className="p-3 text-center">⭐</th>
                    <th className="p-3 text-right">{t("common.prize")}</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((r) => {
                    const isMe = participant?.id === r.participant_id;
                    return (
                      <tr
                        key={r.participant_id}
                        className={`border-b border-border/60 ${isMe ? "bg-info/10" : ""}`}
                      >
                        <td className="p-3 font-display text-lg">
                          {MEDALS[r.posicion] ?? positionLabel(r.posicion, leaderboard)}
                        </td>
                        <td className="p-3 font-medium">
                          {r.nombre} {isMe && <span className="text-xs text-info">({t("common.you")})</span>}
                        </td>
                        <td className="p-3 text-center font-display text-lg text-gold">{r.total_puntos}</td>
                        <td className="p-3 text-center text-muted-foreground">{r.exactos}</td>
                        <td className="p-3 text-right text-gold">{formatCAD(prizes[r.participant_id] ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* Matches */}
      <section className="mt-8">
        <div className="flex items-center gap-2">
          <ListChecks className="size-5 text-primary" />
          <h2 className="font-display text-2xl tracking-wide">{t("detail.matches.title")}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {canPredict
            ? t("detail.matches.tapToPredict")
            : !user
              ? t("detail.matches.loginHint")
              : !myInscripcion
                ? t("detail.matches.joinHint")
                : participant?.estado_pago !== "aprobado"
                  ? t("detail.matches.pendingHint")
                  : t("detail.matches.tbaHint")}
        </p>

        {ml ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : matches.length === 0 ? (
          <Card className="mt-4 border-border bg-card p-8 text-center text-sm text-muted-foreground card-shadow">
            {t("detail.matches.empty")}
          </Card>
        ) : (
          <div className="mt-4 space-y-6">
            {grouped.map((g) => (
              <div key={g.label}>
                <h3 className="mb-2 font-display text-lg tracking-wide text-muted-foreground">{g.label}</h3>
                <Card className="divide-y divide-border border-border bg-card card-shadow">
                  {g.matches.map((m) => {
                    const hasResult = m.goles_local != null && m.goles_visitante != null;
                    const defined = m.equipo_local !== "Por definir";
                    const locked = isLocked(m.kickoff_time);
                    const pred = predByMatch.get(m.id) ?? null;
                    const hasPred = pred?.goles_local_pred != null && pred?.goles_visitante_pred != null;
                    const status = getMatchStatus(m, pred);
                    // Rows are tappable whenever tapping leads to a guided next
                    // step (enroll, sign in, info) — not just when predicting.
                    const clickable =
                      !user ||
                      (!!participant &&
                        (!myInscripcion ||
                          myInscripcion.estado_pago !== "aprobado" ||
                          !defined ||
                          !locked));

                    const inner = (
                      <>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 flex-1 text-right">
                            {flag(m.equipo_local)} {m.equipo_local}
                          </span>
                          <span className="shrink-0 font-display text-base text-gold">
                            {hasResult ? `${m.goles_local} — ${m.goles_visitante}` : t("common.vs")}
                          </span>
                          <span className="min-w-0 flex-1">
                            {m.equipo_visitante} {flag(m.equipo_visitante)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3.5" /> {formatET(m.kickoff_time)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            {hasPred && (
                              <span className="text-xs text-muted-foreground">
                                {t("detail.matches.yourPick", {
                                  l: pred!.goles_local_pred!,
                                  v: pred!.goles_visitante_pred!,
                                })}
                              </span>
                            )}
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.className}`}
                            >
                              {status.emoji} {t(status.labelKey)}
                            </span>
                            {clickable && <ChevronRight className="size-4 text-primary" />}
                          </span>
                        </div>
                      </>
                    );

                    return clickable ? (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleMatchClick(m)}
                        className="block w-full p-3 text-left transition-colors hover:bg-secondary/60"
                      >
                        {inner}
                      </button>
                    ) : (
                      <div key={m.id} className="p-3">
                        {inner}
                      </div>
                    );
                  })}
                </Card>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Guided prompt shown when a player taps a match before being ready */}
      <AlertDialog open={prompt !== null} onOpenChange={(o) => !o && setPrompt(null)}>
        <AlertDialogContent>
          {prompt?.mode === "login" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("detail.joinPrompt.loginTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("detail.joinPrompt.loginDesc", { match: prompt.match })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("detail.joinPrompt.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => router.navigate({ to: "/login" })}>
                  {t("detail.joinPrompt.login")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}

          {prompt?.mode === "join" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("detail.joinPrompt.title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("detail.joinPrompt.desc", {
                    match: prompt.match,
                    fee: formatCAD(concurso.cuota),
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("detail.joinPrompt.cancel")}</AlertDialogCancel>
                <Button variant="hero" disabled={joining} onClick={joinContest}>
                  {joining ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  {t("detail.joinPrompt.confirm", { fee: formatCAD(concurso.cuota) })}
                </Button>
              </AlertDialogFooter>
            </>
          )}

          {prompt?.mode === "pending" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("detail.joinPrompt.pendingTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("detail.joinPrompt.pendingDesc", {
                    match: prompt.match,
                    fee: formatCAD(concurso.cuota),
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction>{t("detail.joinPrompt.ok")}</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}

          {prompt?.mode === "tba" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("detail.matches.title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("detail.joinPrompt.tba")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction>{t("detail.joinPrompt.ok")}</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

    </main>
  );
}
