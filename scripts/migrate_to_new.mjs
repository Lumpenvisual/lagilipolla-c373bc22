// Migración fqcvxlkgmkoahknbwlqu (viejo) → tkemdabazwkvkwokdosd (nuevo).
// SOLO esquema + tournament_state (sin participantes/picks/auth, por decisión del usuario).
// Conecta vía Bun SQL nativo con la connection string del NUEVO en $PGURL.
// Uso: PGURL="postgresql://postgres.<ref>:<pass>@...pooler.supabase.com:5432/postgres" bun scripts/migrate_to_new.mjs
import { SQL } from "bun";
import { readFileSync } from "node:fs";

const PGURL = process.env.PGURL;
if (!PGURL) {
  console.error("❌ Falta $PGURL (connection string del proyecto NUEVO)");
  process.exit(2);
}

const root = new URL("../", import.meta.url);
const schemaSql = readFileSync(new URL("supabase/schema.snapshot.sql", root), "utf8");
const tsDump = JSON.parse(
  readFileSync(new URL("exports/dump-VIEJO-anon-20260610/tournament_state.json", root), "utf8"),
)[0];

const db = new SQL(PGURL);

// 1) Crear todo el esquema (38 migraciones concatenadas). Protocolo simple = multi-statement.
console.log("⏳ Aplicando esquema (38 migraciones)…");
await db.unsafe(schemaSql).simple();
console.log("✅ Esquema aplicado");

// 2) Cargar la config del torneo (upsert al singleton id=1)
console.log("⏳ Cargando tournament_state…");
await db`
  insert into public.tournament_state
    (id, groups, group_k_matches, goleadores, arqueros, goleador_id, arquero_id,
     deadline, cuota_cop, picks_locked_at, phases, extra_matches, visibility)
  values
    (1, ${tsDump.groups}, ${tsDump.group_k_matches}, ${tsDump.goleadores}, ${tsDump.arqueros},
     ${tsDump.goleador_id}, ${tsDump.arquero_id}, ${tsDump.deadline}, ${tsDump.cuota_cop},
     ${tsDump.picks_locked_at}, ${tsDump.phases}, ${tsDump.extra_matches}, ${tsDump.visibility})
  on conflict (id) do update set
    groups = excluded.groups, group_k_matches = excluded.group_k_matches,
    goleadores = excluded.goleadores, arqueros = excluded.arqueros,
    goleador_id = excluded.goleador_id, arquero_id = excluded.arquero_id,
    deadline = excluded.deadline, cuota_cop = excluded.cuota_cop,
    picks_locked_at = excluded.picks_locked_at, phases = excluded.phases,
    extra_matches = excluded.extra_matches, visibility = excluded.visibility
`;
console.log("✅ tournament_state cargado");

// 3) Verificación
const tabs =
  await db`select count(*)::int n from information_schema.tables where table_schema='public'`;
const ts = await db`select id, cuota_cop from public.tournament_state where id=1`;
console.log(`\n📊 Tablas en public: ${tabs[0].n} · tournament_state cuota=${ts[0]?.cuota_cop}`);
await db.end();
console.log("🎉 Migración de esquema + config completa.");
