import { useState, Fragment } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePollaLeaderboard, useTournamentState } from "@/hooks/usePolla";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ScoringRulesPanel } from "@/components/ScoringRulesPanel";
import { OfficialResultsPanel } from "@/components/OfficialResultsPanel";
import {
  GROUP_KEYS,
  FASE_LABEL,
  isSectionVisible,
  groupPts,
  matchPts,
  normEspecial,
  teamNameByCode,
  type ExtraMatch,
  type GroupKey,
  type VisibilityKey,
} from "@/lib/polla";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Tabla de posiciones · LA GILIPOLLA 2026" },
      {
        name: "description",
        content:
          "Tabla en vivo de la polla del Mundial 2026: ranking de participantes con vista de planilla.",
      },
      { property: "og:title", content: "Tabla de posiciones · LA GILIPOLLA 2026" },
      { property: "og:description", content: "Ranking en vivo de la polla del Mundial 2026." },
      { property: "og:url", content: `${import.meta.env.VITE_APP_URL}/leaderboard` },
    ],
    links: [{ rel: "canonical", href: `${import.meta.env.VITE_APP_URL}/leaderboard` }],
  }),
  component: Lb,
});

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function Lb() {
  const { participant } = useAuth();
  const { data: rows = [], isLoading } = usePollaLeaderboard();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <div className="bandera-stripe-h h-1 w-16 rounded-sm" aria-hidden />
      <h1 className="mt-3 font-display text-3xl sm:text-4xl">🏅 Tabla de posiciones</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {rows.length} participantes · LA GILIPOLLA 2026
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Toca el nombre de un participante para ver su planilla. Desempates: aciertos de 5, luego 3,
        luego 2.
      </p>

      <div className="mt-4">
        <OfficialResultsPanel />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          Aún no hay participantes aprobados.
        </p>
      ) : (
        <Card className="mt-6 overflow-x-auto border-border bg-card card-shadow">
          <table className="w-full min-w-[320px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-2 sm:p-3">Pos</th>
                <th className="p-2 sm:p-3">Participante</th>
                <th className="p-2 sm:p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const me = participant?.id === r.participant_id;
                const isOpen = openId === r.participant_id;
                const bg =
                  r.posicion === 1
                    ? "bg-gold/10"
                    : r.posicion === 2
                      ? "bg-muted/40"
                      : r.posicion === 3
                        ? "bg-destructive/10"
                        : "";
                return (
                  <Fragment key={r.participant_id}>
                    <tr
                      className={`border-b border-border/60 cursor-pointer hover:bg-muted/30 ${bg} ${me ? "outline outline-1 -outline-offset-1 outline-info" : ""}`}
                      onClick={() => setOpenId(isOpen ? null : r.participant_id)}
                    >
                      <td className="p-2 sm:p-3 font-display text-lg">
                        {MEDAL[r.posicion] ?? r.posicion}
                      </td>
                      <td className="p-2 sm:p-3 font-medium">
                        <div className="flex items-center gap-1.5 truncate">
                          {isOpen ? (
                            <ChevronDown className="size-4 shrink-0" />
                          ) : (
                            <ChevronRight className="size-4 shrink-0" />
                          )}
                          <span className="truncate">{r.nombre}</span>
                          {me && <span className="text-xs text-info">(tú)</span>}
                        </div>
                      </td>
                      <td className="p-2 sm:p-3 text-right font-display text-lg sm:text-xl text-gold">
                        {r.puntos_total}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border/60 bg-muted/10">
                        <td colSpan={3} className="p-3 sm:p-4">
                          <ParticipantPickDetail participantId={r.participant_id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Reglas del sistema de puntos (acuerdos del reglamento), debajo de la tabla */}
      <section className="mt-10">
        <h2 className="font-display text-2xl">📊 Sistema de puntos</h2>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          Así se asigna el puntaje de cada resultado según el reglamento oficial.
        </p>
        <ScoringRulesPanel />
      </section>
    </main>
  );
}

type PublicPick = {
  participant_id: string;
  nombre: string;
  groups: Record<string, { pos1: string | null; pos2: string | null }>;
  group_k_matches: Record<string, { gh: number | null; ga: number | null }>;
  extra_matches: Record<string, { gh: number | null; ga: number | null }>;
  goleador_id: string | null;
  arquero_id: string | null;
  puntos_total: number;
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

function ParticipantPickDetail({ participantId }: { participantId: string }) {
  const { data: ts } = useTournamentState();
  const { data, isLoading } = useQuery({
    queryKey: ["public-pick", participantId],
    queryFn: async (): Promise<PublicPick | null> => {
      const { data, error } = await supabase.rpc(
        "get_public_pick" as never,
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
    return <p className="text-xs text-muted-foreground">Sin planilla guardada todavía.</p>;
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
  const phaseOrder = ["dieciseisavos", "octavos", "cuartos", "semis", "tercero", "final"] as const;

  return (
    <div className="space-y-4 text-sm">
      {(isVisible("goleador") || isVisible("arquero")) && (
        <section>
          <h4 className="font-display text-xs uppercase tracking-wider text-destructive">
            Especiales
          </h4>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">
            {isVisible("goleador") && (
              <li>
                <span className="text-muted-foreground">Goleador:</span> {data.goleador_id || "—"}
                {!!ts?.goleador_id?.trim() && !!data.goleador_id && (
                  <PtsBadge
                    pts={normEspecial(data.goleador_id) === normEspecial(ts.goleador_id) ? 10 : 0}
                  />
                )}
              </li>
            )}
            {isVisible("arquero") && (
              <li>
                <span className="text-muted-foreground">Arquero:</span> {data.arquero_id || "—"}
                {!!ts?.arquero_id?.trim() && !!data.arquero_id && (
                  <PtsBadge
                    pts={normEspecial(data.arquero_id) === normEspecial(ts.arquero_id) ? 10 : 0}
                  />
                )}
              </li>
            )}
          </ul>
        </section>
      )}

      {isVisible("grupos") && (
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

      {ts &&
        isVisible("grupos") &&
        (() => {
          const kIds = new Set((ts.groups.K?.teams ?? []).map((t) => t.id));
          const kMatches = ts.group_k_matches.filter(
            (m) => kIds.has(m.local) && kIds.has(m.visitante),
          );
          if (kMatches.length === 0) return null;
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

      {phaseOrder.map((fase) => {
        if (!isVisible(fase)) return null;
        const list = extras.filter((m) => m.fase === fase);
        if (list.length === 0) return null;
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
