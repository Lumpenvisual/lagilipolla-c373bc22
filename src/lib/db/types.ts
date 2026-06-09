// Re-exports of generated row types so consumers don't import deep paths.
import type { Database } from "@/integrations/supabase/types";

type T = Database["public"]["Tables"];

export type Participant = T["participants"]["Row"];
export type ParticipantInsert = T["participants"]["Insert"];
export type ParticipantUpdate = T["participants"]["Update"];

export type Pick = T["picks"]["Row"];
export type PickInsert = T["picks"]["Insert"];
export type PickUpdate = T["picks"]["Update"];

export type TournamentStateRow = T["tournament_state"]["Row"];
export type TournamentStateUpdate = T["tournament_state"]["Update"];

export type UserRole = T["user_roles"]["Row"];
export type AdminAudit = T["admin_audit"]["Row"];
export type AdminAuditInsert = T["admin_audit"]["Insert"];