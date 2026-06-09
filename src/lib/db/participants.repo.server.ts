import { db } from "./adapter.server";
import type { Participant, ParticipantInsert, ParticipantUpdate } from "./types";

export const participantsRepo = {
  async list(): Promise<Participant[]> {
    const q = await db.from("participants");
    const { data, error } = await q.select("*").order("inscripcion_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async getById(id: string): Promise<Participant | null> {
    const q = await db.from("participants");
    const { data, error } = await q.select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
  async getByUserId(userId: string): Promise<Participant | null> {
    const q = await db.from("participants");
    const { data, error } = await q.select("*").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
  async create(values: ParticipantInsert): Promise<Participant> {
    const q = await db.from("participants");
    const { data, error } = await q.insert(values).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async update(id: string, patch: ParticipantUpdate): Promise<Participant> {
    const q = await db.from("participants");
    const { data, error } = await q.update(patch).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async setEstadoPago(id: string, estado: "pendiente" | "aprobado" | "rechazado") {
    return participantsRepo.update(id, { estado_pago: estado });
  },
  async remove(id: string): Promise<void> {
    const q = await db.from("participants");
    const { error } = await q.delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};