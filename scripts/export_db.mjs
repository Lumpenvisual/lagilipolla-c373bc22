// Export de la BD a la carpeta del repo (supabase/db-export/<fecha>/).
// Dump por tabla vía service_role (salta RLS) + auth.users (admin API).
// A diferencia de exports/ (gitignored, para backups locales), este SÍ se versiona:
// es un snapshot de datos para revisar/commitear. OJO: contiene datos de participantes.
// Uso: bun scripts/export_db.mjs
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
const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TABLES = [
  "user_roles",
  "participants",
  "picks",
  "pick_history",
  "admin_audit",
  "tournament_state",
];

const stamp = new Date()
  .toISOString()
  .slice(0, 16)
  .replace(/[-:T]/g, "")
  .replace(/(\d{8})(\d{4})/, "$1-$2");
const outDir = new URL(`supabase/db-export/${stamp}/`, root);
mkdirSync(outDir, { recursive: true });

const manifest = { generated_at: new Date().toISOString(), url, tables: {} };

for (const t of TABLES) {
  const { data, error, count } = await sb.from(t).select("*", { count: "exact" });
  if (error) {
    console.log(`❌ ${t}: ${error.message}`);
    manifest.tables[t] = { error: error.message };
    continue;
  }
  writeFileSync(new URL(`${t}.json`, outDir), JSON.stringify(data, null, 2));
  console.log(`✅ ${t}: ${count ?? data.length} filas`);
  manifest.tables[t] = { rows: count ?? data.length };
}

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
  manifest.tables["auth.users"] = { rows: users.length };
} catch (e) {
  console.log(`❌ auth.users: ${e.message}`);
  manifest.tables["auth.users"] = { error: e.message };
}

writeFileSync(new URL("_manifest.json", outDir), JSON.stringify(manifest, null, 2));
console.log(`\n📦 Export escrito en supabase/db-export/${stamp}/`);
