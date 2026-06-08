import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TournamentState, PickRow } from "@/lib/polla";

export function useTournamentState() {
  return useQuery({
    queryKey: ["tournament-state"],
    queryFn: async (): Promise<TournamentState> => {
      const { data, error } = await supabase
        .from("tournament_state")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data as unknown as TournamentState;
    },
    staleTime: 60_000,
  });
}

export function useMyPick(participantId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-pick", participantId],
    enabled: !!participantId,
    queryFn: async (): Promise<PickRow | null> => {
      const { data, error } = await supabase
        .from("picks")
        .select("*")
        .eq("participant_id", participantId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as PickRow) ?? null;
    },
  });
}

export function useSavePick(participantId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Pick<PickRow, "groups" | "group_k_matches" | "goleador_id" | "arquero_id">,
    ) => {
      if (!participantId) throw new Error("Sin participante");
      const { error } = await supabase.from("picks").upsert(
        {
          participant_id: participantId,
          groups: input.groups,
          group_k_matches: input.group_k_matches,
          goleador_id: input.goleador_id,
          arquero_id: input.arquero_id,
        },
        { onConflict: "participant_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-pick", participantId] });
      qc.invalidateQueries({ queryKey: ["polla-leaderboard"] });
    },
  });
}

export type LbRow = {
  participant_id: string;
  nombre: string;
  puntos_grupos: number;
  puntos_partidos: number;
  puntos_especiales: number;
  puntos_total: number;
  aciertos_5: number;
  aciertos_3: number;
  aciertos_2: number;
  posicion: number;
};

export function usePollaLeaderboard() {
  return useQuery({
    queryKey: ["polla-leaderboard"],
    queryFn: async (): Promise<LbRow[]> => {
      const { data, error } = await supabase.rpc("get_polla_leaderboard");
      if (error) throw error;
      return ((data ?? []) as LbRow[]).sort((a, b) => a.posicion - b.posicion);
    },
  });
}
