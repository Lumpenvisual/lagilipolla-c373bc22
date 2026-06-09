import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { Loader2, Save, CheckCircle2, Lock, MapPin, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTournamentState, useMyPick, useSavePick } from "@/hooks/usePolla";
import { useT } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  POLLA,
  GROUP_KEYS,
  slotOptions,
  fmtFecha,
  isMatchLocked,
  FASE_LABEL,
  type Fase,
  type ExtraMatch,
  type GroupKey,
  type PickGroups,
  type PickMatches,
} from "@/lib/polla";

export const Route = createFileRoute("/planilla")({
  head: () => ({
    meta: [
      { title: "Planilla · LA GILIPOLLA 2026" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Planilla,
});

function Planilla() {
  const router = useRouter();
  const t = useT();
  const { user, participant, loading } = useAuth();
  const { data: ts, isLoading: tsLoading } = useTournamentState();
  const { data: pick, isLoading: pickLoading } = useMyPick(participant?.id);
  const save = useSavePick(participant?.id);

  const [groups, setGroups] = useState<PickGroups>({});
  const [matches, setMatches] = useState<PickMatches>({});
  const [extra, setExtra] = useState<PickMatches>({});
  const [goleador, setGoleador] = useState<string | null>(null);
  const [arquero, setArquero] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (initialized) return;
    if (pick) {
      setGroups(pick.groups ?? {});
      setMatches(pick.group_k_matches ?? {});
      setExtra(pick.extra_matches ?? {});
      setGoleador(pick.goleador_id);
      setArquero(pick.arquero_id);
      setInitialized(true);
    } else if (!pickLoading && ts) {
      setInitialized(true);
    }
  }, [pick, pickLoading, ts, initialized]);

  const locked = useMemo(() => Date.now() > POLLA.deadline.getTime(), []);

  if (loading || tsLoading || pickLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (!user) {
    router.navigate({ to: "/login" });
    return null;
  }
  if (!participant || participant.estado_pago !== "aprobado") {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card className="border-gold/40 bg-gold/5 p-8 text-center card-shadow">
          <p className="text-sm text-muted-foreground">{t("planilla.notApproved")}</p>
          <Button className="mt-4" asChild>
            <Link to="/dashboard">{t("planilla.goAccount")}</Link>
          </Button>
        </Card>
      </main>
    );
  }
  if (!ts) return null;

  const visibility = ((ts as unknown as { visibility?: Record<string, boolean> }).visibility) ?? {};
  const isVisible = (k: string) => visibility[k] !== false;
  const extraMatches: ExtraMatch[] = (ts.extra_matches ?? []) as ExtraMatch[];
  const phaseOrder: Fase[] = ["octavos", "cuartos", "semis", "tercero", "final"];
  const matchesByPhase = phaseOrder
    .filter((f) => isVisible(f))
    .map((f) => ({ fase: f, list: extraMatches.filter((m) => m.fase === f) }))
    .filter((p) => p.list.length > 0);

  const completedGroups = GROUP_KEYS.filter(
    (k) => groups[k]?.pos1 && groups[k]?.pos2 && groups[k]?.pos1 !== groups[k]?.pos2,
  ).length;
  const completedMatches = ts.group_k_matches.filter((m) => {
    const p = matches[m.id];
    return p && p.gh != null && p.ga != null;
  }).length;
  const completedExtra = extraMatches.filter((m) => {
    const p = extra[m.id];
    return p && p.gh != null && p.ga != null;
  }).length;
  const completedEsp = (goleador ? 1 : 0) + (arquero ? 1 : 0);

  const submit = async () => {
    if (locked) {
      toast.error(t("planilla.toast.closed"));
      return;
    }
    try {
      await save.mutateAsync({
        groups,
        group_k_matches: matches,
        extra_matches: extra,
        goleador_id: goleador,
        arquero_id: arquero,
      });
      toast.success(t("planilla.toast.saved"));
      setConfirmOpen(false);
    } catch (e) {
      toast.error(t("planilla.toast.saveFailed", { err: e instanceof Error ? e.message : "error" }));
    }
  };

  const setGroup = (k: GroupKey, field: "pos1" | "pos2", v: string) => {
    setGroups((g) => ({
      ...g,
      [k]: { pos1: g[k]?.pos1 ?? null, pos2: g[k]?.pos2 ?? null, [field]: v || null },
    }));
  };
  const setMatch = (id: string, field: "gh" | "ga", v: string) => {
    const n = v === "" ? null : Math.max(0, Math.min(20, parseInt(v, 10) || 0));
    setMatches((m) => ({
      ...m,
      [id]: { gh: m[id]?.gh ?? null, ga: m[id]?.ga ?? null, [field]: n },
    }));
  };
  const setExtraScore = (id: string, field: "gh" | "ga", v: string) => {
    const n = v === "" ? null : Math.max(0, Math.min(20, parseInt(v, 10) || 0));
    setExtra((m) => ({
      ...m,
      [id]: { gh: m[id]?.gh ?? null, ga: m[id]?.ga ?? null, [field]: n },
    }));
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <div className="bandera-stripe-h h-1 w-16 rounded-sm" aria-hidden />
      <h1 className="mt-3 font-display text-3xl sm:text-4xl">{t("planilla.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("planilla.subtitle")}</p>

      {locked && (
        <Card className="mt-4 border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <Lock className="inline size-4 mr-1" /> {t("planilla.closedBanner")}
        </Card>
      )}

      {/* Bloque 1: Grupos */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl sm:text-2xl text-gold">{t("planilla.groups.title")}</h2>
          <span className="text-xs text-muted-foreground">{t("planilla.groups.progress", { done: completedGroups })}</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GROUP_KEYS.map((key) => {
            const g = ts.groups[key];
            if (!g) return null;
            const opts = g.teams.flatMap(slotOptions);
            const sel = groups[key] ?? { pos1: null, pos2: null };
            const complete = sel.pos1 && sel.pos2 && sel.pos1 !== sel.pos2;
            return (
              <Card
                key={key}
                className={`border-border bg-card p-4 card-shadow ${complete ? "ring-1 ring-gold/40" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl">{t("planilla.group.label", { k: key })}</h3>
                  {complete && <CheckCircle2 className="size-4 text-gold" />}
                </div>
                <ul className="mt-2 mb-3 space-y-0.5 text-xs text-muted-foreground">
                  {g.teams.map((t) => (
                    <li key={t.id}>
                      {t.po ? "🟡 " : "· "}
                      {t.nombre}
                    </li>
                  ))}
                </ul>
                <div className="space-y-2">
                  <div>
                    <Label className="text-[11px] uppercase text-muted-foreground">{t("planilla.group.pos1")}</Label>
                    <select
                      disabled={locked}
                      value={sel.pos1 ?? ""}
                      onChange={(e) => setGroup(key, "pos1", e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {opts.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                          {o.isCandidate ? ` ${t("planilla.group.candidate")}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase text-muted-foreground">{t("planilla.group.pos2")}</Label>
                    <select
                      disabled={locked}
                      value={sel.pos2 ?? ""}
                      onChange={(e) => setGroup(key, "pos2", e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {opts.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                          {o.isCandidate ? ` ${t("planilla.group.candidate")}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Bloque 2: Grupo K */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl sm:text-2xl text-info">{t("planilla.k.title")}</h2>
          <span className="text-xs text-muted-foreground">{t("planilla.k.progress", { done: completedMatches })}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("planilla.k.hint")}</p>
        <Card className="mt-4 border-border bg-card card-shadow divide-y divide-border">
          {ts.group_k_matches.map((m) => {
            const lTeam = ts.groups.K.teams.find((t) => t.id === m.local);
            const vTeam = ts.groups.K.teams.find((t) => t.id === m.visitante);
            const lName = lTeam?.nombre ?? m.local;
            const vName = vTeam?.nombre ?? m.visitante;
            const colombia = m.local === "COL" || m.visitante === "COL";
            const p = matches[m.id] ?? { gh: null, ga: null };
            const matchLocked = isMatchLocked(m.fecha);
            const disabled = locked || matchLocked;
            return (
              <div
                key={m.id}
                className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${colombia ? "bg-gold/5" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:max-w-[45%]">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3" /> {fmtFecha(m.fecha)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3" /> {m.sede}
                  </span>
                  {matchLocked && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                      <Lock className="size-3" /> {t("planilla.k.blocked")}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-center gap-2 sm:shrink-0">
                  <span className="flex-1 truncate text-right text-sm font-medium sm:max-w-[120px]">{lName}</span>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    disabled={disabled}
                    value={p.gh ?? ""}
                    onChange={(e) => setMatch(m.id, "gh", e.target.value)}
                    className="h-9 w-14 text-center"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    disabled={disabled}
                    value={p.ga ?? ""}
                    onChange={(e) => setMatch(m.id, "ga", e.target.value)}
                    className="h-9 w-14 text-center"
                  />
                  <span className="flex-1 truncate text-sm font-medium sm:max-w-[120px]">{vName}</span>
                </div>
              </div>
            );
          })}
        </Card>
      </section>

      {/* Bloque 3: Especiales */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl sm:text-2xl text-destructive">{t("planilla.esp.title")}</h2>
          <span className="text-xs text-muted-foreground">{t("planilla.esp.progress", { done: completedEsp })}</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="border-border bg-card p-5 card-shadow">
            <Label className="text-xs uppercase text-muted-foreground">{t("planilla.esp.goleador")}</Label>
            <select
              disabled={locked}
              value={goleador ?? ""}
              onChange={(e) => setGoleador(e.target.value || null)}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{t("planilla.esp.select")}</option>
              {ts.goleadores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.seleccion}
                </option>
              ))}
            </select>
          </Card>
          <Card className="border-border bg-card p-5 card-shadow">
            <Label className="text-xs uppercase text-muted-foreground">{t("planilla.esp.arquero")}</Label>
            <select
              disabled={locked}
              value={arquero ?? ""}
              onChange={(e) => setArquero(e.target.value || null)}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{t("planilla.esp.select")}</option>
              {ts.arqueros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.seleccion}
                </option>
              ))}
            </select>
          </Card>
        </div>
      </section>

      <div className="sticky bottom-4 mt-10 flex justify-center px-4">
        <Button
          onClick={submit}
          disabled={locked || save.isPending}
          variant="hero"
          size="lg"
          className="h-12 w-full max-w-sm px-6 text-sm uppercase tracking-wider shadow-2xl sm:w-auto sm:px-10 sm:text-base"
        >
          {save.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          {t("planilla.save")}
        </Button>
      </div>
    </main>
  );
}
