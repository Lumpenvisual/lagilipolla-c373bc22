import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, Trophy, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePollaLeaderboard, type LbRow } from "@/hooks/usePolla";
import { parseSpecial, teamNameByCode, type TournamentState } from "@/lib/polla";

/** "Nombre (Equipo)" oficial → nombre + equipo atenuado ("Kylian Mbappé · Francia"). */
function SpecialName({ text }: { text: string }) {
  const { nombre, seleccion } = parseSpecial(text);
  return (
    <>
      {nombre}
      {seleccion && <span className="opacity-70"> · {seleccion}</span>}
    </>
  );
}

/** Grupos de podio: filas del leaderboard agrupadas por posición (soporta empates). */
function podiumGroups(rows: LbRow[]): { posicion: number; rows: LbRow[] }[] {
  const byPos = new Map<number, LbRow[]>();
  for (const r of rows) {
    const list = byPos.get(r.posicion) ?? [];
    list.push(r);
    byPos.set(r.posicion, list);
  }
  return [...byPos.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, 3)
    .map(([posicion, rs]) => ({ posicion, rows: rs }));
}

const MEDAL = ["🥇", "🥈", "🥉"] as const;
const LUGAR = ["1er lugar", "2° lugar", "3er lugar"] as const;

/**
 * Podio final de LA GILIPOLLA — se muestra en la pantalla de inicio SOLO cuando el
 * campeonato está completo (ver `isTournamentComplete`): destaca al ganador de la
 * polla y al 2° y 3er lugar, con los datos oficiales del Mundial como contexto.
 */
export function FinalPodium({ ts }: { ts: TournamentState }) {
  const { data: rows = [], isLoading } = usePollaLeaderboard();
  const groups = useMemo(() => podiumGroups(rows), [rows]);

  // Campeón del Mundial: ganador de la final por marcador. Si la final terminó
  // empatada en los 90' (se definió por penales), no es derivable de los datos.
  const finalMatch = (ts.extra_matches ?? []).find((m) => m.fase === "final");
  const champTeam =
    finalMatch && finalMatch.gh != null && finalMatch.ga != null && finalMatch.gh !== finalMatch.ga
      ? teamNameByCode(
          ts.groups,
          finalMatch.gh > finalMatch.ga ? finalMatch.local : finalMatch.visitante,
        )
      : null;

  if (isLoading || groups.length === 0) return null;

  const [champ, second, third] = groups;
  const names = (g?: { rows: LbRow[] }) => g?.rows.map((r) => r.nombre).join(" · ") ?? "—";

  return (
    <section
      aria-label="Podio final de LA GILIPOLLA"
      className="glass-card relative mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border-2 border-gold/50 px-4 py-8 text-center card-shadow sm:px-8"
    >
      <div className="bandera-stripe-h absolute inset-x-0 top-0 h-1.5" aria-hidden />
      <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-gold">
        <Trophy className="size-3.5" /> Campeonato finalizado · Resultados oficiales
      </span>

      <div className="mt-6">
        <Crown className="mx-auto size-10 text-gold drop-shadow-[0_2px_10px_rgba(252,209,22,0.5)]" />
        <p className="mt-2 text-[11px] uppercase tracking-[0.4em] text-muted-foreground">
          {champ.rows.length > 1 ? "Ganadores de LA GILIPOLLA" : "Ganador de LA GILIPOLLA"}
        </p>
        <p className="mt-1 font-display text-4xl sm:text-5xl">
          <span className="gold-gradient-text drop-shadow-[0_4px_14px_rgba(252,209,22,0.35)]">
            {MEDAL[0]} {names(champ)}
          </span>
        </p>
        <p className="mt-1 text-sm font-semibold text-gold">{champ.rows[0].puntos_total} puntos</p>
      </div>

      {(second || third) && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[second, third].map(
            (g, i) =>
              g && (
                <div
                  key={g.posicion}
                  className="rounded-xl border border-border bg-card/60 px-4 py-3"
                >
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {MEDAL[i + 1]} {LUGAR[i + 1]}
                  </p>
                  <p className="mt-1 truncate font-display text-xl">{names(g)}</p>
                  <p className="text-xs text-muted-foreground">{g.rows[0].puntos_total} puntos</p>
                </div>
              ),
          )}
        </div>
      )}

      <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {champTeam && <span>🏆 Campeón del Mundial: {champTeam}</span>}
        {ts.goleador_id?.trim() && (
          <span>
            ⚽ Goleador: <SpecialName text={ts.goleador_id} />
          </span>
        )}
        {ts.arquero_id?.trim() && (
          <span>
            🧤 Arquero: <SpecialName text={ts.arquero_id} />
          </span>
        )}
      </p>

      <div className="mt-5">
        <Button asChild variant="secondary" size="sm">
          <Link to="/leaderboard">
            Ver tabla completa <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
