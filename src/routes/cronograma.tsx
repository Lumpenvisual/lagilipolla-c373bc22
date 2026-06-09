import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Calendar, MapPin, Lock, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTournamentState } from "@/hooks/usePolla";
import {
  fmtFecha,
  isMatchLocked,
  FASE_LABEL,
  type ExtraMatch,
  type Fase,
} from "@/lib/polla";

export const Route = createFileRoute("/cronograma")({
  head: () => ({
    meta: [
      { title: "Cronograma · LA GILIPOLLA 2026" },
      {
        name: "description",
        content:
          "Cronograma de partidos del Mundial 2026 en hora Colombia (COT). Fechas, sedes y resultados.",
      },
    ],
  }),
  component: Cronograma,
});

type Row = ExtraMatch & { isGroupK: boolean };

function Cronograma() {
  const { data: ts, isLoading } = useTournamentState();

  const rows = useMemo<Row[]>(() => {
    if (!ts) return [];
    const teamName = (id: string) =>
      ts.groups.K.teams.find((t) => t.id === id)?.nombre ?? id;
    const groupK: Row[] = ts.group_k_matches.map((m) => ({
      id: m.id,
      fase: "grupos" as Fase,
      fecha: m.fecha,
      local: teamName(m.local),
      visitante: teamName(m.visitante),
      sede: m.sede,
      gh: m.gh,
      ga: m.ga,
      isGroupK: true,
    }));
    const extra: Row[] = (ts.extra_matches ?? []).map((m) => ({ ...m, isGroupK: false }));
    return [...groupK, ...extra].sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
    );
  }, [ts]);

  const grouped = useMemo(() => {
    const map = new Map<Fase, Row[]>();
    for (const r of rows) {
      const list = map.get(r.fase) ?? [];
      list.push(r);
      map.set(r.fase, list);
    }
    return map;
  }, [rows]);

  if (isLoading || !ts) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const orden: Fase[] = ["grupos", "octavos", "cuartos", "semis", "tercero", "final"];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <div className="bandera-stripe-h h-1 w-16 rounded-sm" aria-hidden />
      <h1 className="mt-3 font-display text-3xl sm:text-4xl">📅 Cronograma y fechas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Todos los horarios en hora Colombia (COT). Los marcadores se bloquean 24h antes de cada
        partido.
      </p>

      <div className="mt-8 space-y-8">
        {orden.map((fase) => {
          const list = grouped.get(fase);
          if (!list || list.length === 0) return null;
          return (
            <section key={fase}>
              <div className="flex flex-wrap items-center gap-2">
                <Trophy className="size-4 text-gold" />
                <h2 className="font-display text-xl sm:text-2xl text-gold">{FASE_LABEL[fase]}</h2>
                <span className="text-xs text-muted-foreground">· {list.length} partidos</span>
              </div>
              <Card className="mt-3 border-border bg-card card-shadow divide-y divide-border">
                {list.map((m) => {
                  const locked = isMatchLocked(m.fecha);
                  const played = m.gh != null && m.ga != null;
                  return (
                    <div
                      key={`${m.fase}-${m.id}`}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:max-w-[45%]">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="size-3" /> {fmtFecha(m.fecha)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3" /> {m.sede || "Sede por definir"}
                        </span>
                        {locked && !played && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                            <Lock className="size-3" /> Bloqueado
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-3 sm:shrink-0">
                        <span className="flex-1 truncate text-right text-sm font-medium sm:max-w-[140px]">
                          {m.local || "Por definir"}
                        </span>
                        <span
                          className={`min-w-[64px] shrink-0 rounded-md px-3 py-1 text-center font-display text-lg ${
                            played
                              ? "bg-gold/15 text-gold"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {played ? `${m.gh} – ${m.ga}` : "vs"}
                        </span>
                        <span className="flex-1 truncate text-sm font-medium sm:max-w-[140px]">
                          {m.visitante || "Por definir"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          );
        })}

        {grouped.size === 1 && (
          <Card className="border-info/30 bg-info/5 p-5 text-sm text-muted-foreground card-shadow">
            Las jornadas eliminatorias (octavos en adelante) aparecerán aquí a medida que el admin
            las vaya agregando.
          </Card>
        )}
      </div>
    </main>
  );
}