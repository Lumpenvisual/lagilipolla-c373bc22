import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  RefreshCw,
  Trash2,
  Plus,
  FileSpreadsheet,
  Database,
  Lock,
  Unlock,
  Cloud,
  CloudUpload,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTournamentState } from "@/hooks/usePolla";
import { Card } from "@/components/ui/card";
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
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  POLLA,
  fmtCOP,
  GROUP_KEYS,
  FASE_LABEL,
  type ExtraMatch,
  type Fase,
  type GroupMatch,
  type Phases,
  type SpecialPlayer,
  type TournamentState,
} from "@/lib/polla";
import { DownloadButton } from "@/components/DownloadButton";
import { PickHistoryCard } from "@/components/PickHistoryCard";
import {
  generateLeaderboardXlsx,
  generateParticipantesXlsx,
  generateBackupXlsx,
  uploadBackupToStorage,
  listBackups,
  getBackupSignedUrl,
  deleteBackup,
} from "@/lib/reports.functions";
import { useServerFn } from "@tanstack/react-start";
import { useT, tStatic } from "@/lib/i18n";

/* ---------------- Pagos ---------------- */
export function PagosTab() {
  const t = useT();
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState<{ id: string; nombre: string } | null>(null);
  const [typed, setTyped] = useState("");
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
        <span className="text-gold">{t("admin.t.pagos.collected", { amount: fmtCOP(recaudado) })}</span>
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
    </div>
  );
}

