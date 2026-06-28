import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, CheckCircle2, Lock, MapPin, Calendar, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useTournamentState, useMyPick, useSavePick } from "@/hooks/usePolla";
import { useT } from "@/lib/i18n";
import { TeamWithFlag } from "@/components/TeamWithFlag";
import { getFlagCode } from "@/utils/countryFlags";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  GROUP_KEYS,
  groupKMatches,
  slotOptions,
  fmtFecha,
  composeSpecial,
  parseSpecial,
  isMatchLocked,
  isExtraPhaseLocked,
  teamNameByCode,
  isSectionVisible,
  lastGol,
  scoreState,
  groupHasDup,
  FASE_LABEL,
  type Fase,
  type ExtraMatch,
  type GroupKey,
  type PickGroups,
  type PickMatches,
  type VisibilityKey,
} from "@/lib/polla";

/** Compara dos mapas de marcadores ignorando el orden de claves (gh/ga, null-safe). */
function sameScoreMap(a?: PickMatches | null, b?: PickMatches | null): boolean {
  const aa = a ?? {};
  const bb = b ?? {};
  for (const k of new Set([...Object.keys(aa), ...Object.keys(bb)])) {
    if ((aa[k]?.gh ?? null) !== (bb[k]?.gh ?? null)) return false;
    if ((aa[k]?.ga ?? null) !== (bb[k]?.ga ?? null)) return false;
  }
  return true;
}

/** Compara dos mapas de grupos ignorando el orden de claves (pos1/pos2, null-safe). */
function sameGroupsMap(a?: PickGroups | null, b?: PickGroups | null): boolean {
  const aa = a ?? {};
  const bb = b ?? {};
  for (const k of new Set([...Object.keys(aa), ...Object.keys(bb)]) as Set<GroupKey>) {
    if ((aa[k]?.pos1 ?? null) !== (bb[k]?.pos1 ?? null)) return false;
    if ((aa[k]?.pos2 ?? null) !== (bb[k]?.pos2 ?? null)) return false;
  }
  return true;
}

/**
 * Editor de planilla reutilizable.
 *
 * - Usuario (modo normal): respeta TODOS los candados — cierre global (`picks_locked_at`),
 *   inmutabilidad de lo ya guardado y bloqueo por partido 24 h antes.
 * - Admin (`adminEdit`): se anulan todos los candados del cliente para poder corregir la
 *   planilla de cualquier participante aunque el tiempo esté bloqueado. El servidor lo
 *   permite vía RLS `picks_admin_all`, la exención de `picks_validate` y el bypass de
 *   `enforce_picks_deadline` (cierre global + por-partido) para el rol admin.
 */
