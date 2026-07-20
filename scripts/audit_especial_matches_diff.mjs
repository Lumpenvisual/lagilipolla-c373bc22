/**
 * AUDITORÍA (T7 · sección 2) — diferencial SQL vs TS de la regla de especiales.
 *
 * `public.especial_matches()` (SQL, migración 20260720010000) y `especialMatches()`
 * (TS, src/lib/polla.ts) deben decidir EXACTAMENTE lo mismo — el primero paga puntos
 * reales, el segundo pinta el badge "+10" en el leaderboard. La regla cambió tres
 * veces en un día (20260719220000 → 20260720000000 → 20260720010000) editando ambos
 * lados en paralelo: este script es la prueba de que no divergieron.
 *
 * SOLO LECTURA: SELECT contra picks/tournament_state (REST con service_role) +
 * SELECT public.especial_matches(...) (Management API, sin escritura). No escribe
 * nada. Compara contra especialMatches() importado en vivo desde src/lib/polla.ts
 * (no una copia pegada — si el archivo cambia, el script lo usa tal cual está).
 *
 * Cubre:
 *   1. Los 74 pares reales de producción: (picks.goleador_id, tournament_state.goleador_id)
 *      y (picks.arquero_id, tournament_state.arquero_id) para los 37 aprobados.
 *   2. Los 20 casos de la tabla de tests (src/lib/__tests__/polla-validation.test.ts,
 *      describe "especialMatches") — mantener sincronizado a mano con ese archivo.
 *
 * Cualquier discrepancia se REPORTA, no se corrige aquí.
 *
 * Uso: bun scripts/audit_especial_matches_diff.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { especialMatches } from "../src/lib/polla.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const URL_ = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const PAT = process.env.SUPABASE_PAT || env.SUPABASE_ACCESS_TOKEN;
if (!URL_ || !SERVICE) fail("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env");
if (!PAT) fail("Falta el PAT: SUPABASE_PAT=sbp_... o SUPABASE_ACCESS_TOKEN en .env");
const REF = new URL(URL_).hostname.split(".")[0];

function fail(msg) {
  console.error("❌ " + msg);
  process.exit(1);
}

async function mgmtQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) fail(`Management API ${res.status}: ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text);
  } catch {
    fail(`Respuesta no-JSON del Management API: ${text.slice(0, 400)}`);
  }
}

// ---------- 1) Pares reales de producción (solo lectura, REST) ----------
async function restGet(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!res.ok) fail(`REST ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const picks = await restGet(
  "picks?select=participant_id,goleador_id,arquero_id&order=participant_id",
);
const [ts] = await restGet("tournament_state?id=eq.1&select=goleador_id,arquero_id");
if (!ts) fail("No se pudo leer tournament_state id=1");

const realPairs = [];
for (const p of picks) {
  realPairs.push({
    label: `pick ${p.participant_id} · goleador`,
    pick: p.goleador_id,
    oficial: ts.goleador_id,
  });
  realPairs.push({
    label: `pick ${p.participant_id} · arquero`,
    pick: p.arquero_id,
    oficial: ts.arquero_id,
  });
}
console.log(`✓ ${picks.length} picks reales → ${realPairs.length} pares (goleador+arquero)`);
console.log(
  `✓ Oficiales vigentes: goleador=${JSON.stringify(ts.goleador_id)} arquero=${JSON.stringify(ts.arquero_id)}`,
);

// ---------- 2) Casos de la tabla de tests (espejo manual de polla-validation.test.ts) ----------
const GOL = "Kylian Mbappé (Francia)";
const ARQ = "Unai Simón (España)";
const testPairs = [
  {
    label: "a) mayúsculas/acentos/espacios (goleador)",
    pick: "kylian mbappe (FRANCIA)",
    oficial: GOL,
    expected: true,
  },
  {
    label: "a) mayúsculas/acentos/espacios (arquero)",
    pick: "Unai Simón (España)",
    oficial: ARQ,
    expected: true,
  },
  {
    label: "a) nombre igual sin selección del oficial",
    pick: "Kylian Mbappé (Francia)",
    oficial: "Kylian Mbappé",
    expected: true,
  },
  {
    label: "b) typo pequeño + selección (Cuculeitodelbalon)",
    pick: "Kyllan Mbappé (Francia)",
    oficial: GOL,
    expected: true,
  },
  {
    label: "c) apellido solo + selección coincidente",
    pick: "Mbappe (Francia)",
    oficial: GOL,
    expected: true,
  },
  {
    label: "c) apellido solo SIN selección en el pick",
    pick: "Mbappe",
    oficial: GOL,
    expected: false,
  },
  {
    label: "c) apellido solo SIN selección en el oficial",
    pick: "Mbappe (Francia)",
    oficial: "Kylian Mbappé",
    expected: false,
  },
  {
    label: "nombre legal completo (Kane)",
    pick: "Harry Edward Kane (Inglaterra)",
    oficial: "Harry Kane (Inglaterra)",
    expected: true,
  },
  {
    label: "nombre legal completo (Martínez)",
    pick: "Damián Emiliano Martínez (Argentina)",
    oficial: "Emiliano Martínez (Argentina)",
    expected: true,
  },
  {
    label: "typo en selección tolerado (Brasill)",
    pick: "Alisson Becker (Brasill)",
    oficial: "Alisson Becker (Brasil)",
    expected: true,
  },
  {
    label: "alias Holanda ≡ Países Bajos",
    pick: "Verbruggen (Holanda)",
    oficial: "Bart Verbruggen (Países Bajos)",
    expected: true,
  },
  {
    label: "otro jugador (Kane vs Mbappé)",
    pick: "Harry Kane (Inglaterra)",
    oficial: GOL,
    expected: false,
  },
  {
    label: "otro jugador (Haaland vs Mbappé)",
    pick: "Erling Haaland (Noruega)",
    oficial: GOL,
    expected: false,
  },
  {
    label: "selección contradictoria (Verbruggen vs Simón)",
    pick: "Verbruggen (Holanda)",
    oficial: ARQ,
    expected: false,
  },
  {
    label: "otro jugador (Martínez vs Simón)",
    pick: "Emiliano Martínez (Argentina)",
    oficial: ARQ,
    expected: false,
  },
  {
    label: "otro jugador mismo apellido (Lautaro vs Emiliano Martínez)",
    pick: "Lautaro Martínez (Argentina)",
    oficial: "Emiliano Martínez (Argentina)",
    expected: false,
  },
  { label: "pick null", pick: null, oficial: GOL, expected: false },
  { label: "pick vacío", pick: "", oficial: GOL, expected: false },
  { label: "oficial null", pick: GOL, oficial: null, expected: false },
  { label: "pick de solo espacios", pick: "   ", oficial: GOL, expected: false },
];
console.log(`✓ ${testPairs.length} casos de la tabla de tests cargados`);

// ---------- 3) SQL: especial_matches() en un solo batch (evita 94 round-trips) ----------
function sqlLit(v) {
  if (v == null) return "NULL::text";
  return `'${String(v).replace(/'/g, "''")}'`;
}
const allPairs = [...realPairs, ...testPairs];
const values = allPairs
  .map((p, i) => `(${i}, ${sqlLit(p.pick)}, ${sqlLit(p.oficial)})`)
  .join(",\n  ");
const batchSql = `
SELECT t.i, public.especial_matches(t.pick_text, t.oficial_text) AS sql_result
FROM (VALUES\n  ${values}\n) AS t(i, pick_text, oficial_text)
ORDER BY t.i;`;
const sqlRows = await mgmtQuery(batchSql);
if (!Array.isArray(sqlRows) || sqlRows.length !== allPairs.length) {
  fail(`Respuesta SQL inesperada: ${JSON.stringify(sqlRows).slice(0, 300)}`);
}
const sqlByIndex = new Map(sqlRows.map((r) => [Number(r.i), r.sql_result]));

// ---------- 4) Comparar SQL vs TS (y vs el esperado de la tabla de tests) ----------
const mismatches = [];
const testFileFailures = [];
allPairs.forEach((p, i) => {
  const sqlResult = sqlByIndex.get(i);
  const tsResult = especialMatches(p.pick, p.oficial);
  if (sqlResult !== tsResult) {
    mismatches.push({ ...p, sqlResult, tsResult });
  }
  if ("expected" in p && tsResult !== p.expected) {
    testFileFailures.push({ ...p, tsResult });
  }
});

console.log(`\n=== Resultado: ${allPairs.length} pares comparados ===`);
if (mismatches.length === 0) {
  console.log("✅ SQL y TS coinciden en TODOS los pares (74 reales + 20 de la tabla de tests).");
} else {
  console.log(`❌ ${mismatches.length} DISCREPANCIA(S) SQL vs TS:`);
  for (const m of mismatches) {
    console.log(
      `   · ${m.label}: pick=${JSON.stringify(m.pick)} oficial=${JSON.stringify(m.oficial)} → SQL=${m.sqlResult} TS=${m.tsResult}`,
    );
  }
}
if (testFileFailures.length) {
  console.log(
    `\n⚠️ ${testFileFailures.length} caso(s) NO coinciden con el "expected" de este script`,
  );
  console.log(
    "   (revisar si este script quedó desincronizado de polla-validation.test.ts, no la regla):",
  );
  for (const f of testFileFailures) {
    console.log(`   · ${f.label}: esperado=${f.expected} TS_real=${f.tsResult}`);
  }
}

process.exit(mismatches.length ? 1 : 0);
