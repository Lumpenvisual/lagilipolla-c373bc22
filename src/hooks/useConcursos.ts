import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LeaderboardRow } from "@/lib/prizes";
import type { Concurso, ConcursoOverview, Inscripcion, Modalidad, EstadoConcurso } from "@/lib/concursos";
import type { Match } from "@/hooks/useData";

/** Lobby overview: visible contests with aggregate counts (no PII). */
export function useConcursosOverview() {
  return useQuery({
    queryKey: ["concursos-overview"],
    queryFn: async (): Promise<ConcursoOverview[]> => {
      const { data, error } = await supabase.rpc("get_concursos_overview");
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        modalidad: c.modalidad as Modalidad,
        alcance: (c.alcance ?? {}) as Record<string, unknown>,
        cuota: Number(c.cuota),
        estado: c.estado as EstadoConcurso,
        deadline: c.deadline,
        jugadores: Number(c.jugadores),
        partidos: Number(c.partidos),
      }));
    },
  });
}

export function useConcurso(id: string | undefined) {
  return useQuery({
    queryKey: ["concurso", id],
    enabled: !!id,
    queryFn: async (): Promise<Concurso | null> => {
      const { data, error } = await supabase.from("concursos").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useConcursoMatches(id: string | undefined) {
  return useQuery({
    queryKey: ["concurso-matches", id],
    enabled: !!id,
    queryFn: async (): Promise<Match[]> => {
      const { data, error } = await supabase.rpc("get_concurso_matches", { _concurso_id: id! });
      if (error) throw error;
      return (data ?? []) as Match[];
    },
  });
}

export function useConcursoLeaderboard(id: string | undefined) {
  return useQuery({
    queryKey: ["concurso-leaderboard", id],
    enabled: !!id,
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase.rpc("get_concurso_leaderboard", { _concurso_id: id! });
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
}

/** Current player's enrollments (RLS scopes to their own rows). */
export function useMyInscripciones(participantId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-inscripciones", participantId],
    enabled: !!participantId,
    queryFn: async (): Promise<Inscripcion[]> => {
      const { data, error } = await supabase
        .from("inscripciones")
        .select("*")
        .eq("participant_id", participantId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}