/* ---------------- Resultados ---------------- */
export function ResultadosTab() {
  const t = useT();
  const qc = useQueryClient();
  const { data: ts } = useTournamentState();
  const [draft, setDraft] = useState<TournamentState | null>(null);
  useEffect(() => {
    if (ts) setDraft(JSON.parse(JSON.stringify(ts)));
  }, [ts]);

  if (!draft) return <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />;

  const save = async () => {
    const { error } = await supabase
      .from("tournament_state")
      .update({
        groups: draft.groups as never,
        group_k_matches: draft.group_k_matches as never,
        goleador_id: draft.goleador_id,
        arquero_id: draft.arquero_id,
      })
      .eq("id", 1);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("admin.t.toast.resultsSaved"));
    const { error: e2 } = await supabase.rpc("recalc_all_picks");
    if (e2) toast.error(t("admin.t.toast.recalcFail", { err: e2.message }));
    else toast.success(t("admin.t.toast.recalcOk"));
    qc.invalidateQueries({ queryKey: ["tournament-state"] });
    qc.invalidateQueries({ queryKey: ["polla-leaderboard"] });
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
    const n = v === "" ? null : Math.max(0, parseInt(v, 10) || 0);
    setDraft((d) =>
      d
        ? {
            ...d,
            group_k_matches: d.group_k_matches.map((m) => (m.id === id ? { ...m, [field]: n } : m)),
          }
        : d,
    );
  };

  return (
    <div className="space-y-8">
      <Card className="border-gold/30 bg-card p-5 card-shadow">
        <h2 className="font-display text-xl text-gold">{t("admin.t.res.repechajes")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("admin.t.res.repechajesHint")}</p>
        <div className="mt-3 space-y-3">
          {GROUP_KEYS.flatMap(
            (k) =>
              draft.groups[k].teams.map((team, i) => (team.po ? { k, i, team } : null)).filter(Boolean) as {
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

      <Card className="border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-xl">{t("admin.t.res.groups")}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GROUP_KEYS.map((k) => {
            const g = draft.groups[k];
            const opts = g.teams.map((team) => ({ id: team.id, label: team.nombre }));
            return (
              <div key={k} className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="font-display text-lg">{t("planilla.group.label", { k })}</p>
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
      </Card>

      <Card className="border-info/30 bg-card p-5 card-shadow">
        <h2 className="font-display text-xl text-info">{t("admin.t.res.markK")}</h2>
        <div className="mt-4 divide-y divide-border">
          {draft.group_k_matches.map((m) => {
            const lName = draft.groups.K.teams.find((t) => t.id === m.local)?.nombre ?? m.local;
            const vName =
              draft.groups.K.teams.find((t) => t.id === m.visitante)?.nombre ?? m.visitante;
            return (
              <div key={m.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 text-right text-sm">{lName}</span>
                <Input
                  type="number"
                  min={0}
                  value={m.gh ?? ""}
                  onChange={(e) => updateMatch(m.id, "gh", e.target.value)}
                  className="h-8 w-14 text-center"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="number"
                  min={0}
                  value={m.ga ?? ""}
                  onChange={(e) => updateMatch(m.id, "ga", e.target.value)}
                  className="h-8 w-14 text-center"
                />
                <span className="flex-1 text-sm">{vName}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="border-destructive/30 bg-card p-5 card-shadow">
        <h2 className="font-display text-xl text-destructive">{t("admin.t.res.especiales")}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">{t("admin.t.res.goleador")}</Label>
            <select
              value={draft.goleador_id ?? ""}
              onChange={(e) => setDraft({ ...draft, goleador_id: e.target.value || null })}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
            >
              <option value="">{t("admin.t.res.undefined")}</option>
              {draft.goleadores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.seleccion}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">{t("admin.t.res.arquero")}</Label>
            <select
              value={draft.arquero_id ?? ""}
              onChange={(e) => setDraft({ ...draft, arquero_id: e.target.value || null })}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
            >
              <option value="">{t("admin.t.res.undefined")}</option>
              {draft.arqueros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.seleccion}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-4 flex justify-center">
        <Button onClick={save} variant="hero" size="lg" className="shadow-2xl">
          <RefreshCw className="mr-2 size-4" /> {t("admin.t.res.save")}
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Listas (goleadores/arqueros) ---------------- */
export function ListasTab() {
  const t = useT();
  const qc = useQueryClient();
  const { data: ts } = useTournamentState();
  const [gols, setGols] = useState<SpecialPlayer[]>([]);
  const [arqs, setArqs] = useState<SpecialPlayer[]>([]);
  useEffect(() => {
    if (ts) {
      setGols(ts.goleadores);
      setArqs(ts.arqueros);
    }
  }, [ts]);

  if (!ts) return <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />;

  const save = async () => {
    const { error } = await supabase
      .from("tournament_state")
      .update({
        goleadores: gols as never,
        arqueros: arqs as never,
      })
      .eq("id", 1);
    if (error) toast.error(error.message);
    else {
      toast.success(t("admin.t.toast.listsSaved"));
      qc.invalidateQueries({ queryKey: ["tournament-state"] });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ListEditor title={t("admin.t.list.gol")} items={gols} setItems={setGols} />
      <ListEditor title={t("admin.t.list.arq")} items={arqs} setItems={setArqs} />
      <div className="lg:col-span-2 flex justify-center">
        <Button onClick={save} variant="hero">
          {t("admin.t.list.save")}
        </Button>
      </div>
    </div>
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

  useEffect(() => {
    if (ts) {
      setPhases({ ...DEFAULT_PHASES, ...(ts.phases ?? {}) });
      setExtras(ts.extra_matches ?? []);
      setGroupMatches(ts.group_k_matches ?? []);
      const v = (ts as unknown as { visibility?: Record<string, boolean> }).visibility ?? {};
      setVisibility({ ...DEFAULT_VISIBILITY, ...v });
    }
  }, [ts]);

  if (!ts) return <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />;

  const fases: Fase[] = ["dieciseisavos", "octavos", "cuartos", "semis", "tercero", "final"];
  const fasesEditables: Fase[] = ["grupos", ...fases];

  const save = async () => {
    const { error } = await supabase
      .from("tournament_state")
      .update({
        phases: phases as never,
        extra_matches: extras as never,
        group_k_matches: groupMatches as never,
        visibility: visibility as never,
      })
      .eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success(t("admin.t.toast.cronSaved"));
    qc.invalidateQueries({ queryKey: ["tournament-state"] });
  };

  const addMatch = (fase: Fase) => {
    if (fase === "grupos") {
      const id = `g-${Math.random().toString(36).slice(2, 8)}`;
      setGroupMatches((arr) => [
        ...arr,
        {
          id,
          fecha: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
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
        fecha: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
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
      <Card className="border-gold/30 bg-card p-5 card-shadow">
        <h2 className="font-display text-xl text-gold">{t("admin.t.cron.phasesTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("admin.t.cron.phasesHint")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["grupos", ...fases] as Fase[]).map((f) => {
            const active = !!phases[f];
            return (
              <button
                key={f}
                onClick={() => setPhases((p) => ({ ...p, [f]: !active }))}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-success/50 bg-success/15 text-success"
                    : "border-border bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {active ? "✅" : "⚪"} {FASE_LABEL[f]}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-xl">{t("admin.t.cron.visTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("admin.t.cron.visHint")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.keys(DEFAULT_VISIBILITY).map((k) => (
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

      {fasesEditables.map((fase) => (
        <Card key={fase} className="border-border bg-card p-5 card-shadow">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg">{FASE_LABEL[fase]}</h3>
            <Button size="sm" onClick={() => addMatch(fase)} variant="secondary">
              <Plus className="mr-1 size-4" /> {t("admin.t.cron.addMatch")}
            </Button>
          </div>
          {grouped(fase).length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">{t("admin.t.cron.empty")}</p>
          ) : (
            <div className="mt-3 space-y-3">
              {grouped(fase).map((m) => (
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
                      onChange={(e) => updateMatch(fase, m.id, { visitante: e.target.value })}
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
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] uppercase text-muted-foreground">
                        {t("admin.t.cron.scoreLabel")}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={m.gh ?? ""}
                        onChange={(e) =>
                          updateMatch(fase, m.id, {
                            gh: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                        className="h-9 w-16 text-center"
                      />
                      <span>–</span>
                      <Input
                        type="number"
                        min={0}
                        value={m.ga ?? ""}
                        onChange={(e) =>
                          updateMatch(fase, m.id, {
                            ga: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                        className="h-9 w-16 text-center"
                      />
                    </div>
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
        </Card>
      ))}

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

function ListEditor({
  title,
  items,
  setItems,
}: {
  title: string;
  items: SpecialPlayer[];
  setItems: (s: SpecialPlayer[]) => void;
}) {
  const [n, setN] = useState("");
  const [s, setS] = useState("");
  const add = () => {
    if (!n.trim()) return;
    const id =
      n
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 16) +
      "-" +
      Math.random().toString(36).slice(2, 6);
    setItems([...items, { id, nombre: n.trim(), seleccion: s.trim() }]);
    setN("");
    setS("");
  };
  return (
    <Card className="border-border bg-card p-5 card-shadow">
      <h2 className="font-display text-xl">{title}</h2>
      <ul className="mt-3 divide-y divide-border text-sm">
        {items.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2 py-1.5">
            <span className="flex-1">
              {p.nombre} <span className="text-xs text-muted-foreground">· {p.seleccion}</span>
            </span>
            <button
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              className="text-destructive hover:text-destructive/80"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
        <Input value={n} onChange={(e) => setN(e.target.value)} placeholder={tStatic("admin.t.list.namePh")} />
        <Input value={s} onChange={(e) => setS(e.target.value)} placeholder={tStatic("admin.t.list.selPh")} />
        <Button onClick={add} size="sm">
          <Plus className="size-4" />
        </Button>
      </div>
    </Card>
  );
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
      when && when.getTime() <= Date.now() ? t("admin.t.toast.locked") : t("admin.t.toast.unlocked"),
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
          ? t("admin.t.cloud.scheduled", { when: new Date(lockedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" }) })
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
