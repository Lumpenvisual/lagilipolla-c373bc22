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
      admin_audit: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: string
          payload: Json | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      participants: {
        Row: {
          celular: string | null
          email: string | null
          estado_pago: string
          id: string
          inscripcion_at: string
          nombre: string
          user_id: string | null
        }
        Insert: {
          celular?: string | null
          email?: string | null
          estado_pago?: string
          id?: string
          inscripcion_at?: string
          nombre: string
          user_id?: string | null
        }
        Update: {
          celular?: string | null
          email?: string | null
          estado_pago?: string
          id?: string
          inscripcion_at?: string
          nombre?: string
          user_id?: string | null
        }
        Relationships: []
      }
      picks: {
        Row: {
          aciertos_2: number
          aciertos_3: number
          aciertos_5: number
          arquero_id: string | null
          goleador_id: string | null
          group_k_matches: Json
          groups: Json
          participant_id: string
          puntos_especiales: number
          puntos_grupos: number
          puntos_partidos: number
          puntos_total: number | null
          updated_at: string
        }
        Insert: {
          aciertos_2?: number
          aciertos_3?: number
          aciertos_5?: number
          arquero_id?: string | null
          goleador_id?: string | null
          group_k_matches?: Json
          groups?: Json
          participant_id: string
          puntos_especiales?: number
          puntos_grupos?: number
          puntos_partidos?: number
          puntos_total?: number | null
          updated_at?: string
        }
        Update: {
          aciertos_2?: number
          aciertos_3?: number
          aciertos_5?: number
          arquero_id?: string | null
          goleador_id?: string | null
          group_k_matches?: Json
          groups?: Json
          participant_id?: string
          puntos_especiales?: number
          puntos_grupos?: number
          puntos_partidos?: number
          puntos_total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "picks_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_state: {
        Row: {
          arquero_id: string | null
          arqueros: Json
          cuota_cop: number
          deadline: string
          goleador_id: string | null
          goleadores: Json
          group_k_matches: Json
          groups: Json
          id: number
          picks_locked_at: string
          updated_at: string
        }
        Insert: {
          arquero_id?: string | null
          arqueros?: Json
          cuota_cop?: number
          deadline?: string
          goleador_id?: string | null
          goleadores?: Json
          group_k_matches?: Json
          groups?: Json
          id?: number
          picks_locked_at?: string
          updated_at?: string
        }
        Update: {
          arquero_id?: string | null
          arqueros?: Json
          cuota_cop?: number
          deadline?: string
          goleador_id?: string | null
          goleadores?: Json
          group_k_matches?: Json
          groups?: Json
          id?: number
          picks_locked_at?: string
          updated_at?: string
        }
        Relationships: []
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
      calc_pick_points: { Args: { _pick_id: string }; Returns: undefined }
      comprobante_code: {
        Args: { _pid: string; _updated_at: string }
        Returns: string
      }
      get_comprobante_public: {
        Args: { _code: string }
        Returns: {
          codigo: string
          estado_pago: string
          nombre: string
          participant_id: string
          puntos_total: number
          updated_at: string
        }[]
      }
      get_polla_leaderboard: {
        Args: never
        Returns: {
          aciertos_2: number
          aciertos_3: number
          aciertos_5: number
          nombre: string
          participant_id: string
          posicion: number
          puntos_especiales: number
          puntos_grupos: number
          puntos_partidos: number
          puntos_total: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recalc_all_picks: { Args: never; Returns: number }
      reset_polla_demo: { Args: never; Returns: Json }
      seed_polla_demo: { Args: never; Returns: Json }
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
