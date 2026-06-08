import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { LeaderboardRow } from "@/lib/prizes";

export type Match = Tables<"matches">;
export type Prediction = Tables<"predictions">;

export function useMatches() {
  return useQuery({
    queryKey: ["matches"],
    queryFn: async (): Promise<Match[]> => {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .order("numero_partido", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMyPredictions(participantId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-predictions", participantId],
    enabled: !!participantId,
    queryFn: async (): Promise<Prediction[]> => {
      const { data, error } = await supabase
        .from("predictions")
        .select("*")
        .eq("participant_id", participantId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLeaderboard() {
  const query = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase.rpc("get_leaderboard");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        participant_id: r.participant_id,
        nombre: r.nombre,
        total_puntos: Number(r.total_puntos),
        exactos: Number(r.exactos),
        ganadores: Number(r.ganadores),
        posicion: Number(r.posicion),
      }));
    },
  });

  // Realtime: refetch leaderboard when match results change. Predictions are
  // intentionally NOT subscribed to — they are not broadcast over Realtime to
  // avoid leaking other players' picks, and points only change once a match
  // result is entered (which updates the matches table).
  useEffect(() => {
    const channel = supabase
      .channel("leaderboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        query.refetch();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return query;
}
