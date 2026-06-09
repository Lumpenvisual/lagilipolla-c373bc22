import { db } from "./adapter.server";
import type { Pick, PickInsert, PickUpdate } from "./types";

export const picksRepo = {
  async getByParticipant(participantId: string): Promise<Pick | null> {
    const q = await db.from("picks");
    const { data, error } = await q
      .select("*")
      .eq("participant_id", participantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
  async upsert(values: PickInsert): Promise<Pick> {
    const q = await db.from("picks");
    const { data, error } = await q
      .upsert(values, { onConflict: "participant_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async update(participantId: string, patch: PickUpdate): Promise<Pick> {
    const q = await db.from("picks");
    const { data, error } = await q
      .update(patch)
      .eq("participant_id", participantId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async listAll(): Promise<Pick[]> {
    const q = await db.from("picks");
    const { data, error } = await q.select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async recalcAll(): Promise<number> {
    const { data, error } = await db.rpc("recalc_all_picks");
    if (error) throw new Error(error.message);
    return (data as number) ?? 0;
  },
};