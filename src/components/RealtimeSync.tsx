import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Suscripción Realtime global: cuando el admin guarda resultados o se
 * recalculan puntos, el frontend invalida automáticamente las queries
 * de estado del torneo, planilla propia y leaderboard.
 */
export function RealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("polla-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournament_state" },
        () => {
          qc.invalidateQueries({ queryKey: ["tournament-state"] });
          qc.invalidateQueries({ queryKey: ["polla-leaderboard"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "picks" },
        () => {
          qc.invalidateQueries({ queryKey: ["polla-leaderboard"] });
          qc.invalidateQueries({ queryKey: ["my-pick"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return null;
}