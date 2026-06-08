import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLeaderboard } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { calculatePrizes, MEDALS, positionLabel, type LeaderboardRow } from "@/lib/prizes";
import { ENTRY_FEE } from "@/lib/constants";
import { formatCAD, formatET } from "@/lib/format";
import { flag } from "@/lib/flags";
import { useT, tStatic, type TFunc } from "@/lib/i18n";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: tStatic("lb.meta.title") },
      { name: "description", content: tStatic("lb.meta.desc") },
    ],
  }),
  component: LeaderboardPage,
});

const rowBg: Record<number, string> = {
  1: "bg-gold/10",
  2: "bg-muted-foreground/10",
  3: "bg-[#cd7f32]/10",
  4: "bg-info/5",
};

function LeaderboardPage() {
  const t = useT();
  const { participant } = useAuth();
  const { data: rows = [], isLoading } = useLeaderboard();
  const [selected, setSelected] = useState<LeaderboardRow | null>(null);

  const totalPot = rows.length * ENTRY_FEE;
  const prizes = useMemo(() => calculatePrizes(rows, totalPot), [rows, totalPot]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-4xl tracking-wide">
          <span aria-hidden>🏅 </span>{t("lb.title")}
        </h1>
        <span className="flex items-center gap-1.5 text-xs text-primary">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {t("lb.live")}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("lb.subtitle", { n: rows.length, pot: formatCAD(totalPot) })}
      </p>

      {/* Prize projection */}
      <Card className="mt-6 border-gold/30 bg-card p-5 card-shadow">
        <h2 className="font-display text-xl tracking-wide">{t("lb.ifEndedToday")}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((pos) => {
            const winners = rows.filter((r) => r.posicion === pos);
            const amt = winners.reduce((s, w) => s + (prizes[w.participant_id] ?? 0), 0);
            return (
              <div key={pos} className="rounded-xl border border-border bg-muted/40 p-4 text-center">
                <div className="text-2xl">{MEDALS[pos]}</div>
                <div className="mt-1 font-display text-2xl text-gold">{formatCAD(amt)}</div>
                <div className="text-xs text-muted-foreground">
                  {winners.length > 0
                    ? t(winners.length === 1 ? "lb.winners_one" : "lb.winners_other", { n: winners.length })
                    : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("lb.empty")}</p>
      ) : (
        <Card className="mt-6 overflow-hidden border-border bg-card card-shadow">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">{t("common.pos")}</th>
                  <th className="p-3">{t("lb.col.participant")}</th>
                  <th className="p-3 text-center">{t("common.pts")}</th>
                  <th className="p-3 text-center">⭐</th>
                  <th className="p-3 text-center">✓</th>
                  <th className="p-3 text-right">{t("common.prize")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isMe = participant?.id === r.participant_id;
                  return (
                    <tr
                      key={r.participant_id}
                      onClick={() => setSelected(r)}
                      className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary/60 ${
                        rowBg[r.posicion] ?? ""
                      } ${isMe ? "outline outline-1 -outline-offset-1 outline-info" : ""}`}
                    >
                      <td className="p-3 font-display text-lg">
                        {MEDALS[r.posicion] ?? positionLabel(r.posicion, rows)}
                      </td>
                      <td className="p-3 font-medium">
                        {r.nombre} {isMe && <span className="text-xs text-info">({t("common.you")})</span>}
                      </td>
                      <td className="p-3 text-center font-display text-lg text-gold">{r.total_puntos}</td>
                      <td className="p-3 text-center text-muted-foreground">{r.exactos}</td>
                      <td className="p-3 text-center text-muted-foreground">{r.ganadores}</td>
                      <td className="p-3 text-right text-gold">{formatCAD(prizes[r.participant_id] ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <HistoryDialog row={selected} onClose={() => setSelected(null)} t={t} />
    </main>
  );
}

function HistoryDialog({ row, onClose, t }: { row: LeaderboardRow | null; onClose: () => void; t: TFunc }) {
  const { data, isLoading } = useQuery({
    queryKey: ["participant-history", row?.participant_id],
    enabled: !!row,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_participant_predictions", {
        _participant_id: row!.participant_id,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto border-border bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            {row?.nombre} · {t("lb.dialog.pts", { n: row?.total_puntos ?? 0 })}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(data ?? []).map((m) => {
              const hasPred = m.goles_local_pred != null && m.goles_visitante_pred != null;
              const hasResult = m.goles_local != null && m.goles_visitante != null;
              const pts = m.puntos_obtenidos ?? 0;
              const color = pts === 3 ? "text-primary" : pts === 1 ? "text-success" : "text-muted-foreground";
              return (
                <div key={m.match_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">
                      {flag(m.equipo_local)} {m.equipo_local} {t("common.vs")} {m.equipo_visitante} {flag(m.equipo_visitante)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{formatET(m.kickoff_time)}</p>
                  </div>
                  <div className="text-right text-xs">
                    <div>{t("lb.dialog.pred")} {hasPred ? `${m.goles_local_pred}–${m.goles_visitante_pred}` : "–"}</div>
                    {hasResult && (
                      <div className="text-gold">{t("lb.dialog.real")} {m.goles_local}–{m.goles_visitante}</div>
                    )}
                  </div>
                  <span className={`w-8 text-right font-display text-base ${color}`}>+{pts}</span>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
