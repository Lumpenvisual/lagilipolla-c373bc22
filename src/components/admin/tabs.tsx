import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  Loader2,
  Users,
  RefreshCw,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Database,
  Lock,
  Unlock,
  Cloud,
  CloudUpload,
  Download,
  Pencil,
  KeyRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTournamentState } from "@/hooks/usePolla";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PlanillaEditor } from "@/components/PlanillaEditor";
import { adminResetPin } from "@/lib/admin.functions";
import { PIN_RE } from "@/lib/auth";
import {
  POLLA,
  fmtCOP,
  parseSpecial,
  composeSpecial,
  GROUP_KEYS,
  FASE_LABEL,
  lastGol,
  scoreState,
  teamNameByCode,
  tournamentCompletion,
  type ExtraMatch,
  type Fase,
  type GroupKey,
  type GroupMatch,
  type Phases,
  type TournamentState,
} from "@/lib/polla";
import {
  KNOCKOUT_BRACKET,
  advanceAllRounds,
  applyRound32,
  buildExtraMatchesFromBracket,
} from "@/lib/knockout-bracket";
import { DownloadButton } from "@/components/DownloadButton";
import { PickHistoryCard } from "@/components/PickHistoryCard";
import {
  generateLeaderboardXlsx,
  generateParticipantesXlsx,
  generateBackupXlsx,
  generateUserPlanillaXlsx,
  generateAllPlanillasXlsx,
  uploadBackupToStorage,
  listBackups,
  getBackupSignedUrl,
  deleteBackup,
} from "@/lib/reports.functions";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/lib/i18n";

