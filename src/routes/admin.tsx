import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  ClipboardList,
  ListPlus,
  RefreshCw,
  Trash2,
  Plus,
  AlertTriangle,
  FileSpreadsheet,
  Database,
  Lock,
  Unlock,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useTournamentState } from "@/hooks/usePolla";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  POLLA,
  fmtCOP,
  GROUP_KEYS,
  slotOptions,
  FASE_LABEL,
  type ExtraMatch,
  type Fase,
  type Phases,
  type SpecialPlayer,
  type TournamentState,
} from "@/lib/polla";
import { DownloadButton } from "@/components/DownloadButton";
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
import { Cloud, CloudUpload, Download } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · LA GILIPOLLA 2026" }] }),
  component: AdminPage,
});

type Tab = "pagos" | "resultados" | "cronograma" | "listas" | "reportes";

function AdminPage() {
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("pagos");

  if (loading)
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  if (!user || !isAdmin) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card className="border-destructive/40 bg-destructive/5 p-8 text-center card-shadow">
          <div className="text-4xl">🚫</div>
          <h1 className="mt-3 font-display text-3xl">403</h1>
          <p className="mt-2 text-sm text-muted-foreground">Solo el admin del bar.</p>
          <Button className="mt-6" onClick={() => router.navigate({ to: "/" })}>
            Volver al inicio
          </Button>
        </Card>
      </main>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: "pagos", label: "Pagos", icon: Users },
    { key: "resultados", label: "Resultados", icon: ClipboardList },
    { key: "cronograma", label: "Cronograma", icon: ClipboardList },
    { key: "listas", label: "Listas", icon: ListPlus },
    { key: "reportes", label: "Reportes", icon: FileSpreadsheet },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="bandera-stripe-h h-1 w-16 rounded-sm" aria-hidden />
      <h1 className="mt-3 font-display text-4xl">🛠️ Admin · LA GILIPOLLA</h1>

      <div className="mt-6 flex gap-2 overflow-x-auto">
        {tabs.map((tt) => (
          <button
            key={tt.key}
            onClick={() => setTab(tt.key)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              tab === tt.key
                ? "border-gold bg-gold/15 text-gold"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <tt.icon className="size-4" /> {tt.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "pagos" && <PagosTab />}
        {tab === "resultados" && <ResultadosTab />}
        {tab === "cronograma" && <CronogramaTab />}
        {tab === "listas" && <ListasTab />}
        {tab === "reportes" && <ReportesTab />}
      </div>
    </main>
  );
}

/* ---------------- Pagos ---------------- */
function PagosTab() {
  const qc = useQueryClient();
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
      toast.success("Actualizado");
      qc.invalidateQueries({ queryKey: ["admin-participants"] });
      qc.invalidateQueries({ queryKey: ["polla-leaderboard"] });
    }
  };

  const eliminarParticipante = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar a "${nombre}"? Se borrarán también su planilla y comprobantes. Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("participants").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Participante eliminado");
      qc.invalidateQueries({ queryKey: ["admin-participants"] });
      qc.invalidateQueries({ queryKey: ["polla-leaderboard"] });
    }
  };

  const counts = {
    pendiente: parts.filter((p) => p.estado_pago === "pendiente").length,
    aprobado: parts.filter((p) => p.estado_pago === "aprobado").length,
    rechazado: parts.filter((p) => p.estado_pago === "rechazado").length,
  };
  const recaudado = counts.aprobado * POLLA.cuotaCOP;

  if (isLoading) return <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />;

  return (
    <div>
      <Card className="mb-4 border-border bg-card p-4 text-sm card-shadow">
        <span className="text-gold">🟡 {counts.pendiente} pendientes</span>
        <span className="mx-2 text-muted-foreground">·</span>
        <span className="text-success">✅ {counts.aprobado} aprobados</span>
        <span className="mx-2 text-muted-foreground">·</span>
        <span className="text-gold">{fmtCOP(recaudado)} COP recaudados</span>
      </Card>
      <Card className="overflow-x-auto border-border bg-card card-shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="p-3">Nombre</th>
              <th className="p-3">Estado</th>
              <th className="p-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.id} className="border-b border-border/60">
                <td className="p-3 font-medium">
                  {p.nombre}
                  <br />
                  <span className="text-xs text-muted-foreground">{p.email}</span>
                </td>
                <td className="p-3">
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
                <td className="p-3 text-right space-x-1">
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
                    title="Mover a la papelera (eliminar)"
                    onClick={() => eliminarParticipante(p.id, p.nombre)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {parts.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-muted-foreground">
                  Sin inscritos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ---------------- Resultados ---------------- */
function ResultadosTab() {
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
    toast.success("Resultados guardados. Recalculando puntos…");
    const { error: e2 } = await supabase.rpc("recalc_all_picks");
    if (e2) toast.error("Guardado pero no se pudo recalcular: " + e2.message);
    else toast.success("Puntos recalculados");
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
        <h2 className="font-display text-xl text-gold">Repechajes</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Cuando se resuelva un repechaje, edita el nombre del equipo "Ganador Repechaje X".
        </p>
        <div className="mt-3 space-y-3">
          {GROUP_KEYS.flatMap(
            (k) =>
              draft.groups[k].teams.map((t, i) => (t.po ? { k, i, t } : null)).filter(Boolean) as {
                k: (typeof GROUP_KEYS)[number];
                i: number;
                t: (typeof draft.groups)[(typeof GROUP_KEYS)[number]]["teams"][number];
              }[],
          ).map(({ k, i, t }) => (
            <div key={`${k}-${i}`} className="flex items-center gap-2 text-sm">
              <span className="w-20 font-display">Grupo {k}</span>
              <span className="w-20 text-xs text-muted-foreground">{t.po}</span>
              <Input
                value={t.nombre}
                onChange={(e) => updateTeam(k, i, e.target.value)}
                className="h-8"
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-xl">Resultados de grupos · 1° y 2°</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GROUP_KEYS.map((k) => {
            const g = draft.groups[k];
            const opts = g.teams.map((t) => ({ id: t.id, label: t.nombre }));
            return (
              <div key={k} className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="font-display text-lg">Grupo {k}</p>
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
        <h2 className="font-display text-xl text-info">Marcadores Grupo K</h2>
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
        <h2 className="font-display text-xl text-destructive">Especiales (resultado oficial)</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Goleador</Label>
            <select
              value={draft.goleador_id ?? ""}
              onChange={(e) => setDraft({ ...draft, goleador_id: e.target.value || null })}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
            >
              <option value="">— Sin definir —</option>
              {draft.goleadores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.seleccion}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Mejor arquero</Label>
            <select
              value={draft.arquero_id ?? ""}
              onChange={(e) => setDraft({ ...draft, arquero_id: e.target.value || null })}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
            >
              <option value="">— Sin definir —</option>
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
          <RefreshCw className="mr-2 size-4" /> Guardar y recalcular puntos
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Listas (goleadores/arqueros) ---------------- */
function ListasTab() {
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
      toast.success("Listas guardadas");
      qc.invalidateQueries({ queryKey: ["tournament-state"] });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ListEditor title="⚽ Goleadores" items={gols} setItems={setGols} />
      <ListEditor title="🧤 Arqueros" items={arqs} setItems={setArqs} />
      <div className="lg:col-span-2 flex justify-center">
        <Button onClick={save} variant="hero">
          Guardar listas
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Cronograma (fases + extra_matches) ---------------- */
const DEFAULT_PHASES: Phases = {
  grupos: true,
  octavos: false,
  cuartos: false,
  semis: false,
  tercero: false,
  final: false,
};

function CronogramaTab() {
  const qc = useQueryClient();
  const { data: ts } = useTournamentState();
  const [phases, setPhases] = useState<Phases>(DEFAULT_PHASES);
  const [extras, setExtras] = useState<ExtraMatch[]>([]);

  useEffect(() => {
    if (ts) {
      setPhases({ ...DEFAULT_PHASES, ...(ts.phases ?? {}) });
      setExtras(ts.extra_matches ?? []);
    }
  }, [ts]);

  if (!ts) return <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />;

  const fases: Fase[] = ["octavos", "cuartos", "semis", "tercero", "final"];

  const save = async () => {
    const { error } = await supabase
      .from("tournament_state")
      .update({
        phases: phases as never,
        extra_matches: extras as never,
      })
      .eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Cronograma guardado");
    qc.invalidateQueries({ queryKey: ["tournament-state"] });
  };

  const addMatch = (fase: Fase) => {
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

  const updateMatch = (id: string, patch: Partial<ExtraMatch>) => {
    setExtras((arr) => arr.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };
  const removeMatch = (id: string) => setExtras((arr) => arr.filter((m) => m.id !== id));

  const grouped = (fase: Fase) => extras.filter((m) => m.fase === fase);

  return (
    <div className="space-y-6">
      <Card className="border-gold/30 bg-card p-5 card-shadow">
        <h2 className="font-display text-xl text-gold">Activar fases del torneo</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Activa cada fase solo cuando ya conozcas los equipos. Las puntuaciones ya calculadas no se
          ven afectadas.
        </p>
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

      {fases.map((fase) => (
        <Card key={fase} className="border-border bg-card p-5 card-shadow">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg">{FASE_LABEL[fase]}</h3>
            <Button size="sm" onClick={() => addMatch(fase)} variant="secondary">
              <Plus className="mr-1 size-4" /> Agregar partido
            </Button>
          </div>
          {grouped(fase).length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Sin partidos. Cuando se definan los cruces, agrégalos aquí.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {grouped(fase).map((m) => (
                <div
                  key={m.id}
                  className="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
                >
                  <div className="space-y-2">
                    <Input
                      placeholder="Local (ej: 1A o Colombia)"
                      value={m.local}
                      onChange={(e) => updateMatch(m.id, { local: e.target.value })}
                    />
                    <Input
                      placeholder="Visitante (ej: 2B o España)"
                      value={m.visitante}
                      onChange={(e) => updateMatch(m.id, { visitante: e.target.value })}
                    />
                    <Input
                      placeholder="Sede"
                      value={m.sede}
                      onChange={(e) => updateMatch(m.id, { sede: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-[11px] uppercase text-muted-foreground">
                        Fecha y hora (COT)
                      </Label>
                      <Input
                        type="datetime-local"
                        value={toLocalInput(m.fecha)}
                        onChange={(e) =>
                          updateMatch(m.id, { fecha: fromLocalInput(e.target.value) })
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] uppercase text-muted-foreground">
                        Marcador
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={m.gh ?? ""}
                        onChange={(e) =>
                          updateMatch(m.id, {
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
                          updateMatch(m.id, {
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
                    onClick={() => removeMatch(m.id)}
                    title="Eliminar partido"
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
          <RefreshCw className="mr-2 size-4" /> Guardar cronograma
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
        <Input value={n} onChange={(e) => setN(e.target.value)} placeholder="Nombre" />
        <Input value={s} onChange={(e) => setS(e.target.value)} placeholder="Selección" />
        <Button onClick={add} size="sm">
          <Plus className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

/* ---------------- Reportes ---------------- */
function ReportesTab() {
  return (
    <div className="space-y-6">
      <DeadlineLockCard />
      <Card className="border-info/30 bg-card p-6 card-shadow">
        <h2 className="font-display text-xl text-info">📊 Reportes Excel</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Descarga reportes operativos en formato .xlsx.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <DownloadButton
            fn={generateLeaderboardXlsx}
            label="Leaderboard"
            icon={<FileSpreadsheet className="mr-2 size-4" />}
          />
          <DownloadButton
            fn={generateParticipantesXlsx}
            label="Participantes y pagos"
            icon={<FileSpreadsheet className="mr-2 size-4" />}
          />
        </div>
      </Card>
      <Card className="border-gold/30 bg-card p-6 card-shadow">
        <h2 className="font-display text-xl text-gold">💾 Backup completo</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Descarga un Excel con todas las tablas (participants, picks, tournament_state, user_roles,
          admin_audit). Guárdalo en un lugar seguro como respaldo o para recuperación de desastres.
        </p>
        <div className="mt-4">
          <DownloadButton
            fn={generateBackupXlsx}
            label="Descargar backup completo"
            variant="hero"
            icon={<Database className="mr-2 size-4" />}
          />
        </div>
      </Card>
      <CloudBackupCard />
    </div>
  );
}

function DeadlineLockCard() {
  // see below
  return <DeadlineLockCardImpl />;
}

function CloudBackupCard() {
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
    const tid = toast.loading("Creando respaldo en la nube…");
    try {
      const r = await runUpload();
      toast.success(`Respaldo creado: ${r.filename}`, { id: tid });
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
    if (!confirm(`¿Eliminar respaldo ${path}?`)) return;
    try {
      await runDelete({ data: { path } });
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["backups-list"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <Card className="border-info/30 bg-card p-6 card-shadow">
      <h2 className="font-display text-xl text-info flex items-center gap-2">
        <Cloud className="size-5" /> Respaldos en la nube
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Genera un respaldo .xlsx y guárdalo en el bucket privado <code>backups</code>. Solo el
        admin puede ver, descargar o eliminar estos archivos.
      </p>
      <div className="mt-4">
        <Button onClick={createBackup} disabled={busy} variant="hero">
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <CloudUpload className="mr-2 size-4" />
          )}
          Crear respaldo ahora
        </Button>
      </div>
      <div className="mt-6">
        <h3 className="text-sm font-medium text-muted-foreground">Historial</h3>
        {isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Cargando…</p>
        ) : !files || files.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aún no hay respaldos.</p>
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
  const qc = useQueryClient();
  const { data: ts } = useTournamentState();
  const lockedAt = ts?.picks_locked_at ?? undefined;
  const isLocked = !!lockedAt && new Date(lockedAt).getTime() <= Date.now();
  const [busy, setBusy] = useState(false);

  const setLock = async (when: Date | null) => {
    if (
      !confirm(
        when && when.getTime() <= Date.now()
          ? "¿Cerrar planillas ahora? Los usuarios no podrán editar."
          : "¿Reabrir planillas?",
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
      when && when.getTime() <= Date.now() ? "Planillas cerradas" : "Planillas reabiertas",
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
        {isLocked ? "Planillas cerradas" : "Planillas abiertas"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {lockedAt
          ? `Cierre programado: ${new Date(lockedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })} COT`
          : "Sin fecha de cierre configurada"}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {isLocked ? (
          <Button variant="hero" disabled={busy} onClick={() => setLock(null)}>
            <Unlock className="mr-2 size-4" />
            Reabrir planillas
          </Button>
        ) : (
          <Button variant="destructive" disabled={busy} onClick={() => setLock(new Date())}>
            <Lock className="mr-2 size-4" />
            Cerrar planillas ahora
          </Button>
        )}
      </div>
    </Card>
  );
}
