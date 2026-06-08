import { useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  ClipboardList,
  Wallet,
  Eye,
  Trophy,
  Sparkles,
  Trash2,
  FlaskConical,
  Terminal,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMatches } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { flag } from "@/lib/flags";
import { formatET, isLocked, formatCAD } from "@/lib/format";
import { calculatePrizes, MEDALS } from "@/lib/prizes";
import { ENTRY_FEE, TOTAL_MATCHES } from "@/lib/constants";
import { useConcursosOverview } from "@/hooks/useConcursos";
import { MODALIDAD_LABEL, ESTADO_META, PAGO_META, type EstadoConcurso, type Modalidad } from "@/lib/concursos";
import { useT, tStatic, type TFunc } from "@/lib/i18n";

type Participant = Tables<"participants">;

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: tStatic("admin.meta.title") }] }),
  component: AdminPage,
});

type Section = "inscripciones" | "resultados" | "resumen" | "concursos" | "demo";

function AdminPage() {
  const t = useT();
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();
  const [section, setSection] = useState<Section>("concursos");

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md items-center px-4">
        <Card className="w-full border-destructive/40 bg-destructive/5 p-8 text-center card-shadow">
          <div className="text-4xl">🚫</div>
          <h1 className="mt-3 font-display text-3xl tracking-wide">403</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("admin.403")}</p>
          <Button className="mt-6" onClick={() => router.navigate({ to: "/" })}>
            {t("admin.backHome")}
          </Button>
        </Card>
      </main>
    );
  }

  const nav: { key: Section; label: string; icon: typeof Users }[] = [
    { key: "concursos", label: t("admin.nav.concursos"), icon: Trophy },
    { key: "inscripciones", label: t("admin.nav.inscripciones"), icon: Users },
    { key: "resultados", label: t("admin.nav.resultados"), icon: ClipboardList },
    { key: "resumen", label: t("admin.nav.resumen"), icon: Wallet },
    { key: "demo", label: t("admin.nav.demo"), icon: FlaskConical },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-4xl tracking-wide">{t("admin.title")}</h1>
      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-56 lg:shrink-0">
          <div className="flex gap-2 overflow-x-auto lg:flex-col">
            {nav.map((n) => (
              <button
                key={n.key}
                onClick={() => setSection(n.key)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  section === n.key
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <n.icon className="size-4" /> {n.label}
              </button>
            ))}
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          {section === "concursos" && <ConcursosAdmin />}
          {section === "inscripciones" && <Inscripciones />}
          {section === "resultados" && <Resultados />}
          {section === "resumen" && <Resumen onGoToInscripciones={() => setSection("inscripciones")} />}
          {section === "demo" && <DemoConsole />}
        </div>
      </div>
    </main>
  );
}

/* ---------------- Section A: Inscripciones ---------------- */

