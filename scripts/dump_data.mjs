// Dump COMPLETO de los datos vía service_role (salta RLS). Escribe un JSON por
// tabla en exports/dump-<fecha>/ + un índice con conteos. Solo lectura.
// Uso: bun scripts/dump_data.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const env = Object.fromEntries(
  readFileSync(new URL(".env", root), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^"|"$/g, ""),
      ];
    }),
);

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error("❌ Falta SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(2);
}
console.log("Supabase URL:", url);

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TABLES = [
  "user_roles",
  "participants",
  "matches",
  "predictions",
  "concursos",
  "inscripciones",
  "demo_seed",
  "tournament_state",
  "picks",
  "admin_audit",
  "pick_history",
];

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const outDir = new URL(`exports/dump-${stamp}/`, root);
mkdirSync(outDir, { recursive: true });

const index = { generated_at: new Date().toISOString(), url, tables: {} };

for (const t of TABLES) {
  const { data, error, count } = await sb.from(t).select("*", { count: "exact" });
  if (error) {
    console.log(`❌ ${t}: ${error.message}`);
    index.tables[t] = { error: error.message };
    continue;
  }
  writeFileSync(new URL(`${t}.json`, outDir), JSON.stringify(data, null, 2));
  console.log(`✅ ${t}: ${count ?? data.length} filas`);
  index.tables[t] = { rows: count ?? data.length };
}

// auth.users vía admin API (no accesible por la Data API normal)
try {
  const { data: au, error: ae } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (ae) throw ae;
  const users = au.users.map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    user_metadata: u.user_metadata,
  }));
  writeFileSync(new URL("auth_users.json", outDir), JSON.stringify(users, null, 2));
  console.log(`✅ auth.users: ${users.length} usuarios`);
  index.tables["auth.users"] = { rows: users.length };
} catch (e) {
  console.log(`❌ auth.users: ${e.message}`);
  index.tables["auth.users"] = { error: e.message };
}

writeFileSync(new URL("_index.json", outDir), JSON.stringify(index, null, 2));
console.log(`\n📦 Dump escrito en exports/dump-${stamp}/`);
