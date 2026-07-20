import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Suscripción Realtime global con debounce para soportar 50+ usuarios
 * concurrentes sin saturar el RPC `get_polla_leaderboard`.
 * - tournament_state: invalida estado + leaderboard (poco frecuente).
 * - picks: agrupa invalidaciones en una ventana de 1.5s. Sólo invalida
 *   `my-pick` cuando el cambio es del propio participante; invalida
 *   `public-pick` del participante concreto (nunca el prefijo, o un
 *   recálculo de 37 picks marcaría las 37 queries stale 37 veces).
 */
export function RealtimeSync() {
  const qc = useQueryClient();
  const { participant } = useAuth();
  const myId = participant?.id ?? null;

  useEffect(() => {
    // Debounce genérico: coalesce ráfagas de eventos (un recálculo toca las
    // 37 filas de `picks` en cascada) en UNA sola invalidación por key, en vez
    // de una por evento. `admin-specials-picks` no tiene el problema de
    // concurrencia de 50+ usuarios que motivó esto (es una vista admin de una
    // sola sesión), pero sí el mismo desperdicio mecánico: hasta 37 refetches
    // seguidos de la misma tabla cuando el admin la tiene abierta en
    // /admin/especiales durante un recálculo.
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const scheduleInvalidate = (key: string, delayMs = 1500) => {
      if (timers.has(key)) return;
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          qc.invalidateQueries({ queryKey: [key] });
        }, delayMs),
      );
    };
    const scheduleLb = () => scheduleInvalidate("polla-leaderboard");

    const channel = supabase
      .channel("polla-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_state" }, () => {
        qc.invalidateQueries({ queryKey: ["tournament-state"] });
        scheduleLb();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "picks" }, (payload) => {
        scheduleLb();
        scheduleInvalidate("admin-specials-picks");
        const row = (payload.new ?? payload.old) as { participant_id?: string } | null;
        if (row?.participant_id) {
          qc.invalidateQueries({ queryKey: ["public-pick", row.participant_id] });
        }
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
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      supabase.removeChannel(channel);
    };
  }, [qc, myId]);

  return null;
}
