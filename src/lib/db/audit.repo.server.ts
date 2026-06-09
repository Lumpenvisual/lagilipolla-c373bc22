import { db } from "./adapter.server";
import type { AdminAudit, AdminAuditInsert } from "./types";

export const auditRepo = {
  async log(entry: AdminAuditInsert): Promise<void> {
    const q = await db.from("admin_audit");
    const { error } = await q.insert(entry);
    if (error) throw new Error(error.message);
  },
  async recent(limit = 50): Promise<AdminAudit[]> {
    const q = await db.from("admin_audit");
    const { data, error } = await q
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};