import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePollaLeaderboard } from "@/hooks/usePolla";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Tabla · LA GILIPOLLA 2026" }] }),
  component: Lb,
});

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function Lb() {
  const { participant } = useAuth();
  const { data: rows = [], isLoading } = usePollaLeaderboard();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="bandera-stripe-h h-1 w-16 rounded-sm" aria-hidden />
      <h1 className="mt-3 font-display text-4xl">🏅 Tabla de posiciones</h1>
      <p className="mt-1 text-sm text-muted-foreground">{rows.length} participantes · LA GILIPOLLA 2026</p>
      <p className="mt-2 text-xs text-muted-foreground">Desempates oficiales: mayor número de aciertos de 5 pts, luego de 3 pts, luego de 2 pts.</p>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">Aún no hay participantes aprobados.</p>
      ) : (
        <Card className="mt-6 overflow-x-auto border-border bg-card card-shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">Pos</th>
                <th className="p-3">Participante</th>
                <th className="p-3 text-center">Grupos</th>
                <th className="p-3 text-center">Partidos</th>
                <th className="p-3 text-center">Especiales</th>
                <th className="p-3 text-center" title="Aciertos de 5 pts (desempate a)">5pt</th>
                <th className="p-3 text-center" title="Aciertos de 3 pts (desempate b)">3pt</th>
                <th className="p-3 text-center" title="Aciertos de 2 pts (desempate c)">2pt</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const me = participant?.id === r.participant_id;
                const bg = r.posicion === 1 ? "bg-gold/10" : r.posicion === 2 ? "bg-muted/40" : r.posicion === 3 ? "bg-destructive/10" : "";
                return (
                  <tr key={r.participant_id} className={`border-b border-border/60 ${bg} ${me ? "outline outline-1 -outline-offset-1 outline-info" : ""}`}>
                    <td className="p-3 font-display text-lg">{MEDAL[r.posicion] ?? r.posicion}</td>
                    <td className="p-3 font-medium">{r.nombre} {me && <span className="text-xs text-info">(tú)</span>}</td>
                    <td className="p-3 text-center text-muted-foreground">{r.puntos_grupos}</td>
                    <td className="p-3 text-center text-muted-foreground">{r.puntos_partidos}</td>
                    <td className="p-3 text-center text-muted-foreground">{r.puntos_especiales}</td>
                    <td className="p-3 text-center text-xs text-muted-foreground">{r.aciertos_5}</td>
                    <td className="p-3 text-center text-xs text-muted-foreground">{r.aciertos_3}</td>
                    <td className="p-3 text-center text-xs text-muted-foreground">{r.aciertos_2}</td>
                    <td className="p-3 text-right font-display text-xl text-gold">{r.puntos_total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}