function useParticipants() {
  return useQuery({
    queryKey: ["admin-participants"],
    queryFn: async (): Promise<Participant[]> => {
      const { data, error } = await supabase
        .from("participants")
        .select("*")
        .order("inscripcion_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-gold/15 text-gold border-gold/40",
  aprobado: "bg-primary/15 text-primary border-primary/40",
  rechazado: "bg-destructive/15 text-destructive border-destructive/40",
};
const ESTADO_EMOJI: Record<string, string> = { pendiente: "🟡", aprobado: "✅", rechazado: "❌" };

function Inscripciones() {
  const t = useT();
  const qc = useQueryClient();
  const { data: parts = [], isLoading } = useParticipants();
  const [filter, setFilter] = useState<"todos" | "pendiente" | "aprobado" | "rechazado">("todos");

  const [confirm, setConfirm] = useState<{ p: Participant; estado: "aprobado" | "rechazado" } | null>(null);
  const [detail, setDetail] = useState<Participant | null>(null);

  const counts = {
    pendiente: parts.filter((p) => p.estado_pago === "pendiente").length,
    aprobado: parts.filter((p) => p.estado_pago === "aprobado").length,
  };
  const recaudado = counts.aprobado * ENTRY_FEE;

  const filtered = parts.filter((p) => filter === "todos" || p.estado_pago === filter);

  const apply = async () => {
    if (!confirm) return;
    const { error } = await supabase
      .from("participants")
      .update({ estado_pago: confirm.estado })
      .eq("id", confirm.p.id);
    if (error) {
      toast.error(t("admin.ins.updateError"));
    } else {
      toast.success(confirm.estado === "aprobado" ? t("admin.ins.approvedToast") : t("admin.ins.rejectedToast"));
      qc.invalidateQueries({ queryKey: ["admin-participants"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    }
    setConfirm(null);
  };

  const tabs: { key: typeof filter; label: string }[] = [
    { key: "todos", label: t("admin.ins.tab.todos") },
    { key: "pendiente", label: t("admin.ins.tab.pendientes") },
    { key: "aprobado", label: t("admin.ins.tab.aprobados") },
    { key: "rechazado", label: t("admin.ins.tab.rechazados") },
  ];

  return (
    <div>
      <Card className="mb-4 border-border bg-card p-4 text-sm card-shadow">
        <span className="text-gold">{t("admin.ins.pending", { n: counts.pendiente })}</span>
        <span className="mx-2 text-muted-foreground">·</span>
        <span className="text-primary">{t("admin.ins.approved", { n: counts.aprobado })}</span>
        <span className="mx-2 text-muted-foreground">·</span>
        <span className="text-foreground">{t("admin.ins.collected", { amount: formatCAD(recaudado) })}</span>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.key
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card className="overflow-x-auto border-border bg-card card-shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">{t("admin.ins.col.alias")}</th>
                <th className="p-3">{t("admin.ins.col.estado")}</th>
                <th className="p-3 text-right">{t("admin.ins.col.acciones")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="p-3 font-medium">{p.nombre}</td>
                  <td className="p-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${ESTADO_BADGE[p.estado_pago]}`}>
                      {ESTADO_EMOJI[p.estado_pago]} {t(`admin.ins.estado.${p.estado_pago}`)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setDetail(p)}>
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        variant="hero"
                        size="sm"
                        disabled={p.estado_pago === "aprobado"}
                        onClick={() => setConfirm({ p, estado: "aprobado" })}
                      >
                        ✅
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={p.estado_pago === "rechazado"}
                        onClick={() => setConfirm({ p, estado: "rechazado" })}
                      >
                        ❌
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-muted-foreground">
                    {t("admin.ins.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* Confirm dialog */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.estado === "aprobado" ? t("admin.confirm.approveTitle") : t("admin.confirm.rejectTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.estado === "aprobado"
                ? t("admin.confirm.approveBody", { name: confirm?.p.nombre ?? "" })
                : t("admin.confirm.rejectBody", { name: confirm?.p.nombre ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>{t("common.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Drill-down: participant detail */}
      <ParticipantDetailDialog participant={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

/* ---------------- Participant drill-down ---------------- */

type DetailRow = {
  match_id: number;
  numero_partido: number;
  jornada: number;
  equipo_local: string;
  equipo_visitante: string;
  grupo: string;
  kickoff_time: string;
  goles_local: number | null;
  goles_visitante: number | null;
  goles_local_pred: number | null;
  goles_visitante_pred: number | null;
  puntos_obtenidos: number | null;
};

const PTS_BADGE: Record<number, string> = {
  3: "bg-primary/15 text-primary border-primary/40",
  1: "bg-success/10 text-success border-success/30",
  0: "bg-destructive/15 text-destructive border-destructive/40",
};

function ParticipantDetailDialog({
  participant,
  onClose,
}: {
  participant: Participant | null;
  onClose: () => void;
}) {
  const t = useT();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["participant-detail", participant?.id],
    enabled: !!participant,
    queryFn: async (): Promise<DetailRow[]> => {
      const { data, error } = await supabase.rpc("get_participant_predictions", {
        _participant_id: participant!.id,
      });
      if (error) throw error;
      return (data ?? []) as DetailRow[];
    },
  });

  const predichos = rows.filter(
    (r) => r.goles_local_pred != null && r.goles_visitante_pred != null,
  ).length;
  const totalPuntos = rows.reduce((s, r) => s + (r.puntos_obtenidos ?? 0), 0);
  const exactos = rows.filter((r) => (r.puntos_obtenidos ?? 0) === 3).length;

  const notApproved = participant && participant.estado_pago !== "aprobado";

  return (
    <Dialog open={!!participant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-card sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            {participant?.nombre}
          </DialogTitle>
          <DialogDescription>
            {t("admin.detail.summary", { pred: predichos, pts: totalPuntos, exact: exactos })}
          </DialogDescription>
        </DialogHeader>

        {notApproved ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("admin.detail.notApproved")}
          </p>
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-2">#</th>
                <th className="p-2">{t("admin.detail.col.partido")}</th>
                <th className="p-2 text-center">{t("admin.detail.col.pronostico")}</th>
                <th className="p-2 text-center">{t("admin.detail.col.resultado")}</th>
                <th className="p-2 text-right">{t("common.pts")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const hasPred = r.goles_local_pred != null && r.goles_visitante_pred != null;
                const hasResult = r.goles_local != null && r.goles_visitante != null;
                return (
                  <tr key={r.match_id} className="border-b border-border/60">
                    <td className="p-2 text-muted-foreground">{r.numero_partido}</td>
                    <td className="p-2">
                      {flag(r.equipo_local)} {r.equipo_local} {t("common.vs")} {r.equipo_visitante} {flag(r.equipo_visitante)}
                    </td>
                    <td className="p-2 text-center font-medium">
                      {hasPred ? `${r.goles_local_pred} — ${r.goles_visitante_pred}` : "—"}
                    </td>
                    <td className="p-2 text-center text-muted-foreground">
                      {hasResult ? `${r.goles_local} — ${r.goles_visitante}` : "—"}
                    </td>
                    <td className="p-2 text-right">
                      {hasResult && hasPred ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${PTS_BADGE[r.puntos_obtenidos ?? 0]}`}
                        >
                          {r.puntos_obtenidos ?? 0}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    {t("admin.detail.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Section B: Resultados ---------------- */

function Resultados() {
  const t = useT();
  const qc = useQueryClient();
  const { data: matches = [], isLoading } = useMatches();
  const [jornada, setJornada] = useState(1);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const list = matches.filter((m) => m.jornada === jornada);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {[1, 2, 3].map((j) => (
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
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((m) => (
          <ResultCard
            key={m.id}
            match={m}
            t={t}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["matches"] });
              qc.invalidateQueries({ queryKey: ["leaderboard"] });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ResultCard({ match, onSaved, t }: { match: Tables<"matches">; onSaved: () => void; t: TFunc }) {
  const started = isLocked(match.kickoff_time);
  const [gl, setGl] = useState(match.goles_local?.toString() ?? "");
  const [gv, setGv] = useState(match.goles_visitante?.toString() ?? "");
  const [editing, setEditing] = useState(match.goles_local == null);
  const [saving, setSaving] = useState(false);
  const hasResult = match.goles_local != null && match.goles_visitante != null;

  const save = async () => {
    if (!started) {
      toast.warning(t("admin.res.notStartedWarn"));
      return;
    }
    const l = Number(gl);
    const v = Number(gv);
    if (gl === "" || gv === "" || Number.isNaN(l) || Number.isNaN(v)) {
      toast.error(t("admin.res.bothScores"));
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("matches")
      .update({ goles_local: l, goles_visitante: v })
      .eq("id", match.id);
    if (error) {
      toast.error(t("admin.res.saveError"));
      setSaving(false);
      return;
    }
    const { count } = await supabase
      .from("predictions")
      .select("*", { count: "exact", head: true })
      .eq("match_id", match.id)
      .not("goles_local_pred", "is", null);
    toast.success(t("admin.res.savedToast", { n: count ?? 0 }));
    setEditing(false);
    setSaving(false);
    onSaved();
  };

  return (
    <Card className="border-border bg-card p-4 card-shadow">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("admin.res.matchInfo", { n: match.numero_partido, g: match.grupo })}</span>
        {!started && <span className="text-gold">{t("admin.res.notStarted")}</span>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">📍 {match.estadio} · 🕐 {formatET(match.kickoff_time)}</p>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="text-right text-sm font-medium">{flag(match.equipo_local)} {match.equipo_local}</span>
        {hasResult && !editing ? (
          <span className="text-center font-display text-2xl text-gold">
            {match.goles_local} — {match.goles_visitante}
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <Input type="number" min={0} max={20} value={gl} disabled={!started}
              onChange={(e) => setGl(e.target.value)} className="h-11 w-11 px-0 text-center font-display text-xl" />
            <span className="text-muted-foreground">—</span>
            <Input type="number" min={0} max={20} value={gv} disabled={!started}
              onChange={(e) => setGv(e.target.value)} className="h-11 w-11 px-0 text-center font-display text-xl" />
          </div>
        )}
        <span className="text-left text-sm font-medium">{match.equipo_visitante} {flag(match.equipo_visitante)}</span>
      </div>
      <div className="mt-3 flex justify-center">
        {hasResult && !editing ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>{t("admin.res.edit")}</Button>
        ) : (
          <Button variant="hero" size="sm" disabled={!started || saving} onClick={save}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {t("admin.res.save")}
          </Button>
        )}
      </div>
    </Card>
  );
}

/* ---------------- Section C: Resumen ---------------- */

function Resumen({ onGoToInscripciones }: { onGoToInscripciones: () => void }) {
  const t = useT();
  const { data: parts = [] } = useParticipants();
  const { data: matches = [] } = useMatches();
  const { data: leaderboard = [] } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_leaderboard");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        participant_id: r.participant_id,
        nombre: r.nombre,
        total_puntos: Number(r.total_puntos),
        exactos: Number(r.exactos),
        ganadores: Number(r.ganadores),
        posicion: Number(r.posicion),
      }));
    },
  });

  const aprobados = parts.filter((p) => p.estado_pago === "aprobado").length;
  const pendientes = parts.filter((p) => p.estado_pago === "pendiente").length;
  const pot = aprobados * ENTRY_FEE;
  const jugados = matches.filter((m) => m.goles_local != null && m.goles_visitante != null).length;
  const prizes = useMemo(() => calculatePrizes(leaderboard, pot), [leaderboard, pot]);

  const cards = [
    { label: t("admin.sum.approved"), value: aprobados },
    { label: t("admin.sum.pot"), value: formatCAD(pot), gold: true },
    { label: t("admin.sum.pendingApprove"), value: pendientes, action: true },
    { label: t("admin.sum.played"), value: `${jugados} / ${TOTAL_MATCHES}` },
    { label: t("admin.sum.remaining"), value: TOTAL_MATCHES - jugados },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <Card key={i} className="border-border bg-card p-5 card-shadow">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</p>
            <p className={`mt-2 font-display text-3xl ${c.gold ? "text-gold" : "text-foreground"}`}>{c.value}</p>
            {c.action && pendientes > 0 && (
              <Button variant="ghost" size="sm" className="mt-1 px-0" onClick={onGoToInscripciones}>
                {t("admin.sum.review")}
              </Button>
            )}
          </Card>
        ))}
      </div>

      <Card className="border-gold/30 bg-card p-5 card-shadow">
        <h2 className="font-display text-xl tracking-wide">{t("admin.sum.prizeTitle")}</h2>
        {leaderboard.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.sum.noApproved")}</p>
        ) : (
          <div className="mt-4 divide-y divide-border">
            {leaderboard
              .filter((r) => (prizes[r.participant_id] ?? 0) > 0)
              .map((r) => (
                <div key={r.participant_id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {MEDALS[r.posicion] ?? `${r.posicion}°`} {r.nombre}
                  </span>
                  <span className="text-gold">{formatCAD(prizes[r.participant_id] ?? 0)}</span>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Section D: Concursos ---------------- */

const ESTADOS_OPC: EstadoConcurso[] = ["proximo", "abierto", "cerrado", "finalizado"];

function ConcursosAdmin() {
  const t = useT();
  const qc = useQueryClient();
  const { data: concursos = [], isLoading } = useConcursosOverview();
  const [generating, setGenerating] = useState(false);
  const [manage, setManage] = useState<{ id: string; nombre: string } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["concursos-overview"] });

  const generate = async (includePartidos: boolean) => {
    setGenerating(true);
    const { data, error } = await supabase.rpc("generate_concursos", {
      _include_partidos: includePartidos,
    });
    setGenerating(false);
    if (error) {
      toast.error(t("admin.con.genError"));
      return;
    }
    toast.success(t("admin.con.genToast", { n: data ?? 0 }));
    refresh();
  };

  const updateField = async (id: string, fields: { estado?: string; cuota?: number }, msg?: string) => {
    const { error } = await supabase.from("concursos").update(fields).eq("id", id);
    if (error) {
      toast.error(t("admin.con.updateError"));
      return;
    }
    if (msg) toast.success(msg);
    refresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("concursos").delete().eq("id", id);
    if (error) {
      toast.error(t("admin.con.removeError"));
      return;
    }
    toast.success(t("admin.con.removeToast"));
    refresh();
  };

  return (
    <div>
      <Card className="mb-4 border-gold/30 bg-card p-4 card-shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg tracking-wide">{t("admin.con.autoTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("admin.con.autoDesc")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="hero" size="sm" disabled={generating} onClick={() => generate(false)}>
              {generating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {t("admin.con.generate")}
            </Button>
            <Button variant="secondary" size="sm" disabled={generating} onClick={() => generate(true)}>
              {t("admin.con.includePartidos")}
            </Button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : concursos.length === 0 ? (
        <Card className="border-border bg-card p-8 text-center text-sm text-muted-foreground card-shadow">
          {t("admin.con.empty")}
        </Card>
      ) : (
        <Card className="overflow-x-auto border-border bg-card card-shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">{t("admin.con.col.concurso")}</th>
                <th className="p-3">{t("admin.con.col.modalidad")}</th>
                <th className="p-3 text-center">{t("admin.con.col.jug")}</th>
                <th className="p-3 text-right">{t("admin.con.col.cuota")}</th>
                <th className="p-3 text-right">{t("admin.con.col.pozo")}</th>
                <th className="p-3">{t("admin.con.col.estado")}</th>
                <th className="p-3 text-right">{t("admin.con.col.acciones")}</th>
              </tr>
            </thead>
            <tbody>
              {concursos.map((c) => (
                <tr key={c.id} className="border-b border-border/60">
                  <td className="p-3 font-medium">{c.nombre}</td>
                  <td className="p-3 text-muted-foreground">{t(MODALIDAD_LABEL[c.modalidad as Modalidad])}</td>
                  <td className="p-3 text-center">{c.jugadores}</td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      min={0}
                      defaultValue={c.cuota}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v) && v !== c.cuota) updateField(c.id, { cuota: v }, t("admin.con.cuotaToast"));
                      }}
                      className="h-8 w-16 rounded-md border border-border bg-background px-2 text-right"
                    />
                  </td>
                  <td className="p-3 text-right text-gold">{formatCAD(c.cuota * c.jugadores)}</td>
                  <td className="p-3">
                    <select
                      value={c.estado}
                      onChange={(e) => updateField(c.id, { estado: e.target.value })}
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                    >
                      {ESTADOS_OPC.map((s) => (
                        <option key={s} value={s}>
                          {t(ESTADO_META[s].labelKey)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setManage({ id: c.id, nombre: c.nombre })}>
                        <Users className="size-4" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => remove(c.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <ManageInscripcionesDialog
        concurso={manage}
        onClose={() => setManage(null)}
        onChanged={refresh}
      />
    </div>
  );
}

type InscripcionRow = {
  id: string;
  estado_pago: string;
  participant_id: string;
  participants: { nombre: string } | null;
};

function ManageInscripcionesDialog({
  concurso,
  onClose,
  onChanged,
}: {
  concurso: { id: string; nombre: string } | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-inscripciones", concurso?.id],
    enabled: !!concurso,
    queryFn: async (): Promise<InscripcionRow[]> => {
      const { data, error } = await supabase
        .from("inscripciones")
        .select("id, estado_pago, participant_id, participants(nombre)")
        .eq("concurso_id", concurso!.id)
        .order("joined_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InscripcionRow[];
    },
  });

  const setEstado = async (id: string, estado_pago: string) => {
    const { error } = await supabase.from("inscripciones").update({ estado_pago }).eq("id", id);
    if (error) {
      toast.error(t("admin.con.manageError"));
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-inscripciones", concurso?.id] });
    onChanged();
  };

  return (
    <Dialog open={!!concurso} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto border-border bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">{concurso?.nombre}</DialogTitle>
          <DialogDescription>{t("admin.con.manageDesc")}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("admin.con.manageEmpty")}</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.participants?.nombre ?? "—"}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${PAGO_META[r.estado_pago as keyof typeof PAGO_META].cls}`}>
                    {PAGO_META[r.estado_pago as keyof typeof PAGO_META].emoji} {t(PAGO_META[r.estado_pago as keyof typeof PAGO_META].labelKey)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="hero"
                    size="sm"
                    disabled={r.estado_pago === "aprobado"}
                    onClick={() => setEstado(r.id, "aprobado")}
                  >
                    ✅
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={r.estado_pago === "rechazado"}
                    onClick={() => setEstado(r.id, "rechazado")}
                  >
                    ❌
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Section E: Demo console ---------------- */

type LogLine = { time: string; level: "info" | "ok" | "error"; text: string };

function DemoConsole() {
  const t = useT();
  const qc = useQueryClient();
  const [players, setPlayers] = useState(8);
  const [resultPct, setResultPct] = useState(60);
  const [includePartidos, setIncludePartidos] = useState(true);
  const [running, setRunning] = useState<"seed" | "reset" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);

  const push = (level: LogLine["level"], text: string) =>
    setLog((prev) => [...prev, { time: new Date().toLocaleTimeString(), level, text }]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["concursos-overview"] });
    qc.invalidateQueries({ queryKey: ["admin-participants"] });
    qc.invalidateQueries({ queryKey: ["leaderboard"] });
    qc.invalidateQueries({ queryKey: ["matches"] });
  };

  const summarize = (data: Record<string, unknown>) => {
    const parts: string[] = [];
    if (data.players != null) parts.push(`${data.players} ${t("admin.demo.outPlayers")}`);
    if (data.enrollments != null) parts.push(`${data.enrollments} ${t("admin.demo.outEnrollments")}`);
    if (data.predictions != null) parts.push(`${data.predictions} ${t("admin.demo.outPredictions")}`);
    if (data.results != null) parts.push(`${data.results} ${t("admin.demo.outResults")}`);
    if (data.contests_created != null) parts.push(`${data.contests_created} ${t("admin.demo.outContests")}`);
    return parts.join("  ·  ");
  };

  const runSeed = async () => {
    setRunning("seed");
    push("info", `${t("admin.demo.runSeed")} → players=${players}, result%=${resultPct}, partidos=${includePartidos}`);
    const { data, error } = await supabase.rpc("seed_demo_data", {
      _players: players,
      _result_pct: resultPct,
      _include_partidos: includePartidos,
    });
    setRunning(null);
    if (error) {
      push("error", error.message);
      toast.error(t("admin.demo.error"));
      return;
    }
    push("ok", summarize((data ?? {}) as Record<string, unknown>));
    toast.success(summarize((data ?? {}) as Record<string, unknown>));
    invalidateAll();
  };

  const runReset = async () => {
    setConfirmReset(false);
    setRunning("reset");
    push("info", t("admin.demo.runReset"));
    const { data, error } = await supabase.rpc("reset_demo_data");
    setRunning(null);
    if (error) {
      push("error", error.message);
      toast.error(t("admin.demo.error"));
      return;
    }
    push("ok", summarize((data ?? {}) as Record<string, unknown>));
    toast.success(summarize((data ?? {}) as Record<string, unknown>));
    invalidateAll();
  };

  const lineColor: Record<LogLine["level"], string> = {
    info: "text-muted-foreground",
    ok: "text-primary",
    error: "text-destructive",
  };

  return (
    <div className="space-y-4">
      <Card className="border-gold/30 bg-card p-5 card-shadow">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 size-5 text-gold" />
          <div>
            <h2 className="font-display text-xl tracking-wide">{t("admin.demo.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("admin.demo.desc")}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Parameters */}
        <Card className="border-border bg-card p-5 card-shadow">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("admin.demo.paramsTitle")}
          </h3>

          <div className="mt-4 space-y-5">
            <div>
              <div className="flex items-center justify-between text-sm">
                <label className="font-medium">{t("admin.demo.players")}</label>
                <span className="font-display text-lg text-gold">{players}</span>
              </div>
              <Slider
                className="mt-2"
                min={1}
                max={20}
                step={1}
                value={[players]}
                onValueChange={(v) => setPlayers(v[0])}
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-sm">
                <label className="font-medium">{t("admin.demo.resultPct")}</label>
                <span className="font-display text-lg text-gold">{resultPct}%</span>
              </div>
              <Slider
                className="mt-2"
                min={0}
                max={100}
                step={5}
                value={[resultPct]}
                onValueChange={(v) => setResultPct(v[0])}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t("admin.demo.includePartidos")}</label>
              <Switch checked={includePartidos} onCheckedChange={setIncludePartidos} />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="hero" size="sm" disabled={running !== null} onClick={runSeed}>
              {running === "seed" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {running === "seed" ? t("admin.demo.seeding") : t("admin.demo.seed")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={running !== null}
              onClick={() => setConfirmReset(true)}
            >
              {running === "reset" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              {running === "reset" ? t("admin.demo.resetting") : t("admin.demo.reset")}
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">⚠️ {t("admin.demo.warn")}</p>
        </Card>

        {/* Console output */}
        <Card className="flex flex-col border-border bg-[oklch(0.18_0.01_260)] p-0 card-shadow">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <Terminal className="size-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("admin.demo.console")}
            </span>
          </div>
          <div className="min-h-[220px] flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
            {log.length === 0 ? (
              <p className="text-muted-foreground">{t("admin.demo.logEmpty")}</p>
            ) : (
              log.map((l, i) => (
                <div key={i} className="whitespace-pre-wrap break-words">
                  <span className="text-muted-foreground">[{l.time}]</span>{" "}
                  <span className={lineColor[l.level]}>{l.text}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.demo.resetTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.demo.resetBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={runReset}>{t("common.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