export function PlanillaEditor({
  participantId,
  adminEdit = false,
  participantName,
  onSaved,
}: {
  participantId: string;
  adminEdit?: boolean;
  participantName?: string;
  onSaved?: () => void;
}) {
  const t = useT();
  const { data: ts, isLoading: tsLoading } = useTournamentState();
  const { data: pick, isLoading: pickLoading } = useMyPick(participantId);
  const save = useSavePick(participantId);

  const [groups, setGroups] = useState<PickGroups>({});
  const [matches, setMatches] = useState<PickMatches>({});
  const [extra, setExtra] = useState<PickMatches>({});
  const [golNombre, setGolNombre] = useState("");
  const [golSel, setGolSel] = useState("");
  const [arqNombre, setArqNombre] = useState("");
  const [arqSel, setArqSel] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (initialized) return;
    if (pick) {
      setGroups(pick.groups ?? {});
      setMatches(pick.group_k_matches ?? {});
      setExtra(pick.extra_matches ?? {});
      const g = parseSpecial(pick.goleador_id);
      setGolNombre(g.nombre);
      setGolSel(g.seleccion);
      const a = parseSpecial(pick.arquero_id);
      setArqNombre(a.nombre);
      setArqSel(a.seleccion);
      setInitialized(true);
    } else if (!pickLoading && ts) {
      setInitialized(true);
    }
  }, [pick, pickLoading, ts, initialized]);

  // Cierre GLOBAL solo si el admin lo activa explícitamente (tournament_state.picks_locked_at).
  // En modo admin no aplica ningún cierre.
  const lockAt = useMemo(() => {
    const fromDb = ts?.picks_locked_at ? new Date(ts.picks_locked_at) : null;
    return fromDb && !isNaN(fromDb.getTime()) ? fromDb : null;
  }, [ts?.picks_locked_at]);
  const locked = useMemo(
    () => (adminEdit ? false : lockAt ? Date.now() > lockAt.getTime() : false),
    [lockAt, adminEdit],
  );

  // Bloqueo por campo: lo que ya está guardado en servidor no se puede modificar.
  // En modo admin estos candados se anulan (el admin puede sobrescribir).
  const savedGroups = pick?.groups ?? {};
  const savedMatches = pick?.group_k_matches ?? {};
  const savedExtra = pick?.extra_matches ?? {};
  const isPosLocked = (k: GroupKey, f: "pos1" | "pos2") => !adminEdit && !!savedGroups[k]?.[f];
  const isMatchFieldLocked = (id: string, f: "gh" | "ga") =>
    !adminEdit && savedMatches[id]?.[f] != null;
  const isExtraFieldLocked = (id: string, f: "gh" | "ga") =>
    !adminEdit && savedExtra[id]?.[f] != null;
  const goleadorLocked = !adminEdit && !!(pick?.goleador_id && pick.goleador_id.trim() !== "");
  const arqueroLocked = !adminEdit && !!(pick?.arquero_id && pick.arquero_id.trim() !== "");
  // Bloqueo por partido (24 h antes): se ignora en modo admin.
  const matchLockedFn = (fecha: string) => !adminEdit && isMatchLocked(fecha);

  if (tsLoading || pickLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!ts) return null;

  const isVisible = (k: VisibilityKey) => isSectionVisible(ts.visibility, k);
  const extraMatches: ExtraMatch[] = ts.extra_matches ?? [];
  const phaseOrder: Fase[] = [
    "grupos",
    "dieciseisavos",
    "octavos",
    "cuartos",
    "semis",
    "tercero",
    "final",
  ];
  const matchesByPhase = phaseOrder
    .filter((f) => isVisible(f))
    .map((f) => ({ fase: f, list: extraMatches.filter((m) => m.fase === f) }))
    .filter((p) => p.list.length > 0);

  /* Reglamento: en 1ª ronda se predicen marcadores SOLO de los partidos del Grupo de Colombia (Grupo K). */
  const grupoKMatches = groupKMatches(ts);

  const completedGroups = GROUP_KEYS.filter(
    (k) => groups[k]?.pos1 && groups[k]?.pos2 && groups[k]?.pos1 !== groups[k]?.pos2,
  ).length;
  const completedMatches = grupoKMatches.filter((m) => {
    const p = matches[m.id];
    return p && p.gh != null && p.ga != null;
  }).length;
  const completedExtra = extraMatches.filter((m) => {
    const p = extra[m.id];
    return p && p.gh != null && p.ga != null;
  }).length;
  const completedEsp = (golNombre.trim() ? 1 : 0) + (arqNombre.trim() ? 1 : 0);

  // Pendientes por pronosticar entre lo que el admin tiene HABILITADO (visible) y aún
  // no está cerrado por 24h: si hay, mostramos el panel "actualizar y guardar planilla".
  const filled = (p?: { gh: number | null; ga: number | null }) =>
    p && p.gh != null && p.ga != null;
  const pendientes =
    (isVisible("grupos")
      ? GROUP_KEYS.filter((k) => ts.groups[k] && (!groups[k]?.pos1 || !groups[k]?.pos2)).length +
        grupoKMatches.filter((m) => !matchLockedFn(m.fecha) && !filled(matches[m.id])).length
      : 0) +
    matchesByPhase.reduce(
      (acc, { list }) =>
        acc + list.filter((m) => !matchLockedFn(m.fecha) && !filled(extra[m.id])).length,
      0,
    ) +
    (isVisible("goleador") && !golNombre.trim() ? 1 : 0) +
    (isVisible("arquero") && !arqNombre.trim() ? 1 : 0);

  /** Valida la planilla antes de guardar. Devuelve lista de errores legibles. */
  const validate = (): string[] => {
    const errors: string[] = [];
    // 1) Grupos: 1º y 2º no pueden repetirse.
    const dup: string[] = [];
    GROUP_KEYS.forEach((k) => {
      if (!ts.groups[k]) return;
      if (groupHasDup(groups[k])) dup.push(k);
    });
    if (dup.length) errors.push(t("planilla.toast.dupGroups", { groups: dup.join(", ") }));

    // 2) Marcadores: deben ser de un solo dígito (0–9) y con AMBOS campos llenos.
    const badMatches: string[] = [];
    grupoKMatches.forEach((m) => {
      if (scoreState(matches[m.id]) === "invalido") badMatches.push(`${m.local}–${m.visitante}`);
    });
    extraMatches.forEach((m) => {
      if (scoreState(extra[m.id]) === "invalido") badMatches.push(`${m.local}–${m.visitante}`);
    });
    if (badMatches.length)
      errors.push(t("planilla.toast.invalidScore", { matches: badMatches.join(", ") }));

    return errors;
  };

  /** ¿El formulario está idéntico a lo ya guardado? (usuario que no tiene nada nuevo que guardar) */
  const noChanges = pick
    ? sameGroupsMap(groups, pick.groups) &&
      sameScoreMap(matches, pick.group_k_matches) &&
      sameScoreMap(extra, pick.extra_matches) &&
      (composeSpecial(golNombre, golSel) ?? "") === (pick.goleador_id ?? "").trim() &&
      (composeSpecial(arqNombre, arqSel) ?? "") === (pick.arquero_id ?? "").trim()
    : false;

  const tryOpenConfirm = () => {
    if (locked) {
      toast.error(t("planilla.toast.closed"));
      return;
    }
    // Sin cambios (planilla ya guardada y/o todo bloqueado): no se intenta guardar,
    // se muestra un aviso en verde en vez de un error.
    if (!adminEdit && noChanges) {
      toast.success(t("planilla.toast.alreadySaved"));
      return;
    }
    const errors = validate();
    if (errors.length) {
      toast.error(errors.join(" · "), { duration: 6000 });
      return;
    }
    setConfirmOpen(true);
  };

  const submit = async () => {
    if (locked) {
      toast.error(t("planilla.toast.closed"));
      return;
    }
    const errors = validate();
    if (errors.length) {
      toast.error(errors.join(" · "), { duration: 6000 });
      setConfirmOpen(false);
      return;
    }
    try {
      await save.mutateAsync({
        groups,
        group_k_matches: matches,
        extra_matches: extra,
        goleador_id: composeSpecial(golNombre, golSel),
        arquero_id: composeSpecial(arqNombre, arqSel),
      });
      toast.success(adminEdit ? t("admin.t.edit.saved") : t("planilla.toast.saved"));
      setConfirmOpen(false);
      onSaved?.();
    } catch (e) {
      toast.error(
        t("planilla.toast.saveFailed", { err: e instanceof Error ? e.message : "error" }),
      );
    }
  };

  const setGroup = (k: GroupKey, field: "pos1" | "pos2", v: string) => {
    setGroups((g) => ({
      ...g,
      [k]: { pos1: g[k]?.pos1 ?? null, pos2: g[k]?.pos2 ?? null, [field]: v || null },
    }));
  };
  const setMatch = (id: string, field: "gh" | "ga", v: string) => {
    const n = lastGol(v);
    setMatches((m) => ({
      ...m,
      [id]: { gh: m[id]?.gh ?? null, ga: m[id]?.ga ?? null, [field]: n },
    }));
  };
  const setExtraScore = (id: string, field: "gh" | "ga", v: string) => {
    const n = lastGol(v);
    setExtra((m) => ({
      ...m,
      [id]: { gh: m[id]?.gh ?? null, ga: m[id]?.ga ?? null, [field]: n },
    }));
  };

  return (
    <div>
      {adminEdit ? (
        <Card className="border-gold/40 bg-gold/10 p-4 card-shadow">
          <p className="text-sm text-foreground">
            <Lock className="inline size-4 mr-1.5 text-gold" />
            {t("admin.t.edit.banner", { name: participantName ?? "" })}
          </p>
        </Card>
      ) : (
        <>
          <div className="bandera-stripe-h h-1 w-16 rounded-sm" aria-hidden />
          <h1 className="mt-3 font-display text-3xl sm:text-4xl">{t("planilla.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("planilla.subtitle")}</p>
        </>
      )}

      {locked && (
        <Card className="mt-4 border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <Lock className="inline size-4 mr-1" /> {t("planilla.closedBanner")}
        </Card>
      )}

      {!locked && !adminEdit && pendientes > 0 && (
        <Card className="mt-4 border-gold/40 bg-gold/10 p-4 card-shadow">
          <p className="text-sm text-foreground">
            <Save className="inline size-4 mr-1.5 text-gold" />
            {t("planilla.updatePrompt", { n: pendientes })}
          </p>
        </Card>
      )}

      {/* Bloque 0: Especiales (goleador / arquero) — texto libre */}
      {(isVisible("goleador") || isVisible("arquero")) && (
        <Collapsible defaultOpen className="mt-8 group/esp">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-left transition-colors hover:bg-destructive/10">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-lg sm:text-xl text-destructive uppercase tracking-wide">
                {t("planilla.esp.title")}
              </h2>
              <span className="rounded-full border border-destructive/40 bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                {completedEsp}/2
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {t("planilla.esp.progress", { done: completedEsp })}
              </span>
              <ChevronDown className="size-4 text-destructive transition-transform group-data-[state=closed]/esp:rotate-[-90deg]" />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=closed]:hidden">
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {isVisible("goleador") && (
                <Card className="border-border bg-card p-5 card-shadow">
                  <Label className="text-xs uppercase text-muted-foreground">
                    {t("planilla.esp.goleador")}
                  </Label>
                  <div className="mt-2 space-y-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        {t("planilla.esp.nameLabel")}
                      </Label>
                      <Input
                        disabled={locked || goleadorLocked}
                        value={golNombre}
                        onChange={(e) => setGolNombre(e.target.value)}
                        placeholder={t("planilla.esp.namePh")}
                        maxLength={60}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        {t("planilla.esp.selLabel")}
                      </Label>
                      <Input
                        disabled={locked || goleadorLocked}
                        value={golSel}
                        onChange={(e) => setGolSel(e.target.value)}
                        placeholder={t("planilla.esp.selPh")}
                        maxLength={40}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </Card>
              )}
              {isVisible("arquero") && (
                <Card className="border-border bg-card p-5 card-shadow">
                  <Label className="text-xs uppercase text-muted-foreground">
                    {t("planilla.esp.arquero")}
                  </Label>
                  <div className="mt-2 space-y-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        {t("planilla.esp.nameLabel")}
                      </Label>
                      <Input
                        disabled={locked || arqueroLocked}
                        value={arqNombre}
                        onChange={(e) => setArqNombre(e.target.value)}
                        placeholder={t("planilla.esp.namePh")}
                        maxLength={60}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        {t("planilla.esp.selLabel")}
                      </Label>
                      <Input
                        disabled={locked || arqueroLocked}
                        value={arqSel}
                        onChange={(e) => setArqSel(e.target.value)}
                        placeholder={t("planilla.esp.selPh")}
                        maxLength={40}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Bloque 1: Grupos */}
      {isVisible("grupos") && (
        <Collapsible defaultOpen className="mt-8 group/sec">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 text-left transition-colors hover:bg-gold/10">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-lg sm:text-xl text-gold uppercase tracking-wide">
                {t("planilla.groups.title")}
              </h2>
              <span className="rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
                2 clasifican
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {t("planilla.groups.progress", { done: completedGroups })}
              </span>
              <ChevronDown className="size-4 text-gold transition-transform group-data-[state=closed]/sec:rotate-[-90deg]" />
            </div>
          </CollapsibleTrigger>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            Elige los <strong className="text-foreground/80">dos primeros clasificados</strong> de
            cada grupo. Los terceros, a la mierda.
          </p>
          <CollapsibleContent className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 data-[state=closed]:hidden">
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
                    <h3 className="font-display text-xl">
                      {t("planilla.group.label", { k: key })}
                    </h3>
                    {complete && <CheckCircle2 className="size-4 text-gold" />}
                  </div>
                  <ul className="mt-2 mb-3 space-y-0.5 text-xs text-muted-foreground">
                    {g.teams.map((team) => (
                      <li key={team.id} className="flex items-center gap-1.5">
                        <span>{team.po ? "🟡" : "·"}</span>
                        <TeamWithFlag
                          teamName={team.nombre}
                          flagCode={getFlagCode(team.nombre)}
                          size="sm"
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-[11px] uppercase text-muted-foreground">
                        {t("planilla.group.pos1")}
                      </Label>
                      <select
                        disabled={locked || isPosLocked(key, "pos1")}
                        value={sel.pos1 ?? ""}
                        onChange={(e) => setGroup(key, "pos1", e.target.value)}
                        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                      >
                        <option value="">—</option>
                        {opts.map((o) => (
                          <option key={o.id} value={o.id} disabled={sel.pos2 === o.id}>
                            {o.label}
                            {o.isCandidate ? ` ${t("planilla.group.candidate")}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-[11px] uppercase text-muted-foreground">
                        {t("planilla.group.pos2")}
                      </Label>
                      <select
                        disabled={locked || isPosLocked(key, "pos2")}
                        value={sel.pos2 ?? ""}
                        onChange={(e) => setGroup(key, "pos2", e.target.value)}
                        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                      >
                        <option value="">—</option>
                        {opts.map((o) => (
                          <option key={o.id} value={o.id} disabled={sel.pos1 === o.id}>
                            {o.label}
                            {o.isCandidate ? ` ${t("planilla.group.candidate")}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {sel.pos1 && sel.pos2 && sel.pos1 === sel.pos2 && (
                    <p className="mt-2 text-[11px] font-medium text-destructive">
                      1º y 2º no pueden ser el mismo equipo.
                    </p>
                  )}
                </Card>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Bloque 2: Grupo K */}
      {isVisible("grupos") && (
        <Collapsible defaultOpen className="mt-6 group/seck">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-left transition-colors hover:bg-info/10">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-lg sm:text-xl text-info uppercase tracking-wide">
                {t("planilla.k.title")}
              </h2>
              <span className="rounded-full border border-info/40 bg-info/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info">
                {grupoKMatches.length} partidos
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {t("planilla.k.progress", { done: completedMatches })}
              </span>
              <ChevronDown className="size-4 text-info transition-transform group-data-[state=closed]/seck:rotate-[-90deg]" />
            </div>
          </CollapsibleTrigger>
          <p className="mt-2 px-1 text-xs text-muted-foreground">{t("planilla.k.hint")}</p>
          <CollapsibleContent className="data-[state=closed]:hidden">
            <Card className="mt-3 border-border bg-card card-shadow divide-y divide-border">
              {grupoKMatches.map((m) => {
                const lTeam = ts.groups.K.teams.find((team) => team.id === m.local);
                const vTeam = ts.groups.K.teams.find((team) => team.id === m.visitante);
                const lName = lTeam?.nombre ?? m.local;
                const vName = vTeam?.nombre ?? m.visitante;
                const colombia = m.local === "COL" || m.visitante === "COL";
                const p = matches[m.id] ?? { gh: null, ga: null };
                const matchLocked = matchLockedFn(m.fecha);
                const ghDisabled = locked || matchLocked || isMatchFieldLocked(m.id, "gh");
                const gaDisabled = locked || matchLocked || isMatchFieldLocked(m.id, "ga");
                const [stadium, city] = m.sede.split(" · ");
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
                        <MapPin className="size-3" />
                        <span className="text-foreground/80">{stadium}</span>
                        {city && <span className="text-muted-foreground">· {city}</span>}
                      </span>
                      {matchLocked && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                          <Lock className="size-3" /> {t("planilla.k.blocked")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-2 sm:shrink-0">
                      <div className="flex w-[160px] justify-end">
                        <TeamWithFlag
                          teamName={lName}
                          flagCode={getFlagCode(lName)}
                          size="sm"
                          className="truncate justify-end text-right"
                        />
                      </div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]"
                        disabled={ghDisabled}
                        value={p.gh ?? ""}
                        onChange={(e) => setMatch(m.id, "gh", e.target.value)}
                        className="h-9 w-14 text-center"
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]"
                        disabled={gaDisabled}
                        value={p.ga ?? ""}
                        onChange={(e) => setMatch(m.id, "ga", e.target.value)}
                        className="h-9 w-14 text-center"
                      />
                      <div className="flex w-[160px] justify-start">
                        <TeamWithFlag
                          teamName={vName}
                          flagCode={getFlagCode(vName)}
                          size="sm"
                          className="truncate"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Bloques dinámicos: fases eliminatorias */}
      {matchesByPhase.map(({ fase, list }) => {
        const done = list.filter((m) => {
          const p = extra[m.id];
          return p && p.gh != null && p.ga != null;
        }).length;
        // Eliminatorias: la RONDA completa se cierra 1 h antes de su primer partido
        // (no candado por-partido). El admin lo salta.
        const phaseLocked = adminEdit ? false : isExtraPhaseLocked(extraMatches, fase);
        return (
          <Collapsible key={fase} defaultOpen={false} className="mt-10 group/phase">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-left transition-colors hover:bg-info/10">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-lg sm:text-xl text-info uppercase tracking-wide">
                  {FASE_LABEL[fase]}
                </h2>
                <span className="rounded-full border border-info/40 bg-info/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info">
                  {list.length} partidos
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {t("planilla.extra.progress", { done, total: list.length })}
                </span>
                <ChevronDown className="size-4 text-info transition-transform group-data-[state=closed]/phase:rotate-[-90deg]" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=closed]:hidden">
              <Card className="mt-4 border-border bg-card card-shadow divide-y divide-border">
                {list.map((m) => {
                  const p = extra[m.id] ?? { gh: null, ga: null };
                  const lName = teamNameByCode(ts.groups, m.local);
                  const vName = teamNameByCode(ts.groups, m.visitante);
                  const ghDisabled = locked || phaseLocked || isExtraFieldLocked(m.id, "gh");
                  const gaDisabled = locked || phaseLocked || isExtraFieldLocked(m.id, "ga");
                  const [stadium, city] = m.sede.split(" · ");
                  return (
                    <div
                      key={m.id}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:max-w-[45%]">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="size-3" /> {fmtFecha(m.fecha)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3" />
                          <span className="text-foreground/80">{stadium}</span>
                          {city && <span className="text-muted-foreground">· {city}</span>}
                        </span>
                        {phaseLocked && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                            <Lock className="size-3" /> {t("planilla.extra.roundClosed")}
                          </span>
                        )}
                      </div>
                      <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:shrink-0">
                        <div className="flex min-w-0 flex-1 justify-center sm:w-[180px] sm:flex-none">
                          <TeamWithFlag
                            teamName={lName}
                            flagCode={getFlagCode(lName)}
                            size="sm"
                            wrap
                            className="min-w-0 justify-center text-center"
                          />
                        </div>
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]"
                          disabled={ghDisabled}
                          value={p.gh ?? ""}
                          onChange={(e) => setExtraScore(m.id, "gh", e.target.value)}
                          className="h-9 w-14 shrink-0 text-center"
                        />
                        <span className="text-muted-foreground">–</span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]"
                          disabled={gaDisabled}
                          value={p.ga ?? ""}
                          onChange={(e) => setExtraScore(m.id, "ga", e.target.value)}
                          className="h-9 w-14 shrink-0 text-center"
                        />
                        <div className="flex min-w-0 flex-1 justify-center sm:w-[180px] sm:flex-none">
                          <TeamWithFlag
                            teamName={vName}
                            flagCode={getFlagCode(vName)}
                            size="sm"
                            wrap
                            className="min-w-0 justify-center text-center"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      <div className="sticky bottom-4 mt-10 flex justify-center px-4">
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Button
            onClick={tryOpenConfirm}
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
            {adminEdit ? t("admin.t.edit.cta") : t("planilla.updateCta")}
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("planilla.confirm.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("planilla.confirm.desc", {
                  groups: completedGroups,
                  matches: completedMatches,
                  extras: completedExtra,
                  esp: completedEsp,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={submit} disabled={save.isPending}>
                {t("planilla.confirm.cta")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
