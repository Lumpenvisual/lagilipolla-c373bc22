import { db } from "./adapter.server";
import type { TournamentStateRow, TournamentStateUpdate } from "./types";

export const tournamentRepo = {
  async get(): Promise<TournamentStateRow | null> {
    const q = await db.from("tournament_state");
    const { data, error } = await q.select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
  async update(patch: TournamentStateUpdate): Promise<TournamentStateRow> {
    const q = await db.from("tournament_state");
    const { data, error } = await q.update(patch).eq("id", 1).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async setLock(when: Date | null): Promise<void> {
    await tournamentRepo.update({
      picks_locked_at: (when ?? new Date(2099, 0, 1)).toISOString(),
    });
  },
};