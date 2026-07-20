import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Suscripción Realtime global con debounce para soportar 50+ usuarios
 * concurrentes sin saturar el RPC `get_polla_leaderboard`.
 * - tournament_state: invalida estado + leaderboard (poco frecuente).
 * - picks: agrupa invalidaciones en una ventana de 1.5s. Sólo invalida
 *   `my-pick` cuando el cambio es del propio participante.
 */
export function RealtimeSync() {
  const qc = useQueryClient();
  const { participant } = useAuth();
  const myId = participant?.id ?? null;

  useEffect(() => {
    let lbTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLb = () => {
      if (lbTimer) return;
      lbTimer = setTimeout(() => {
        lbTimer = null;
        qc.invalidateQueries({ queryKey: ["polla-leaderboard"] });
      }, 1500);
    };

    const channel = supabase
      .channel("polla-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_state" }, () => {
        qc.invalidateQueries({ queryKey: ["tournament-state"] });
        scheduleLb();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "picks" }, (payload) => {
        scheduleLb();
        qc.invalidateQueries({ queryKey: ["admin-specials-picks"] });
        const row = (payload.new ?? payload.old) as { participant_id?: string } | null;
        if (myId && row?.participant_id === myId) {
          qc.invalidateQueries({ queryKey: ["my-pick", myId] });
          qc.invalidateQueries({ queryKey: ["pick-history", "mine", myId] });
        }
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pick_history" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { participant_id?: string } | null;
          qc.invalidateQueries({ queryKey: ["pick-history", "all", null] });
          if (myId && row?.participant_id === myId) {
            qc.invalidateQueries({ queryKey: ["pick-history", "mine", myId] });
          }
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-participants"] });
        qc.invalidateQueries({ queryKey: ["history-participants"] });
        scheduleLb();
      })
      .subscribe();

    return () => {
      if (lbTimer) clearTimeout(lbTimer);
      supabase.removeChannel(channel);
    };
  }, [qc, myId]);

  return null;
}
