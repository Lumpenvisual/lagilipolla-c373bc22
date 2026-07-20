import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTournamentState } from "@/hooks/usePolla";
import {
  GROUP_KEYS,
  FASE_LABEL,
  isSectionVisible,
  parseSpecial,
  teamNameByCode,
  type Fase,
  type GroupKey,
  type Group,
} from "@/lib/polla";

/** "Nombre (Equipo)" oficial → nombre + equipo atenuado ("Kylian Mbappé · Francia"). */
function SpecialName({ text }: { text: string }) {
  const { nombre, seleccion } = parseSpecial(text);
  return (
    <>
      {nombre}
      {seleccion && <span className="text-muted-foreground"> · {seleccion}</span>}
    </>
  );
}

/* Módulo "Resultados oficiales": lo que el admin fijó en tournament_state
 * (clasificados 1º/2º por grupo, marcadores del Grupo K, eliminatorias y
 * goleador/arquero). Es la fuente con la que se puntúa a cada usuario.
 * Solo muestra lo que la visibilidad de cada fase permite. */

function teamLabel(g: Group | undefined, id: string | null | undefined): string {
  if (!id || !g) return "—";
  const t = g.teams.find((x) => x.id === id);
  if (t) return t.nombre;
  for (const tt of g.teams) {
    const c = tt.candidatos?.find((c) => c.id === id);
    if (c) return c.n;
  }
  return id;
}

export function OfficialResultsPanel() {
  const { data: ts } = useTournamentState();
  if (!ts) return null;

  const isVisible = isSectionVisible;
  const showGrupos = isVisible(ts.visibility, "grupos");
  const showGoleador = isVisible(ts.visibility, "goleador") && !!ts.goleador_id?.trim();
  const showArquero = isVisible(ts.visibility, "arquero") && !!ts.arquero_id?.trim();

  // Marcadores oficiales del Grupo K (solo los partidos entre equipos del grupo K).
  const kIds = new Set((ts.groups.K?.teams ?? []).map((t) => t.id));
  const kMatches = (ts.group_k_matches ?? []).filter(
    (m) => kIds.has(m.local) && kIds.has(m.visitante) && m.gh != null && m.ga != null,
  );

  // Marcadores oficiales de eliminatorias (con resultado), por fase visible.
  const phaseOrder: Fase[] = ["dieciseisavos", "octavos", "cuartos", "semis", "tercero", "final"];
  const extras = ts.extra_matches ?? [];
  const koByPhase = phaseOrder
    .filter((f) => isVisible(ts.visibility, f))
    .map((f) => ({
      fase: f,
      list: extras.filter((m) => m.fase === f && m.gh != null && m.ga != null),
    }))
    .filter((x) => x.list.length > 0);

  const groupsConClasificados = showGrupos
    ? GROUP_KEYS.filter((k) => ts.groups[k]?.pos1 && ts.groups[k]?.pos2)
    : [];

  const nadaPublicado =
    groupsConClasificados.length === 0 &&
    kMatches.length === 0 &&
    koByPhase.length === 0 &&
    !showGoleador &&
    !showArquero;

  return (
    <Card className="border-gold/40 bg-gold/5 p-6 card-shadow">
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 text-left">
          <h2 className="font-display text-2xl text-gold">🏁 Resultados oficiales</h2>
          <ChevronDown className="size-5 shrink-0 text-gold transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="mt-1 text-xs text-muted-foreground">
            Los fija el admin a medida que avanza el Mundial. Con estos datos se calcula el puntaje
            de cada participante.
          </p>

          {nadaPublicado ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Aún no se han publicado resultados oficiales.
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              {groupsConClasificados.length > 0 && (
                <section>
                  <h3 className="font-display text-xs uppercase tracking-wider text-foreground">
                    Clasificados por grupo (1º y 2º)
                  </h3>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {groupsConClasificados.map((k) => {
                      const g = ts.groups[k as GroupKey];
                      return (
                        <div key={k} className="rounded-md border border-border bg-card px-2 py-1">
                          <div className="text-[11px] uppercase text-muted-foreground">
                            Grupo {k}
                          </div>
                          <div>1º {teamLabel(g, g.pos1)}</div>
                          <div>2º {teamLabel(g, g.pos2)}</div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {kMatches.length > 0 && (
                <section>
                  <h3 className="font-display text-xs uppercase tracking-wider text-info">
                    Marcadores · Grupo K
                  </h3>
                  <ul className="mt-2 divide-y divide-border/60">
                    {kMatches.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-2 py-1 text-sm"
                      >
                        <span className="truncate">
                          {teamLabel(ts.groups.K, m.local)} vs {teamLabel(ts.groups.K, m.visitante)}
                        </span>
                        <span className="font-mono font-semibold text-gold">
                          {m.gh}–{m.ga}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {koByPhase.map(({ fase, list }) => (
                <section key={fase}>
                  <h3 className="font-display text-xs uppercase tracking-wider text-info">
                    {FASE_LABEL[fase]}
                  </h3>
                  <ul className="mt-2 divide-y divide-border/60">
                    {list.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-2 py-1 text-sm"
                      >
                        <span className="truncate">
                          {teamNameByCode(ts.groups, m.local)} vs{" "}
                          {teamNameByCode(ts.groups, m.visitante)}
                        </span>
                        <span className="font-mono font-semibold text-gold">
                          {m.gh}–{m.ga}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {(showGoleador || showArquero) && (
                <section>
                  <h3 className="font-display text-xs uppercase tracking-wider text-destructive">
                    Especiales
                  </h3>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2 text-sm">
                    {showGoleador && (
                      <div>
                        <span className="text-muted-foreground">Goleador:</span>{" "}
                        <span className="font-medium">
                          <SpecialName text={ts.goleador_id!} />
                        </span>
                      </div>
                    )}
                    {showArquero && (
                      <div>
                        <span className="text-muted-foreground">Arquero:</span>{" "}
                        <span className="font-medium">
                          <SpecialName text={ts.arquero_id!} />
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
