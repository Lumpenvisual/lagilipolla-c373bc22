import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePollaLeaderboard } from "@/hooks/usePolla";
import { ScoringRulesPanel } from "@/components/ScoringRulesPanel";
import { OfficialResultsPanel } from "@/components/OfficialResultsPanel";
import { LeaderboardTable, type LeaderboardRow } from "@/components/LeaderboardTable";
import { ParticipantPickDetail } from "@/components/ParticipantPickDetail";

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

const KO_PHASES = ["dieciseisavos", "octavos", "cuartos", "semis", "tercero", "final"] as const;

function Lb() {
  const { participant } = useAuth();
  const { data: rows = [], isLoading } = usePollaLeaderboard();

  const tableRows: LeaderboardRow[] = rows.map((r) => ({
    participant_id: r.participant_id,
    nombre: r.nombre,
    posicion: r.posicion,
    total: r.puntos_total,
  }));

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
        <div className="mt-6">
          <LeaderboardTable
            rows={tableRows}
            meParticipantId={participant?.id}
            renderDetail={(participantId) => (
              <ParticipantPickDetail
                participantId={participantId}
                rpc="get_public_pick"
                phases={[...KO_PHASES]}
                showGrupos
                showEspeciales
              />
            )}
          />
        </div>
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
