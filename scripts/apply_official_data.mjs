// Aplica los datos oficiales a tournament_state vía sesión de admin (RLS permite
// que el rol admin actualice). Reversible. Lee el JSON desde la migración (fuente única).
// Uso: ADMIN_EMAIL=... ADMIN_PASS=... bun scripts/apply_official_data.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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
const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

// JSON oficial desde la migración (single source of truth)
const sql = readFileSync(
  new URL("supabase/migrations/20260608221000_official_data_resolved.sql", root),
  "utf8",
);
const parts = sql.split("$JSON$");
const groups = JSON.parse(parts[1]);
const group_k_matches = JSON.parse(parts[3]);

const email = process.env.ADMIN_EMAIL || "admin@gilipolla.co";
const password = process.env.ADMIN_PASS;
if (!password) {
  console.error("Falta ADMIN_PASS");
  process.exit(2);
}

const sb = createClient(url, key);
const { error: eAuth } = await sb.auth.signInWithPassword({ email, password });
if (eAuth) {
  console.error("❌ Login admin falló:", eAuth.message);
  process.exit(1);
}
console.log("✅ Sesión admin iniciada:", email);

const { error: eUpd } = await sb
  .from("tournament_state")
  .update({ groups, group_k_matches, updated_at: new Date().toISOString() })
  .eq("id", 1);
if (eUpd) {
  console.error("❌ UPDATE falló:", eUpd.message);
  process.exit(1);
}
console.log("✅ tournament_state actualizado con datos oficiales");

// Verificación inmediata
const { data: ts } = await sb
  .from("tournament_state")
  .select("groups, group_k_matches")
  .eq("id", 1)
  .single();
console.log("   Grupo K:", ts.groups.K.teams.map((t) => t.nombre).join(", "));
const m6 = ts.group_k_matches.find((x) => x.id === "6");
console.log("   Partido 6:", m6.local, "vs", m6.visitante, "·", m6.sede);
await sb.auth.signOut();
