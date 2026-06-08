export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      concursos: {
        Row: {
          alcance: Json
          created_at: string
          cuota: number
          deadline: string | null
          estado: string
          id: string
          modalidad: string
          nombre: string
          updated_at: string
        }
        Insert: {
          alcance?: Json
          created_at?: string
          cuota?: number
          deadline?: string | null
          estado?: string
          id?: string
          modalidad: string
          nombre: string
          updated_at?: string
        }
        Update: {
          alcance?: Json
          created_at?: string
          cuota?: number
          deadline?: string | null
          estado?: string
          id?: string
          modalidad?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      demo_seed: {
        Row: {
          created_at: string
          id: string
          kind: string
          ref_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          ref_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          ref_id?: string
        }
        Relationships: []
      }
      inscripciones: {
        Row: {
          concurso_id: string
          estado_pago: string
          id: string
          joined_at: string
          participant_id: string
        }
        Insert: {
          concurso_id: string
          estado_pago?: string
          id?: string
          joined_at?: string
          participant_id: string
        }
        Update: {
          concurso_id?: string
          estado_pago?: string
          id?: string
          joined_at?: string
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inscripciones_concurso_id_fkey"
            columns: ["concurso_id"]
            isOneToOne: false
            referencedRelation: "concursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          equipo_local: string
          equipo_visitante: string
          estadio: string
          fase: string
          goles_local: number | null
          goles_visitante: number | null
          grupo: string
          id: number
          jornada: number
          kickoff_time: string
          numero_partido: number
        }
        Insert: {
          equipo_local: string
          equipo_visitante: string
          estadio: string
          fase?: string
          goles_local?: number | null
          goles_visitante?: number | null
          grupo: string
          id?: number
          jornada: number
          kickoff_time: string
          numero_partido: number
        }
        Update: {
          equipo_local?: string
          equipo_visitante?: string
          estadio?: string
          fase?: string
          goles_local?: number | null
          goles_visitante?: number | null
          grupo?: string
          id?: number
          jornada?: number
          kickoff_time?: string
          numero_partido?: number
        }
        Relationships: []
      }
      participants: {
        Row: {
          email: string | null
          estado_pago: string
          id: string
          inscripcion_at: string
          nombre: string
          user_id: string | null
        }
        Insert: {
          email?: string | null
          estado_pago?: string
          id?: string
          inscripcion_at?: string
          nombre: string
          user_id?: string | null
        }
        Update: {
          email?: string | null
          estado_pago?: string
          id?: string
          inscripcion_at?: string
          nombre?: string
          user_id?: string | null
        }
        Relationships: []
      }
      predictions: {
        Row: {
          goles_local_pred: number | null
          goles_visitante_pred: number | null
          id: string
          match_id: number
          participant_id: string
          puntos_obtenidos: number
          submitted_at: string
        }
        Insert: {
          goles_local_pred?: number | null
          goles_visitante_pred?: number | null
          id?: string
          match_id: number
          participant_id: string
          puntos_obtenidos?: number
          submitted_at?: string
        }
        Update: {
          goles_local_pred?: number | null
          goles_visitante_pred?: number | null
          id?: string
          match_id?: number
          participant_id?: string
          puntos_obtenidos?: number
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_concursos: {
        Args: { _include_partidos?: boolean }
        Returns: number
      }
      get_concurso_leaderboard: {
        Args: { _concurso_id: string }
        Returns: {
          exactos: number
          ganadores: number
          nombre: string
          participant_id: string
          posicion: number
          total_puntos: number
        }[]
      }
      get_concurso_matches: {
        Args: { _concurso_id: string }
        Returns: {
          equipo_local: string
          equipo_visitante: string
          estadio: string
          fase: string
          goles_local: number | null
          goles_visitante: number | null
          grupo: string
          id: number
          jornada: number
          kickoff_time: string
          numero_partido: number
        }[]
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_concursos_overview: {
        Args: never
        Returns: {
          alcance: Json
          cuota: number
          deadline: string
          estado: string
          id: string
          jugadores: number
          modalidad: string
          nombre: string
          partidos: number
        }[]
      }
      get_leaderboard: {
        Args: never
        Returns: {
          exactos: number
          ganadores: number
          nombre: string
          participant_id: string
          posicion: number
          total_puntos: number
        }[]
      }
      get_participant_predictions: {
        Args: { _participant_id: string }
        Returns: {
          equipo_local: string
          equipo_visitante: string
          goles_local: number
          goles_local_pred: number
          goles_visitante: number
          goles_visitante_pred: number
          grupo: string
          jornada: number
          kickoff_time: string
          match_id: number
          numero_partido: number
          puntos_obtenidos: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reset_demo_data: { Args: never; Returns: Json }
      seed_demo_data: {
        Args: {
          _include_partidos?: boolean
          _players?: number
          _result_pct?: number
        }
        Returns: Json
      }
      selftest_concursos: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          passed: boolean
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
