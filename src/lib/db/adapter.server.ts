// Server-only DB adapter. Today wraps supabaseAdmin (service-role).
// Tomorrow: swap the body to point at a different database (Postgres direct,
// another Supabase project, a REST API, etc.) WITHOUT touching repos or
// server functions that consume this module.
//
// CRITICAL: never import this file from client-reachable code. The `.server.ts`
// extension blocks it from client bundles. Always import lazily from inside a
// createServerFn `.handler()`:
//   const { db } = await import("@/lib/db/adapter.server");

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type DbClient = SupabaseClient<Database>;

let _client: DbClient | undefined;

export async function getDb(): Promise<DbClient> {
  if (_client) return _client;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  _client = supabaseAdmin;
  return _client;
}

// Convenience shorthand for repo modules.
export const db = {
  async from<T extends keyof Database["public"]["Tables"]>(table: T) {
    const c = await getDb();
    return c.from(table);
  },
  async rpc<T extends keyof Database["public"]["Functions"]>(
    fn: T,
    args?: Database["public"]["Functions"][T] extends { Args: infer A } ? A : never,
  ) {
    const c = await getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return c.rpc(fn as string, args as any);
  },
  async storage() {
    const c = await getDb();
    return c.storage;
  },
};