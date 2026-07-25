import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTournamentState } from "@/hooks/usePolla";
import { supabase } from "@/integrations/supabase/client";
import {
  GROUP_KEYS,
  FASE_LABEL,
  isSectionVisible,
  groupPts,
  matchPts,
  especialMatches,
  teamNameByCode,
  isExtraPhaseRevealed,
  type ExtraMatch,
  type Fase,
  type GroupKey,
  type VisibilityKey,
} from "@/lib/polla";

type PublicPick = {
  participant_id: string;
  nombre: string;
  groups?: Record<string, { pos1: string | null; pos2: string | null }>;
  group_k_matches?: Record<string, { gh: number | null; ga: number | null }>;
  extra_matches: Record<string, { gh: number | null; ga: number | null }>;
  goleador_id?: string | null;
  arquero_id?: string | null;
  updated_at: string | null;
};

/** Badge rojo con el puntaje que equivale a un resultado según el reglamento.
 *  Solo se muestra cuando existe el resultado oficial. */
function PtsBadge({ pts }: { pts: number }) {
  return (
    <span className="ml-2 shrink-0 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
      +{pts} pts
    </span>
  );
}

/**
 * Detalle expandible de la planilla de un participante — compartido entre la tabla de la
 * polla principal (todas las fases + grupos + especiales) y la de La Revancha (solo
 * semis/final): `phases`/`showGrupos`/`showEspeciales` deciden qué secciones renderizar en
 * vez de asumirlas, y `rpc` decide de dónde vienen los datos (get_public_pick lee `picks`,
 * get_public_revancha_pick lee `revancha_picks` — ninguna otra parte de este componente
 * sabe distinguir entre las dos competencias).
 */
