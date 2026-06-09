import { db } from "./adapter.server";
import type { UserRole } from "./types";

export const rolesRepo = {
  async listByUser(userId: string): Promise<UserRole[]> {
    const q = await db.from("user_roles");
    const { data, error } = await q.select("*").eq("user_id", userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async isAdmin(userId: string): Promise<boolean> {
    const q = await db.from("user_roles");
    const { data, error } = await q
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return !!data;
  },
};