import { useState, Fragment, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export type LeaderboardRow = {
  participant_id: string;
  nombre: string;
  posicion: number;
  total: number;
};

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/**
 * Shell de tabla de posiciones (podio, fila, expandir detalle) compartido entre la polla
 * principal y La Revancha — cada una adapta sus filas a `LeaderboardRow` (mismo total, ya
 * sea puntos_total o puntos) y decide qué renderizar al expandir vía `renderDetail`.
 */
export function LeaderboardTable({
  rows,
  meParticipantId,
  renderDetail,
}: {
  rows: LeaderboardRow[];
  meParticipantId?: string | null;
  renderDetail: (participantId: string) => ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Card className="overflow-x-auto border-border bg-card card-shadow">
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
            const me = meParticipantId === r.participant_id;
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
                    {r.total}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-border/60 bg-muted/10">
                    <td colSpan={3} className="p-3 sm:p-4">
                      {renderDetail(r.participant_id)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
