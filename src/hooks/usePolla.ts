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
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
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
      input: Pick<
        PickRow,
        "groups" | "group_k_matches" | "extra_matches" | "goleador_id" | "arquero_id"
      >,
    ) => {
      if (!participantId) throw new Error("Sin participante");
      const row = {
        participant_id: participantId,
        groups: input.groups,
        group_k_matches: input.group_k_matches,
        extra_matches: input.extra_matches ?? {},
        goleador_id: input.goleador_id,
        arquero_id: input.arquero_id,
      };
      // No usamos upsert: `INSERT ... ON CONFLICT DO UPDATE` dispara el trigger
      // BEFORE INSERT (TG_OP='INSERT', OLD nulo) ANTES de resolver el conflicto, y
      // enforce_picks_deadline trata cada marcador de un partido ya dentro de 24 h como
      // "cambio nuevo" (porque OLD es null) y lanza excepción aunque el valor no cambie.
      // Si la fila ya existe hacemos UPDATE (OLD real → los marcadores sin cambios no
      // disparan el bloqueo); si no, INSERT.
      const { data: existing, error: selErr } = await supabase
        .from("picks")
        .select("participant_id")
        .eq("participant_id", participantId)
        .maybeSingle();
      if (selErr) throw new Error(selErr.message);
      if (existing) {
        const { error } = await supabase
          .from("picks")
          .update(row)
          .eq("participant_id", participantId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("picks").insert(row);
        if (error) throw new Error(error.message);
      }
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
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