export function ParticipantPickDetail({
  participantId,
  rpc,
  phases,
  showGrupos = false,
  showEspeciales = false,
  emptyLabel = "Sin planilla guardada todavía.",
}: {
  participantId: string;
  rpc: "get_public_pick" | "get_public_revancha_pick";
  phases: Fase[];
  showGrupos?: boolean;
  showEspeciales?: boolean;
  emptyLabel?: string;
}) {
  const { data: ts } = useTournamentState();
  const queryKey = rpc === "get_public_pick" ? "public-pick" : "public-revancha-pick";
  const { data, isLoading } = useQuery({
    queryKey: [queryKey, participantId],
    queryFn: async (): Promise<PublicPick | null> => {
      const { data, error } = await supabase.rpc(
        rpc as never,
        {
          _participant_id: participantId,
        } as never,
      );
      if (error) throw error;
      const row = Array.isArray(data) ? (data as PublicPick[])[0] : (data as PublicPick | null);
      return row ?? null;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  const isVisible = (k: VisibilityKey) => isSectionVisible(ts?.visibility, k);

  const teamLabelInGroup = (k: GroupKey, id: string | null): string => {
    if (!id || !ts) return "—";
    const g = ts.groups[k];
    if (!g) return id;
    const t = g.teams.find((x) => x.id === id);
    if (t) return t.nombre;
    for (const tt of g.teams) {
      const c = tt.candidatos?.find((c) => c.id === id);
      if (c) return c.n;
    }
    return id;
  };

  const extras: ExtraMatch[] = (ts?.extra_matches ?? []) as ExtraMatch[];

  return (
    <div className="space-y-4 text-sm">
      {showEspeciales && (isVisible("goleador") || isVisible("arquero")) && (
        <section>
          <h4 className="font-display text-xs uppercase tracking-wider text-destructive">
            Especiales
          </h4>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">
            {isVisible("goleador") && (
              <li>
                <span className="text-muted-foreground">Goleador:</span> {data.goleador_id || "—"}
                {!!ts?.goleador_id?.trim() && !!data.goleador_id && (
                  <PtsBadge pts={especialMatches(data.goleador_id, ts.goleador_id) ? 10 : 0} />
                )}
              </li>
            )}
            {isVisible("arquero") && (
              <li>
                <span className="text-muted-foreground">Arquero:</span> {data.arquero_id || "—"}
                {!!ts?.arquero_id?.trim() && !!data.arquero_id && (
                  <PtsBadge pts={especialMatches(data.arquero_id, ts.arquero_id) ? 10 : 0} />
                )}
              </li>
            )}
          </ul>
        </section>
      )}

      {showGrupos && isVisible("grupos") && (
        <section>
          <h4 className="font-display text-xs uppercase tracking-wider text-gold">
            Clasificados por grupo
          </h4>
          <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {GROUP_KEYS.map((k) => {
              const sel = data.groups?.[k];
              const og = ts?.groups?.[k];
              const hasOfficial = !!(og?.pos1 && og?.pos2);
              return (
                <div key={k} className="rounded-md border border-border bg-muted/20 px-2 py-1">
                  <div className="flex items-center text-[11px] uppercase text-muted-foreground">
                    Grupo {k}
                    {hasOfficial && sel?.pos1 && sel?.pos2 && (
                      <PtsBadge pts={groupPts(og!.pos1, og!.pos2, sel.pos1, sel.pos2)} />
                    )}
                  </div>
                  <div>1º {teamLabelInGroup(k, sel?.pos1 ?? null)}</div>
                  <div>2º {teamLabelInGroup(k, sel?.pos2 ?? null)}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {showGrupos &&
        ts &&
        isVisible("grupos") &&
        (() => {
          const kIds = new Set((ts.groups.K?.teams ?? []).map((t) => t.id));
          const kMatches = ts.group_k_matches.filter(
            (m) => kIds.has(m.local) && kIds.has(m.visitante),
          );
          if (kMatches.length === 0) return null;
          // Privacidad: los marcadores ajenos se ocultan hasta que inicia el primer partido del Grupo K.
          const kTimes = kMatches
            .map((m) => new Date(m.fecha).getTime())
            .filter((tms) => !Number.isNaN(tms));
          const kRevealed = kTimes.length > 0 && Date.now() >= Math.min(...kTimes);
          if (!kRevealed) {
            return (
              <section>
                <h4 className="font-display text-xs uppercase tracking-wider text-info">
                  Marcadores · Grupo K
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  🔒 Marcadores ocultos hasta el inicio de la fase.
                </p>
              </section>
            );
          }
          return (
            <section>
              <h4 className="font-display text-xs uppercase tracking-wider text-info">
                Marcadores · Grupo K
              </h4>
              <ul className="mt-1 divide-y divide-border/60">
                {kMatches.map((m) => {
                  const lName = ts.groups.K?.teams.find((t) => t.id === m.local)?.nombre ?? m.local;
                  const vName =
                    ts.groups.K?.teams.find((t) => t.id === m.visitante)?.nombre ?? m.visitante;
                  const p = data.group_k_matches?.[m.id];
                  const hasOfficial = m.gh != null && m.ga != null;
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-2 py-1">
                      <span className="truncate">
                        {lName} vs {vName}
                        {hasOfficial && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (oficial {m.gh}–{m.ga})
                          </span>
                        )}
                      </span>
                      <span className="flex items-center font-mono text-gold">
                        {p?.gh ?? "—"}–{p?.ga ?? "—"}
                        {hasOfficial && p?.gh != null && p?.ga != null && (
                          <PtsBadge pts={matchPts(m.gh, m.ga, p.gh, p.ga)} />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })()}

      {phases.map((fase) => {
        if (!isVisible(fase)) return null;
        const list = extras.filter((m) => m.fase === fase);
        if (list.length === 0) return null;
        // Privacidad: los marcadores ajenos se ocultan hasta que inicia el primer partido de la ronda.
        if (!isExtraPhaseRevealed(extras, fase)) {
          return (
            <section key={fase}>
              <h4 className="font-display text-xs uppercase tracking-wider text-info">
                {FASE_LABEL[fase]}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                🔒 Marcadores ocultos hasta el inicio de la ronda.
              </p>
            </section>
          );
        }
        return (
          <section key={fase}>
            <h4 className="font-display text-xs uppercase tracking-wider text-info">
              {FASE_LABEL[fase]}
            </h4>
            <ul className="mt-1 divide-y divide-border/60">
              {list.map((m) => {
                const p = data.extra_matches?.[m.id];
                const hasOfficial = m.gh != null && m.ga != null;
                return (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-1">
                    <span className="truncate">
                      {ts ? teamNameByCode(ts.groups, m.local) : m.local} vs{" "}
                      {ts ? teamNameByCode(ts.groups, m.visitante) : m.visitante}
                      {hasOfficial && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (oficial {m.gh}–{m.ga})
                        </span>
                      )}
                    </span>
                    <span className="flex items-center font-mono text-gold">
                      {p?.gh ?? "—"}–{p?.ga ?? "—"}
                      {hasOfficial && p?.gh != null && p?.ga != null && (
                        <PtsBadge pts={matchPts(m.gh, m.ga, p.gh, p.ga)} />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
