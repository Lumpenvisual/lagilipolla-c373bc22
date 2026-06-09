// Limpia los datos demo de la BD vía sesión admin, llamando a la función
// reset_polla_demo() (existe hasta que la migración 220000 la elimine).
// Borra los 6 usuarios demoN@gilipolla.co + sus participants/picks (cascade).
// Uso: ADMIN_EMAIL=... ADMIN_PASS=... bun scripts/clean_demo.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
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
const sb = createClient(
  env.SUPABASE_URL || env.VITE_SUPABASE_URL,
  env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

const password = process.env.ADMIN_PASS;
if (!password) {
  console.error("Falta ADMIN_PASS");
  process.exit(2);
}
const { error: eAuth } = await sb.auth.signInWithPassword({
  email: process.env.ADMIN_EMAIL || "admin@gilipolla.co",
  password,
});
if (eAuth) {
  console.error("❌ Login admin falló:", eAuth.message);
  process.exit(1);
}
console.log("✅ Sesión admin iniciada");

const { data, error } = await sb.rpc("reset_polla_demo");
if (error) {
  console.error("❌ reset_polla_demo falló:", error.message);
  process.exit(1);
}
console.log("✅ reset_polla_demo:", JSON.stringify(data));

const { data: lb } = await sb.rpc("get_polla_leaderboard");
const demos = (lb || []).filter((r) => (r.nombre || "").startsWith("[DEMO]")).length;
console.log(`   Tabla ahora: ${lb?.length ?? 0} participantes · [DEMO] restantes: ${demos}`);
await sb.auth.signOut();
process.exit(demos === 0 ? 0 : 1);