/* ---------------- Pagos ---------------- */
export function PagosTab() {
  const t = useT();
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState<{ id: string; nombre: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [editing, setEditing] = useState<{ id: string; nombre: string } | null>(null);
  const [resetPin, setResetPin] = useState<{ userId: string; nombre: string } | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const runResetPin = useServerFn(adminResetPin);
  const { data: parts = [], isLoading } = useQuery({
    queryKey: ["admin-participants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("participants")
        .select("*")
        .order("inscripcion_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const setEstado = async (id: string, estado: "aprobado" | "rechazado" | "pendiente") => {
    const { error } = await supabase
      .from("participants")
      .update({ estado_pago: estado })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(t("admin.t.toast.updated"));
      qc.invalidateQueries({ queryKey: ["admin-participants"] });
      qc.invalidateQueries({ queryKey: ["polla-leaderboard"] });
    }
  };

  const doResetPin = async () => {
    if (!resetPin) return;
    if (!PIN_RE.test(pinValue)) {
      toast.error(t("admin.t.pin.invalid"));
      return;
    }
    setPinBusy(true);
    try {
      await runResetPin({ data: { userId: resetPin.userId, newPin: pinValue } });
      toast.success(t("admin.t.pin.ok", { name: resetPin.nombre }));
      setResetPin(null);
      setPinValue("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setPinBusy(false);
    }
  };

  const confirmEliminar = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("participants").delete().eq("id", toDelete.id);
    if (error) toast.error(error.message);
    else {
      toast.success(t("admin.t.toast.partDeleted"));
      qc.invalidateQueries({ queryKey: ["admin-participants"] });
      qc.invalidateQueries({ queryKey: ["polla-leaderboard"] });
    }
    setToDelete(null);
    setTyped("");
  };

  const counts = {
    pendiente: parts.filter((p) => p.estado_pago === "pendiente").length,
    aprobado: parts.filter((p) => p.estado_pago === "aprobado").length,
    rechazado: parts.filter((p) => p.estado_pago === "rechazado").length,
  };
  const recaudado = counts.aprobado * POLLA.cuotaCOP;

  if (isLoading) return <LoadingSpinner label={t("admin.t.pagos.loading")} />;

  if (parts.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-8" />}
        title={t("admin.t.pagos.emptyTitle")}
        description={t("admin.t.pagos.emptyDesc")}
      />
    );
  }

  return (
    <div>
      <Card className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-border bg-card p-4 text-sm card-shadow">
        <span className="text-gold">{t("admin.t.pagos.pending", { n: counts.pendiente })}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-success">{t("admin.t.pagos.approved", { n: counts.aprobado })}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-gold">
          {t("admin.t.pagos.collected", { amount: fmtCOP(recaudado) })}
        </span>
      </Card>
      <Card className="overflow-hidden border-border bg-card card-shadow">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-2 sm:p-3">{t("admin.t.pagos.col.name")}</th>
                <th className="p-2 sm:p-3">{t("admin.t.pagos.col.state")}</th>
                <th className="p-2 sm:p-3 text-right">{t("admin.t.pagos.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border/60 transition-colors odd:bg-muted/20 hover:bg-muted/40"
                >
                  <td className="p-2 sm:p-3 font-medium">
                    {p.nombre}
                    <br />
                    <span className="text-xs text-muted-foreground break-all">{p.email}</span>
                  </td>
                  <td className="p-2 sm:p-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        p.estado_pago === "aprobado"
                          ? "border-success/40 bg-success/10 text-success"
                          : p.estado_pago === "rechazado"
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-gold/40 bg-gold/10 text-gold"
                      }`}
                    >
                      {p.estado_pago}
                    </span>
                  </td>
                  <td className="p-2 sm:p-3 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {p.estado_pago === "aprobado" && (
                        <DownloadButton
                          fn={generateUserPlanillaXlsx}
                          args={{ data: { participantId: p.id } }}
                          label={t("admin.t.pagos.downloadPlanilla")}
                          size="sm"
                          icon={<Download className="mr-2 size-4" />}
                        />
                      )}
                      {p.estado_pago === "aprobado" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          title={t("admin.t.edit.btn")}
                          onClick={() => setEditing({ id: p.id, nombre: p.nombre })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        title={t("admin.t.pin.btn")}
                        disabled={!p.user_id}
                        onClick={() => {
                          if (!p.user_id) return;
                          setResetPin({ userId: p.user_id, nombre: p.nombre });
                          setPinValue("");
                        }}
                      >
                        <KeyRound className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="hero"
                        disabled={p.estado_pago === "aprobado"}
                        onClick={() => setEstado(p.id, "aprobado")}
                      >
                        ✅
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={p.estado_pago === "rechazado"}
                        onClick={() => setEstado(p.id, "rechazado")}
                      >
                        ❌
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        title={t("admin.t.pagos.deleteTitle")}
                        onClick={() => {
                          setToDelete({ id: p.id, nombre: p.nombre });
                          setTyped("");
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => {
          if (!o) {
            setToDelete(null);
            setTyped("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.t.confirm.deletePartTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.t.confirm.deletePart", { name: toDelete?.nombre ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {t("admin.t.confirm.deletePartType", { name: toDelete?.nombre ?? "" })}
            </Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={toDelete?.nombre ?? ""}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!toDelete || typed.trim() !== toDelete.nombre.trim()}
              onClick={confirmEliminar}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("admin.t.confirm.deletePartCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Editar planilla de un participante (sin candados, solo admin) */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("admin.t.edit.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.t.edit.banner", { name: editing?.nombre ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <PlanillaEditor
              key={editing.id}
              participantId={editing.id}
              participantName={editing.nombre}
              adminEdit
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["admin-participants"] });
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Resetear el PIN de acceso de un usuario (solo admin) */}
      <Dialog
        open={!!resetPin}
        onOpenChange={(o) => {
          if (!o) {
            setResetPin(null);
            setPinValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.t.pin.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.t.pin.desc", { name: resetPin?.nombre ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t("admin.t.pin.label")}</Label>
            <Input
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="••••"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setResetPin(null);
                setPinValue("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="hero"
              disabled={pinBusy || !PIN_RE.test(pinValue)}
              onClick={doResetPin}
            >
              {pinBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {t("admin.t.pin.cta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Resultados ---------------- */
export function ResultadosTab() {
  const t = useT();
  const qc = useQueryClient();
  const { data: ts } = useTournamentState();
  const [draft, setDraft] = useState<TournamentState | null>(null);
  // Ganador por penales (empate en 90'/prórroga) designado por el admin: id → código.
  const [penWinners, setPenWinners] = useState<Record<string, string>>({});
  useEffect(() => {
    if (ts) setDraft(JSON.parse(JSON.stringify(ts)));
  }, [ts]);

  if (!draft) return <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />;

  /**
   * Valida los resultados oficiales antes de guardar/recalcular:
   *  - marcadores de un solo dígito (0–9) y con AMBOS campos llenos (parcial = inválido);
   *  - ningún grupo con 1º y 2º repetidos.
   * Los partidos sin jugar (ambos vacíos) se permiten. Devuelve lista de errores.
   * Mismo criterio que el guard del servidor (recalc_all_picks).
   */
  const validateOfficial = (d: TournamentState): string[] => {
    const errors: string[] = [];
    const badMatches: string[] = [];
    d.group_k_matches.forEach((m) => {
      if (scoreState(m) === "invalido") badMatches.push(`${m.local}–${m.visitante}`);
    });
    (d.extra_matches ?? []).forEach((m) => {
      if (scoreState(m) === "invalido") badMatches.push(`${m.local}–${m.visitante}`);
    });
    if (badMatches.length)
      errors.push(t("admin.t.res.invalidScore", { matches: badMatches.join(", ") }));

    const dup = GROUP_KEYS.filter((k) => {
      const g = d.groups[k];
      return g?.pos1 && g?.pos2 && g.pos1 === g.pos2;
    });
    if (dup.length) errors.push(t("admin.t.res.dupGroups", { groups: dup.join(", ") }));
    return errors;
  };

  const runRecalc = async () => {
    const { error } = await supabase.rpc("recalc_all_picks");
    if (error) toast.error(t("admin.t.toast.recalcFail", { err: error.message }));
    else toast.success(t("admin.t.toast.recalcOk"));
    qc.invalidateQueries({ queryKey: ["polla-leaderboard"] });
  };

  // Botón "Recalcular puntos" independiente: bloqueado si hay resultados inválidos.
  const recalcOnly = async () => {
    if (!draft) return;
    const errors = validateOfficial(draft);
    if (errors.length) {
      toast.error(errors.join(" · "), { duration: 6000 });
      return;
    }
    await runRecalc();
  };

  const save = async () => {
    if (!draft) return;
    const errors = validateOfficial(draft);
    if (errors.length) {
      toast.error(errors.join(" · "), { duration: 6000 });
      return;
    }
    // Auto-avance: los ganadores (marcador; empate → penales designados) pasan a la
    // ronda siguiente al guardar. El cronograma lee la misma tournament_state.extra_matches.
    const advanced = advanceAllRounds(draft.extra_matches ?? [], penWinners);
    const { error } = await supabase
      .from("tournament_state")
      .update({
        groups: draft.groups as never,
        group_k_matches: draft.group_k_matches as never,
        extra_matches: advanced as never,
        goleador_id: draft.goleador_id,
        arquero_id: draft.arquero_id,
      })
      .eq("id", 1);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft({ ...draft, extra_matches: advanced });
    toast.success(t("admin.t.toast.resultsSaved"));
    await runRecalc();
    qc.invalidateQueries({ queryKey: ["tournament-state"] });
  };

  const updateGroup = (k: (typeof GROUP_KEYS)[number], field: "pos1" | "pos2", v: string) => {
    setDraft((d) =>
      d ? { ...d, groups: { ...d.groups, [k]: { ...d.groups[k], [field]: v || null } } } : d,
    );
  };
  const updateTeam = (k: (typeof GROUP_KEYS)[number], idx: number, nombre: string) => {
    setDraft((d) => {
      if (!d) return d;
      const g = { ...d.groups[k] };
      g.teams = g.teams.map((t, i) => (i === idx ? { ...t, nombre } : t));
      return { ...d, groups: { ...d.groups, [k]: g } };
    });
  };
  const updateMatch = (id: string, field: "gh" | "ga", v: string) => {
    const n = lastGol(v);
    setDraft((d) =>
      d
        ? {
            ...d,
            group_k_matches: d.group_k_matches.map((m) => (m.id === id ? { ...m, [field]: n } : m)),
          }
        : d,
    );
  };
  const updateExtraScore = (id: string, field: "gh" | "ga", v: string) => {
    const n = lastGol(v);
    setDraft((d) =>
      d
        ? {
            ...d,
            extra_matches: (d.extra_matches ?? []).map((m) =>
              m.id === id ? { ...m, [field]: n } : m,
            ),
          }
        : d,
    );
  };

  // Grupos con 1º y 2º repetidos (para avisar en la UI).
  const dupGroupSet = new Set(
    GROUP_KEYS.filter((k) => {
      const g = draft.groups[k];
      return g?.pos1 && g?.pos2 && g.pos1 === g.pos2;
    }),
  );

  return (
    <div className="space-y-8">
      {/* Cierre del campeonato: aparece cuando las semifinales ya tienen resultado.
       * Checklist de todo lo que falta para publicar el podio en el home; destaca
       * subir los especiales (goleador/arquero) porque sin ellos no hay podio. */}
      {ts &&
        (() => {
          const semis = (ts.extra_matches ?? []).filter((m) => m.fase === "semis");
          const semisDefinidas =
            semis.length > 0 && semis.every((m) => m.gh != null && m.ga != null);
          if (!semisDefinidas) return null;
          const { done, items } = tournamentCompletion(ts);
          if (done) {
            return (
              <Card className="border-success/50 bg-success/10 p-5 card-shadow">
                <h2 className="font-display text-xl text-success">
                  {t("admin.t.res.cierre.doneTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("admin.t.res.cierre.doneMsg")}
                </p>
                <Button asChild variant="secondary" size="sm" className="mt-3">
                  <a href="/">{t("admin.t.res.cierre.verHome")}</a>
                </Button>
              </Card>
            );
          }
          const faltanEspeciales = items.some(
            (i) => (i.key === "goleador" || i.key === "arquero") && !i.done,
          );
          return (
            <Card className="border-gold/50 bg-gold/5 p-5 card-shadow">
              <h2 className="font-display text-xl text-gold">{t("admin.t.res.cierre.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("admin.t.res.cierre.hint")}</p>
              <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                {items.map((i) => (
                  <li key={i.key} className="flex items-center gap-2">
                    <span aria-hidden>{i.done ? "✅" : "❌"}</span>
                    <span className={i.done ? "text-muted-foreground" : "font-medium"}>
                      {i.label}
                      {!i.done && i.pending > 1 && (
                        <span className="ml-1 text-xs text-destructive">
                          ({t("admin.t.res.cierre.pendingN", { n: i.pending })})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {faltanEspeciales && (
                <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                  {t("admin.t.res.cierre.especialesCta")}
                </p>
              )}
            </Card>
          );
        })()}

      <Card className="border-gold/30 bg-card p-5 card-shadow">
        <h2 className="font-display text-xl text-gold">{t("admin.t.res.repechajes")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("admin.t.res.repechajesHint")}</p>
        <div className="mt-3 space-y-3">
          {GROUP_KEYS.flatMap(
            (k) =>
              draft.groups[k].teams
                .map((team, i) => (team.po ? { k, i, team } : null))
                .filter(Boolean) as {
                k: (typeof GROUP_KEYS)[number];
                i: number;
                team: (typeof draft.groups)[(typeof GROUP_KEYS)[number]]["teams"][number];
              }[],
          ).map(({ k, i, team }) => (
            <div key={`${k}-${i}`} className="flex items-center gap-2 text-sm">
              <span className="w-20 font-display">{t("planilla.group.label", { k })}</span>
              <span className="w-20 text-xs text-muted-foreground">{team.po}</span>
              <Input
                value={team.nombre}
                onChange={(e) => updateTeam(k, i, e.target.value)}
                className="h-8"
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-border bg-card p-0 card-shadow">
        <Collapsible
          defaultOpen={GROUP_KEYS.some((k) => !draft.groups[k]?.pos1 || !draft.groups[k]?.pos2)}
        >
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
            <span className="flex items-center gap-2">
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              <span className="font-display text-xl">{t("admin.t.res.groups")}</span>
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
              {GROUP_KEYS.map((k) => {
                const g = draft.groups[k];
                const opts = g.teams.map((team) => ({ id: team.id, label: team.nombre }));
                const isDup = dupGroupSet.has(k);
                return (
                  <div
                    key={k}
                    className={`rounded-lg border bg-muted/30 p-3 ${isDup ? "border-destructive" : "border-border"}`}
                  >
                    <p className="font-display text-lg">{t("planilla.group.label", { k })}</p>
                    {isDup && (
                      <p className="text-[11px] font-medium text-destructive">
                        {t("admin.t.res.dupHint")}
                      </p>
                    )}
                    <div className="mt-2 space-y-1.5">
                      <select
                        value={g.pos1 ?? ""}
                        onChange={(e) => updateGroup(k, "pos1", e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                      >
                        <option value="">— 1° —</option>
                        {opts.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={g.pos2 ?? ""}
                        onChange={(e) => updateGroup(k, "pos2", e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                      >
                        <option value="">— 2° —</option>
                        {opts.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card className="border-info/30 bg-card p-0 card-shadow">
        <Collapsible
          defaultOpen={(() => {
            const kIds = new Set(draft.groups.K.teams.map((t) => t.id));
            return draft.group_k_matches.some(
              (m) => kIds.has(m.local) && kIds.has(m.visitante) && (m.gh == null || m.ga == null),
            );
          })()}
        >
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
            <span className="flex items-center gap-2">
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              <span className="font-display text-xl text-info">{t("admin.t.res.markK")}</span>
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="divide-y divide-border px-5 pb-5">
              {(() => {
                const kIds = new Set(draft.groups.K.teams.map((t) => t.id));
                return draft.group_k_matches.filter(
                  (m) => kIds.has(m.local) && kIds.has(m.visitante),
                );
              })().map((m) => {
                const lName = draft.groups.K.teams.find((t) => t.id === m.local)?.nombre ?? m.local;
                const vName =
                  draft.groups.K.teams.find((t) => t.id === m.visitante)?.nombre ?? m.visitante;
                return (
                  <div key={m.id} className="flex items-center gap-2 py-2">
                    <span className="flex-1 text-right text-sm">{lName}</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]"
                      value={m.gh ?? ""}
                      onChange={(e) => updateMatch(m.id, "gh", e.target.value)}
                      className="h-8 w-14 text-center"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]"
                      value={m.ga ?? ""}
                      onChange={(e) => updateMatch(m.id, "ga", e.target.value)}
                      className="h-8 w-14 text-center"
                    />
                    <span className="flex-1 text-sm">{vName}</span>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {(() => {
        const fasesKO: Fase[] = [
          "dieciseisavos",
          "octavos",
          "cuartos",
          "semis",
          "tercero",
          "final",
        ];
        const all = draft.extra_matches ?? [];
        const fasesConPartidos = fasesKO.filter((f) => all.some((m) => m.fase === f));
        if (fasesConPartidos.length === 0) return null;
        // Fase activa por defecto: la primera (en orden) con algún partido sin resultado.
        const activeFase = fasesConPartidos.find((f) =>
          all.some((m) => m.fase === f && (m.gh == null || m.ga == null)),
        );
        return (
          <Card className="border-info/30 bg-card p-5 card-shadow">
            <h2 className="font-display text-xl text-info">{t("admin.t.res.markKnockout")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("admin.t.res.knockoutHint")}</p>
            <div className="mt-4 space-y-3">
              {fasesConPartidos.map((fase) => {
                const list = all
                  .filter((m) => m.fase === fase)
                  .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
                const conResultado = list.filter((m) => m.gh != null && m.ga != null).length;
                return (
                  <Collapsible key={fase} defaultOpen={fase === activeFase}>
                    <Card className="border-border bg-muted/20 p-0">
                      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                        <span className="flex min-w-0 items-center gap-2">
                          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                          <span className="truncate font-display text-sm uppercase tracking-wider">
                            {FASE_LABEL[fase]}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {t("admin.t.res.koPhaseCount", {
                            done: conResultado,
                            total: list.length,
                          })}
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="divide-y divide-border border-t border-border/60 px-4 py-1">
                          {list.map((m) => (
                            <div key={m.id} className="flex items-center gap-2 py-2">
                              <span className="flex-1 truncate text-right text-sm">
                                {teamNameByCode(draft.groups, m.local) || "—"}
                              </span>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]"
                                value={m.gh ?? ""}
                                onChange={(e) => updateExtraScore(m.id, "gh", e.target.value)}
                                className="h-8 w-14 shrink-0 text-center"
                              />
                              <span className="text-muted-foreground">–</span>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]"
                                value={m.ga ?? ""}
                                onChange={(e) => updateExtraScore(m.id, "ga", e.target.value)}
                                className="h-8 w-14 shrink-0 text-center"
                              />
                              <span className="flex-1 truncate text-sm">
                                {teamNameByCode(draft.groups, m.visitante) || "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {(() => {
        const ex = draft.extra_matches ?? [];
        const draws = ex.filter((m) => m.gh != null && m.ga != null && m.gh === m.ga);
        if (draws.length === 0) return null;
        return (
          <Card className="border-info/30 bg-card p-5 card-shadow">
            <h2 className="font-display text-xl text-info">{t("admin.t.res.adv.title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("admin.t.res.adv.hint")}</p>
            <div className="mt-3 space-y-2">
              {draws.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm">
                    {teamNameByCode(draft.groups, m.local)} {m.gh}–{m.ga}{" "}
                    {teamNameByCode(draft.groups, m.visitante)}
                  </span>
                  <select
                    value={penWinners[m.id] ?? ""}
                    onChange={(e) => setPenWinners((s) => ({ ...s, [m.id]: e.target.value }))}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    <option value="">— {t("admin.t.res.adv.penPick")} —</option>
                    <option value={m.local}>{teamNameByCode(draft.groups, m.local)}</option>
                    <option value={m.visitante}>{teamNameByCode(draft.groups, m.visitante)}</option>
                  </select>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      <Card className="border-destructive/30 bg-card p-5 card-shadow">
        <h2 className="font-display text-xl text-destructive">{t("admin.t.res.especiales")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Nombre y equipo por separado; se guardan como «Nombre (Equipo)». Puedes editarlos y volver
          a guardar cuando quieras: los puntos se recalculan solos.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SpecialEdit
            label={t("admin.t.res.goleador")}
            value={draft.goleador_id}
            onChange={(v) => setDraft({ ...draft, goleador_id: v })}
            phNombre="Nombre (ej. Kylian Mbappé)"
            phEquipo="Equipo (ej. Francia)"
          />
          <SpecialEdit
            label={t("admin.t.res.arquero")}
            value={draft.arquero_id}
            onChange={(v) => setDraft({ ...draft, arquero_id: v })}
            phNombre="Nombre (ej. Unai Simón)"
            phEquipo="Equipo (ej. España)"
          />
        </div>
        <ParticipantSpecialsPicks />
      </Card>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={save} variant="hero" size="lg" className="shadow-2xl">
          <RefreshCw className="mr-2 size-4" /> {t("admin.t.res.save")}
        </Button>
        <Button onClick={recalcOnly} variant="outline" size="lg" className="shadow-lg">
          <RefreshCw className="mr-2 size-4" /> {t("admin.t.res.recalc")}
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Editor de un especial oficial (nombre + equipo) ----------------
 * Dos campos separados que se persisten compuestos como "Nombre (Equipo)" (el formato
 * canónico que exige especial_matches). Siempre editable: al volver a guardar, el
 * trigger ts_recalc_on_official_change recalcula los puntos. */
function SpecialEdit({
  label,
  value,
  onChange,
  phNombre,
  phEquipo,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  phNombre: string;
  phEquipo: string;
}) {
  const parts = parseSpecial(value);
  const [nombre, setNombre] = useState(parts.nombre);
  const [equipo, setEquipo] = useState(parts.seleccion);
  // Resincroniza si el valor cambia desde afuera (carga inicial / reset del draft).
  const pushed = useRef<string | null>(value ?? null);
  useEffect(() => {
    if ((value ?? null) !== pushed.current) {
      const p = parseSpecial(value);
      setNombre(p.nombre);
      setEquipo(p.seleccion);
      pushed.current = value ?? null;
    }
  }, [value]);
  const push = (n: string, e: string) => {
    const v = composeSpecial(n, e);
    pushed.current = v;
    onChange(v);
  };
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 grid grid-cols-[1fr_130px] gap-2">
        <Input
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
            push(e.target.value, equipo);
          }}
          placeholder={phNombre}
          maxLength={60}
          aria-label={`${label} · nombre`}
        />
        <Input
          value={equipo}
          onChange={(e) => {
            setEquipo(e.target.value);
            push(nombre, e.target.value);
          }}
          placeholder={phEquipo}
          maxLength={30}
          aria-label={`${label} · equipo`}
        />
      </div>
    </div>
  );
}

/* ---------------- Especiales (respuestas de los participantes) ---------------- */
export function EspecialesTab() {
  const t = useT();
  return (
    <Card className="border-border bg-card p-5 card-shadow">
      <h2 className="font-display text-xl">{t("admin.t.esp.title")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("admin.t.esp.hint")}</p>
      <div className="mt-4 overflow-x-auto rounded-md border border-border">
        <SpecialsTable />
      </div>
    </Card>
  );
}

/* ---------------- Cronograma (fases + extra_matches) ---------------- */
const DEFAULT_PHASES: Phases = {
  grupos: true,
  dieciseisavos: false,
  octavos: false,
  cuartos: false,
  semis: false,
  tercero: false,
  final: false,
};

const DEFAULT_VISIBILITY: Record<string, boolean> = {
  grupos: true,
  dieciseisavos: false,
  octavos: false,
  cuartos: false,
  semis: false,
  tercero: false,
  final: false,
  goleador: true,
  arquero: true,
  historico: true,
};

export function CronogramaTab() {
  const t = useT();
  const qc = useQueryClient();
  const { data: ts } = useTournamentState();
  const [phases, setPhases] = useState<Phases>(DEFAULT_PHASES);
  const [extras, setExtras] = useState<ExtraMatch[]>([]);
  const [groupMatches, setGroupMatches] = useState<GroupMatch[]>([]);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(DEFAULT_VISIBILITY);
  // Asignación manual de los 8 mejores terceros: id de partido R32 → código de equipo.
  const [thirds, setThirds] = useState<Record<string, string>>({});

  useEffect(() => {
    if (ts) {
      // Normaliza a booleanos reales: registros antiguos pueden traer "true"/"false" (string) en jsonb.
      const toBool = (val: unknown) => val === true || val === "true";
      const normObj = (raw: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, toBool(v)]));
      setPhases({
        ...DEFAULT_PHASES,
        ...normObj((ts.phases ?? {}) as Record<string, unknown>),
      } as Phases);
      setExtras(ts.extra_matches ?? []);
      setGroupMatches(ts.group_k_matches ?? []);
      setVisibility({
        ...DEFAULT_VISIBILITY,
        ...normObj((ts.visibility ?? {}) as Record<string, unknown>),
      });
    }
  }, [ts]);

  if (!ts) return <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />;

  const fases: Fase[] = ["dieciseisavos", "octavos", "cuartos", "semis", "tercero", "final"];
  const fasesEditables: Fase[] = ["grupos", ...fases];

  // Slots de tercero del bracket (visitante = 3°), con sus grupos candidatos.
  const thirdSlots = KNOCKOUT_BRACKET.filter(
    (m) => m.fase === "dieciseisavos" && m.visitante.kind === "third",
  ).map((m) => ({
    id: m.id,
    num: m.num,
    groups: (m.visitante as { groups: GroupKey[] }).groups,
  }));
  // Grupos sin 1°/2° oficial definido todavía.
  const missingGroups = GROUP_KEYS.filter((k) => !ts.groups[k]?.pos1 || !ts.groups[k]?.pos2);
  // Candidatos a tercero de un slot: equipos de los grupos permitidos que NO son 1°/2°.
  const thirdOptions = (groups: GroupKey[]) =>
    groups.flatMap((g) => {
      const grp = ts.groups[g];
      if (!grp) return [];
      return grp.teams
        .filter((tm) => tm.id !== grp.pos1 && tm.id !== grp.pos2)
        .map((tm) => ({ id: tm.id, label: `${tm.nombre} (${g})` }));
    });

  const save = async () => {
    // La visibilidad de cada fase para los usuarios la dicta su toggle de activación:
    // mantenemos phases y visibility sincronizados para las 7 fases antes de persistir.
    const syncedVisibility: Record<string, boolean> = { ...visibility };
    for (const f of fasesEditables) syncedVisibility[f] = !!phases[f];
    const { error } = await supabase
      .from("tournament_state")
      .update({
        phases: phases as never,
        extra_matches: extras as never,
        group_k_matches: groupMatches as never,
        visibility: syncedVisibility as never,
      })
      .eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success(t("admin.t.toast.cronSaved"));
    qc.invalidateQueries({ queryKey: ["tournament-state"] });
  };

  // Rellena los cruces de dieciseisavos desde los 1°/2° oficiales de cada grupo
  // (+ terceros asignados a mano). Solo actualiza el borrador local; el admin revisa
  // y guarda con el botón inferior. Si aún no hay bracket sembrado, lo crea.
  const generateR32 = () => {
    if (!ts) return;
    const base = extras.length ? extras : buildExtraMatchesFromBracket();
    setExtras(applyRound32(base, ts.groups, thirds));
    toast.success(t("admin.t.cron.gen.done"));
  };

  const addMatch = (fase: Fase) => {
    if (fase === "grupos") {
      const id = `g-${Math.random().toString(36).slice(2, 8)}`;
      setGroupMatches((arr) => [
        ...arr,
        {
          id,
          fecha: "", // fecha en blanco: el admin la define cuando FIFA la confirme
          local: "",
          visitante: "",
          sede: "",
          gh: null,
          ga: null,
        },
      ]);
      return;
    }
    const id = `${fase}-${Math.random().toString(36).slice(2, 8)}`;
    setExtras((arr) => [
      ...arr,
      {
        id,
        fase,
        fecha: "", // fecha en blanco: el admin la define cuando FIFA la confirme
        local: "",
        visitante: "",
        sede: "",
        gh: null,
        ga: null,
      },
    ]);
  };

  const updateMatch = (fase: Fase, id: string, patch: Partial<ExtraMatch>) => {
    if (fase === "grupos") {
      setGroupMatches((arr) => arr.map((m) => (m.id === id ? { ...m, ...patch } : m)));
      return;
    }
    setExtras((arr) => arr.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };
  const removeMatch = (fase: Fase, id: string) => {
    if (fase === "grupos") {
      setGroupMatches((arr) => arr.filter((m) => m.id !== id));
      return;
    }
    setExtras((arr) => arr.filter((m) => m.id !== id));
  };

  const grouped = (fase: Fase): (ExtraMatch | GroupMatch)[] => {
    if (fase === "grupos") {
      return [...groupMatches].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
    }
    return extras
      .filter((m) => m.fase === fase)
      .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl text-gold">{t("admin.t.cron.phasesTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("admin.t.cron.phasesHint")}</p>
      </div>

      <Card className="border-info/30 bg-card p-5 card-shadow">
        <h2 className="font-display text-xl text-info">{t("admin.t.cron.gen.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("admin.t.cron.gen.hint")}</p>

        {missingGroups.length > 0 && (
          <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            {t("admin.t.cron.gen.missing", { groups: missingGroups.join(", ") })}
          </p>
        )}

        <div className="mt-4">
          <Label className="text-[11px] uppercase text-muted-foreground">
            {t("admin.t.cron.gen.thirdsLabel")}
          </Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {thirdSlots.map((slot) => (
              <div key={slot.id} className="rounded-md border border-border bg-muted/30 p-2">
                <p className="text-[11px] text-muted-foreground">
                  P{slot.num} · 3° ({slot.groups.join("/")})
                </p>
                <select
                  value={thirds[slot.id] ?? ""}
                  onChange={(e) => setThirds((s) => ({ ...s, [slot.id]: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="">— {t("admin.t.cron.gen.thirdNone")} —</option>
                  {thirdOptions(slot.groups).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={generateR32} disabled={missingGroups.length > 0} variant="secondary">
            <RefreshCw className="mr-1 size-4" /> {t("admin.t.cron.gen.button")}
          </Button>
          <span className="text-xs text-muted-foreground">{t("admin.t.cron.gen.afterHint")}</span>
        </div>
      </Card>

      {fasesEditables.map((fase) => {
        const active = !!phases[fase];
        const list = grouped(fase);
        return (
          <Card
            key={fase}
            className={`bg-card p-0 card-shadow transition-colors ${
              active ? "border-success/40" : "border-border"
            }`}
          >
            <Collapsible>
              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="group flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    <h3 className="truncate font-display text-lg">{FASE_LABEL[fase]}</h3>
                    <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                      {list.length === 1
                        ? t("admin.t.cron.oneMatch")
                        : t("admin.t.cron.nMatches", { n: list.length })}
                    </span>
                  </button>
                </CollapsibleTrigger>
                <label className="flex shrink-0 cursor-pointer items-center gap-2">
                  <span
                    className={`hidden items-center gap-1 text-xs sm:flex ${
                      active ? "text-success" : "text-muted-foreground"
                    }`}
                  >
                    {active ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    {active ? t("admin.t.cron.phaseVisible") : t("admin.t.cron.phaseHidden")}
                  </span>
                  <Switch
                    checked={active}
                    onCheckedChange={(next) => {
                      // Un solo interruptor: activar/desactivar la fase la muestra u oculta
                      // a los participantes Y habilita/deshabilita la carga de marcadores.
                      setPhases((p) => ({ ...p, [fase]: next }));
                      setVisibility((s) => ({ ...s, [fase]: next }));
                    }}
                  />
                </label>
              </div>
              <CollapsibleContent>
                <div className="border-t border-border/60 px-4 py-4 sm:px-5">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => addMatch(fase)} variant="secondary">
                      <Plus className="mr-1 size-4" /> {t("admin.t.cron.addMatch")}
                    </Button>
                  </div>
                  {list.length === 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">{t("admin.t.cron.empty")}</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {list.map((m) => (
                        <div
                          key={m.id}
                          className="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
                        >
                          <div className="space-y-2">
                            <Input
                              placeholder={t("admin.t.cron.phLocal")}
                              value={m.local}
                              onChange={(e) => updateMatch(fase, m.id, { local: e.target.value })}
                            />
                            <Input
                              placeholder={t("admin.t.cron.phVisitante")}
                              value={m.visitante}
                              onChange={(e) =>
                                updateMatch(fase, m.id, { visitante: e.target.value })
                              }
                            />
                            <Input
                              placeholder={t("admin.t.cron.phSede")}
                              value={m.sede}
                              onChange={(e) => updateMatch(fase, m.id, { sede: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <div>
                              <Label className="text-[11px] uppercase text-muted-foreground">
                                {t("admin.t.cron.dateLabel")}
                              </Label>
                              <Input
                                type="datetime-local"
                                value={toLocalInput(m.fecha)}
                                onChange={(e) =>
                                  updateMatch(fase, m.id, { fecha: fromLocalInput(e.target.value) })
                                }
                              />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {t("admin.t.cron.scoreInResultados")}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => removeMatch(fase, m.id)}
                            title={t("admin.t.cron.deleteMatch")}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}

      <Card className="border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-xl">{t("admin.t.cron.visTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("admin.t.cron.visHint")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(["goleador", "arquero", "historico"] as const).map((k) => (
            <label
              key={k}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
            >
              <span className="text-sm">{t(`admin.t.cron.vis.${k}`)}</span>
              <Switch
                checked={visibility[k] !== false}
                onCheckedChange={(v) => setVisibility((s) => ({ ...s, [k]: v }))}
              />
            </label>
          ))}
        </div>
      </Card>

      <div className="sticky bottom-4 flex justify-center">
        <Button onClick={save} variant="hero" size="lg" className="shadow-2xl">
          <RefreshCw className="mr-2 size-4" /> {t("admin.t.cron.save")}
        </Button>
      </div>
    </div>
  );
}

/** ISO ↔ <input type="datetime-local"> (en hora local del navegador del admin). */
function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

/* ---------------- Reportes ---------------- */
export function ReportesTab() {
  const t = useT();
  return (
    <div className="space-y-6">
      <DeadlineLockCard />
      <Card className="border-info/30 bg-card p-6 card-shadow">
        <h2 className="font-display text-xl text-info">{t("admin.t.rep.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("admin.t.rep.desc")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <DownloadButton
            fn={generateLeaderboardXlsx}
            label={t("admin.t.rep.leaderboard")}
            icon={<FileSpreadsheet className="mr-2 size-4" />}
          />
          <DownloadButton
            fn={generateParticipantesXlsx}
            label={t("admin.t.rep.participants")}
            icon={<FileSpreadsheet className="mr-2 size-4" />}
          />
          <DownloadButton
            fn={generateAllPlanillasXlsx}
            label={t("admin.t.rep.allPlanillas")}
            icon={<FileSpreadsheet className="mr-2 size-4" />}
          />
        </div>
      </Card>
      <Card className="border-gold/30 bg-card p-6 card-shadow">
        <h2 className="font-display text-xl text-gold">{t("admin.t.rep.backupTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("admin.t.rep.backupDesc")}</p>
        <div className="mt-4">
          <DownloadButton
            fn={generateBackupXlsx}
            label={t("admin.t.rep.backupBtn")}
            variant="hero"
            icon={<Database className="mr-2 size-4" />}
          />
        </div>
      </Card>
      <CloudBackupCard />
      <PickHistoryCard scope="all" />
    </div>
  );
}

function DeadlineLockCard() {
  // see below
  return <DeadlineLockCardImpl />;
}

function CloudBackupCard() {
  const t = useT();
  const qc = useQueryClient();
  const runUpload = useServerFn(uploadBackupToStorage);
  const runList = useServerFn(listBackups);
  const runSign = useServerFn(getBackupSignedUrl);
  const runDelete = useServerFn(deleteBackup);
  const [busy, setBusy] = useState(false);

  const { data: files, isLoading } = useQuery({
    queryKey: ["backups-list"],
    queryFn: () => runList(),
  });

  const createBackup = async () => {
    setBusy(true);
    const tid = toast.loading(t("admin.t.toast.backupCreating"));
    try {
      const r = await runUpload();
      toast.success(t("admin.t.toast.backupCreated", { name: r.filename }), { id: tid });
      qc.invalidateQueries({ queryKey: ["backups-list"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error", { id: tid });
    } finally {
      setBusy(false);
    }
  };

  const download = async (path: string) => {
    try {
      const { url } = await runSign({ data: { path } });
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const remove = async (path: string) => {
    if (!confirm(t("admin.t.confirm.deleteBackup", { path }))) return;
    try {
      await runDelete({ data: { path } });
      toast.success(t("admin.t.toast.backupDeleted"));
      qc.invalidateQueries({ queryKey: ["backups-list"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <Card className="border-info/30 bg-card p-6 card-shadow">
      <h2 className="font-display text-xl text-info flex items-center gap-2">
        <Cloud className="size-5" /> {t("admin.t.cloud.title")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("admin.t.cloud.desc")}</p>
      <div className="mt-4">
        <Button onClick={createBackup} disabled={busy} variant="hero">
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <CloudUpload className="mr-2 size-4" />
          )}
          {t("admin.t.cloud.create")}
        </Button>
      </div>
      <div className="mt-6">
        <h3 className="text-sm font-medium text-muted-foreground">{t("admin.t.cloud.history")}</h3>
        {isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("admin.t.cloud.loading")}</p>
        ) : !files || files.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("admin.t.cloud.empty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {files.map((f) => (
              <li key={f.path} className="flex items-center gap-2 py-2">
                <span className="flex-1 truncate">
                  {f.name}
                  {f.size != null && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {(f.size / 1024).toFixed(1)} KB
                    </span>
                  )}
                </span>
                <Button size="sm" variant="secondary" onClick={() => download(f.path)}>
                  <Download className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(f.path)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function DeadlineLockCardImpl() {
  const t = useT();
  const qc = useQueryClient();
  const { data: ts } = useTournamentState();
  const lockedAt = ts?.picks_locked_at ?? undefined;
  const isLocked = !!lockedAt && new Date(lockedAt).getTime() <= Date.now();
  const [busy, setBusy] = useState(false);

  const setLock = async (when: Date | null) => {
    if (
      !confirm(
        when && when.getTime() <= Date.now()
          ? t("admin.t.confirm.lockNow")
          : t("admin.t.confirm.unlock"),
      )
    )
      return;
    setBusy(true);
    const iso = (when ?? new Date(2099, 0, 1)).toISOString();
    const { error } = await supabase
      .from("tournament_state")
      .update({ picks_locked_at: iso })
      .eq("id", 1);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      when && when.getTime() <= Date.now()
        ? t("admin.t.toast.locked")
        : t("admin.t.toast.unlocked"),
    );
    qc.invalidateQueries({ queryKey: ["tournament_state"] });
  };

  return (
    <Card
      className={`p-6 card-shadow ${isLocked ? "border-destructive/40 bg-destructive/5" : "border-success/30 bg-success/5"}`}
    >
      <h2
        className={`font-display text-xl flex items-center gap-2 ${isLocked ? "text-destructive" : "text-success"}`}
      >
        {isLocked ? <Lock className="size-5" /> : <Unlock className="size-5" />}
        {isLocked ? t("admin.t.lock.closed") : t("admin.t.lock.open")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {lockedAt
          ? t("admin.t.cloud.scheduled", {
              when: new Date(lockedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" }),
            })
          : t("admin.t.cloud.noSchedule")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {isLocked ? (
          <Button variant="hero" disabled={busy} onClick={() => setLock(null)}>
            <Unlock className="mr-2 size-4" />
            {t("admin.t.lock.reopen")}
          </Button>
        ) : (
          <Button variant="destructive" disabled={busy} onClick={() => setLock(new Date())}>
            <Lock className="mr-2 size-4" />
            {t("admin.t.lock.closeNow")}
          </Button>
        )}
      </div>
    </Card>
  );
}

/* ---------------- Especiales por participante (admin) ---------------- */

/** Celda "Nombre + (Selección)" para una respuesta de especial en texto libre. */
function SpecialAnswer({ text }: { text: string | null }) {
  if (!text) return <span className="text-muted-foreground">—</span>;
  const { nombre, seleccion } = parseSpecial(text);
  return (
    <span>
      {nombre}
      {seleccion && <span className="text-xs text-muted-foreground"> · {seleccion}</span>}
    </span>
  );
}

/** Tabla de lo que escribió cada participante aprobado (goleador / arquero). */
function SpecialsTable() {
  const t = useT();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-specials-picks"],
    queryFn: async () => {
      const { data: parts, error: e1 } = await supabase
        .from("participants")
        .select("id, nombre, estado_pago")
        .eq("estado_pago", "aprobado")
        .order("nombre");
      if (e1) throw e1;
      const ids = (parts ?? []).map((p) => p.id);
      if (ids.length === 0)
        return [] as {
          id: string;
          nombre: string;
          goleador: string | null;
          arquero: string | null;
        }[];
      const { data: picks, error: e2 } = await supabase
        .from("picks")
        .select("participant_id, goleador_id, arquero_id")
        .in("participant_id", ids);
      if (e2) throw e2;
      const byId = new Map((picks ?? []).map((p) => [p.participant_id, p]));
      return (parts ?? []).map((p) => {
        const pk = byId.get(p.id);
        return {
          id: p.id,
          nombre: p.nombre,
          goleador: (pk?.goleador_id ?? null) || null,
          arquero: (pk?.arquero_id ?? null) || null,
        };
      });
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data || data.length === 0) {
    return <p className="px-3 py-4 text-xs text-muted-foreground">{t("admin.t.esp.empty")}</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <th className="p-2">{t("admin.t.esp.colPart")}</th>
          <th className="p-2">{t("admin.t.esp.colGol")}</th>
          <th className="p-2">{t("admin.t.esp.colArq")}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r) => (
          <tr key={r.id} className="border-b border-border/60">
            <td className="p-2 font-medium">{r.nombre}</td>
            <td className="p-2">
              <SpecialAnswer text={r.goleador} />
            </td>
            <td className="p-2">
              <SpecialAnswer text={r.arquero} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Versión plegable de la tabla, embebida en Resultados como apoyo al resultado oficial. */
function ParticipantSpecialsPicks() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium hover:text-foreground"
      >
        <span>Apuestas de participantes (goleador / arquero)</span>
        <span className="text-xs text-muted-foreground">{open ? "Ocultar ▲" : "Mostrar ▼"}</span>
      </button>
      {open && (
        <div className="mt-3 overflow-x-auto rounded-md border border-border">
          <SpecialsTable />
        </div>
      )}
    </div>
  );
}
