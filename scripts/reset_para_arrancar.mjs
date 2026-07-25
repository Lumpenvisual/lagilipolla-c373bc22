// Reset completo para "arrancar de cero": borra todos los usuarios (participants, picks,
// pick_history, revancha_picks, user_roles, auth.users) EXCEPTO el admin, y deja los
// resultados oficiales de tournament_state en blanco — preservando equipos, fechas, sedes,
// fases y visibilidad (mismo criterio documentado en la skill gilipolla-ops). La Revancha
// vuelve también a su estado inicial: revancha_abierta=false, revancha_locked_at al default
// original de la migración de esquema.
//
// Confirmado con el usuario antes de ejecutar (backup ya generado en
// supabase/db-export/<fecha>/ vía scripts/export_db.mjs).
//
// Uso: bun scripts/reset_para_arrancar.mjs
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
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error("❌ Falta SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(2);
}
const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_EMAIL = "admin@gilipolla.co";

console.log("== Reset completo: usuarios a cero + tournament_state en blanco ==\n");

// 1) Borrar todos los auth.users EXCEPTO el admin. ON DELETE CASCADE se encarga de
//    participants -> picks / pick_history / revancha_picks / user_roles.
const { data: usersPage, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error("❌ listUsers:", listErr.message);
  process.exit(1);
}
const toDelete = usersPage.users.filter((u) => u.email !== ADMIN_EMAIL);
console.log(`Usuarios a borrar: ${toDelete.length} (de ${usersPage.users.length} totales)`);

let deleted = 0;
let failed = 0;
for (const u of toDelete) {
  const { error } = await sb.auth.admin.deleteUser(u.id);
  if (error) {
    console.error(`❌ no se pudo borrar ${u.email}: ${error.message}`);
    failed++;
  } else {
    deleted++;
  }
}
console.log(`✅ auth.users borrados: ${deleted} (fallidos: ${failed})`);

// Por si quedó algún participant huérfano (sin user_id, o cuyo auth.user ya no existía).
const { error: orphanErr, count: orphanCount } = await sb
  .from("participants")
  .delete({ count: "exact" })
  .is("user_id", null);
if (orphanErr) console.error("❌ borrando participants huérfanos:", orphanErr.message);
else console.log(`✅ participants huérfanos (sin user_id) borrados: ${orphanCount ?? 0}`);

// 2) tournament_state: resultados oficiales en blanco, estructura preservada.
const { data: tsRows, error: tsSelErr } = await sb
  .from("tournament_state")
  .select("*")
  .eq("id", 1)
  .single();
if (tsSelErr) {
  console.error("❌ leyendo tournament_state:", tsSelErr.message);
  process.exit(1);
}

const blankGroups = Object.fromEntries(
  Object.entries(tsRows.groups).map(([k, g]) => [k, { ...g, pos1: null, pos2: null }]),
);
const blankGroupK = (tsRows.group_k_matches ?? []).map((m) => ({ ...m, gh: null, ga: null }));
const blankExtra = (tsRows.extra_matches ?? []).map((m) => ({ ...m, gh: null, ga: null }));

const { error: tsUpdErr } = await sb
  .from("tournament_state")
  .update({
    groups: blankGroups,
    group_k_matches: blankGroupK,
    extra_matches: blankExtra,
    goleador_id: null,
    arquero_id: null,
    revancha_abierta: false,
    revancha_locked_at: "2026-07-14T14:00:00-04:00", // default original de la migración de esquema
  })
  .eq("id", 1);
if (tsUpdErr) {
  console.error("❌ actualizando tournament_state:", tsUpdErr.message);
  process.exit(1);
}
console.log(
  "✅ tournament_state: resultados oficiales en blanco (equipos/fechas/sedes/fases/visibilidad intactos).",
);

// 3) Post-check.
const [{ count: partCount }, { count: pickCount }, { count: rpCount }, { data: authAfter }] =
  await Promise.all([
    sb.from("participants").select("*", { count: "exact", head: true }),
    sb.from("picks").select("*", { count: "exact", head: true }),
    sb.from("revancha_picks").select("*", { count: "exact", head: true }),
    sb.auth.admin.listUsers({ perPage: 1000 }),
  ]);

console.log("\n== Post-check ==");
console.log(`participants: ${partCount}`);
console.log(`picks: ${pickCount}`);
console.log(`revancha_picks: ${rpCount}`);
console.log(`auth.users restantes: ${authAfter.users.map((u) => u.email).join(", ")}`);

if (partCount !== 0 || pickCount !== 0 || rpCount !== 0) {
  console.error("\n⚠️  Quedaron filas — revisar antes de dar por cerrado el reset.");
  process.exit(1);
}
if (authAfter.users.length !== 1 || authAfter.users[0].email !== ADMIN_EMAIL) {
  console.error("\n⚠️  auth.users no quedó solo con el admin — revisar.");
  process.exit(1);
}
console.log(
  "\n✅ Reset completo: 0 participants/picks/revancha_picks, solo el admin en auth.users.",
);
