/**
 * E2E DEL ARREGLO — candado de picks_locked_at bloqueando recálculos sin sesión.
 * Transaccional, con ROLLBACK garantizado (patrón scripts/e2e_recalc_categorias.mjs):
 * un request al Management API = una transacción; termina con RAISE EXCEPTION →
 * ROLLBACK; NADA queda escrito.
 *
 * Verifica el estado VIGENTE de producción (con la migración
 * 20260722000000_deadline_solo_predicciones.sql ya aplicada — no la reaplica; si
 * algún día se ejecuta contra un entorno donde falte, el caso 1 fallará y lo dirá).
 *
 * Dentro de UNA transacción:
 *   0. Diagnóstico (no un assert duro): ¿el bug ORIGINAL sigue reproduciéndose?
 *      Se espera que NO — que calc_pick_points() sin sesión ya no dispare el
 *      candado. Se reporta en el payload final para que quede a la vista.
 *   1-4. Los 4 casos pedidos:
 *      1. Sin sesión, candado pasado: calc_pick_points() (UPDATE de solo puntaje) PASA.
 *      2. Sin sesión: UPDATE que toca goleador_id SIGUE rechazado.
 *      3. Como participante real (no admin), tras el cierre: SIGUE rechazado.
 *      4. Como admin: SIGUE pasando (bypass intacto).
 *   5. RAISE EXCEPTION 'E2E_OK {...}' → ROLLBACK: nada queda escrito.
 * Post-check por REST (service_role): totales de los 37 participantes idénticos.
 *
 * Uso: SUPABASE_PAT=sbp_... node scripts/e2e_deadline_solo_predicciones.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
if (!PAT) fail("Falta el PAT: SUPABASE_PAT=sbp_... o define SUPABASE_ACCESS_TOKEN en .env");
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
  return { ok: res.ok, status: res.status, text };
}

async function sums() {
  const res = await fetch(
    `${URL_}/rest/v1/picks?select=puntos_grupos,puntos_partidos,puntos_especiales,puntos_total`,
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
  );
  if (!res.ok) fail(`REST picks: ${res.status}`);
  const rows = await res.json();
  const s = (k) => rows.reduce((a, x) => a + (x[k] || 0), 0);
  return {
    filas: rows.length,
    grupos: s("puntos_grupos"),
    partidos: s("puntos_partidos"),
    especiales: s("puntos_especiales"),
    total: s("puntos_total"),
  };
}

console.log("== E2E: candado de picks_locked_at vs. recálculos sin sesión (post-fix) ==\n");
const before = await sums();
console.log(`✓ Sumas reales antes: ${JSON.stringify(before)}\n`);

const TEST_SQL = `
DO $e2e$
DECLARE
  admin_uuid uuid := '1e1fc0d6-c5c3-4a5f-90b1-9771538faab3';
  participant_user_id uuid := '984fdc6b-783e-4e78-a203-9d1b90a78d86';
  test_pick_id uuid := 'fa353f39-81bc-4929-b9a6-aa563a88462f'; -- Mauro Chef
  v_lock timestamptz;
  caught boolean;
  errmsg text;
  bug_reproduce boolean;
  payload jsonb;
BEGIN
  -- Confirmar que el candado global está realmente activo (si no, el test no
  -- reproduce el escenario real).
  SELECT picks_locked_at INTO v_lock FROM public.tournament_state WHERE id = 1;
  IF v_lock IS NULL OR now() < v_lock THEN
    RAISE EXCEPTION 'E2E_FAIL: picks_locked_at no está en el pasado (%), no reproduce el escenario', v_lock;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true); -- sin sesión (como Management API)

  -- CASO 0 (diagnóstico, no assert duro): ¿el bug ORIGINAL sigue reproduciéndose?
  -- Se espera que NO (la migración ya está aplicada) — se reporta en el payload.
  bug_reproduce := false;
  BEGIN
    PERFORM public.calc_pick_points(test_pick_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%planillas están cerradas%' THEN bug_reproduce := true; END IF;
  END;

  -- CASO 1: sin sesión, candado pasado, UPDATE de solo puntaje -> debe PASAR.
  caught := false;
  BEGIN
    PERFORM public.calc_pick_points(test_pick_id);
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  IF caught THEN
    RAISE EXCEPTION 'E2E_FAIL caso1: calc_pick_points() sin sesión SIGUE fallando (¿migración no aplicada?): %', errmsg;
  END IF;

  -- CASO 2: sin sesión, UPDATE que toca goleador_id -> debe SEGUIR rechazado.
  caught := false;
  BEGIN
    UPDATE public.picks SET goleador_id = goleador_id WHERE participant_id = test_pick_id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: UPDATE de goleador_id sin sesión PASÓ (debía rechazarse)';
  END IF;
  IF errmsg NOT LIKE '%planillas están cerradas%' THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: rechazado pero por otra razón: %', errmsg;
  END IF;

  -- CASO 3: como participante real (no admin), tras el cierre -> debe seguir rechazado.
  PERFORM set_config('request.jwt.claim.sub', participant_user_id::text, true);
  caught := false;
  BEGIN
    UPDATE public.picks SET goleador_id = goleador_id WHERE participant_id = test_pick_id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL caso3: UPDATE de goleador_id como participante PASÓ (debía rechazarse)';
  END IF;
  IF errmsg NOT LIKE '%planillas están cerradas%' THEN
    RAISE EXCEPTION 'E2E_FAIL caso3: rechazado pero por otra razón: %', errmsg;
  END IF;

  -- CASO 4: como admin -> debe seguir pasando (bypass intacto, sin cambios).
  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);
  caught := false;
  BEGIN
    UPDATE public.picks SET goleador_id = goleador_id WHERE participant_id = test_pick_id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  IF caught THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: UPDATE de goleador_id como admin fue RECHAZADO (no debía): %', errmsg;
  END IF;

  payload := jsonb_build_object(
    'picks_locked_at', v_lock,
    'bug_original_reproduce_hoy', bug_reproduce,
    'caso1_recalc_sin_sesion', 'pass',
    'caso2_prediccion_sin_sesion_rechazada', 'pass',
    'caso3_prediccion_participante_rechazada', 'pass',
    'caso4_prediccion_admin_pasa', 'pass'
  );
  RAISE EXCEPTION 'E2E_OK %', payload::text;
END $e2e$;
`;

const run = await mgmtQuery(TEST_SQL);
if (run.text.includes("E2E_OK")) {
  console.log("✅ E2E OK — los 4 casos verificados y transacción revertida (ROLLBACK):");
  const m = run.text.match(/E2E_OK\s*(\{.*?\})\s*(?:\\n|\n)CONTEXT/s);
  if (m) {
    try {
      const p = JSON.parse(m[1].replace(/\\"/g, '"'));
      console.log(`   · picks_locked_at (candado activo): ${p.picks_locked_at}`);
      console.log(
        `   · caso 0 (diagnóstico) — ¿el bug original sigue reproduciéndose?: ${p.bug_original_reproduce_hoy ? "SÍ ⚠️ (la migración NO está aplicada)" : "NO ✅ (arreglado)"}`,
      );
      console.log(`   · caso 1 — recálculo sin sesión PASA: ${p.caso1_recalc_sin_sesion}`);
      console.log(
        `   · caso 2 — predicción sin sesión SIGUE rechazada: ${p.caso2_prediccion_sin_sesion_rechazada}`,
      );
      console.log(
        `   · caso 3 — predicción como participante SIGUE rechazada: ${p.caso3_prediccion_participante_rechazada}`,
      );
      console.log(
        `   · caso 4 — predicción como admin SIGUE pasando: ${p.caso4_prediccion_admin_pasa}`,
      );
    } catch {
      console.log("   payload: " + run.text.slice(0, 600));
    }
  } else {
    console.log("   payload crudo: " + run.text.slice(0, 600));
  }
} else if (run.text.includes("E2E_FAIL")) {
  fail("Assert E2E falló:\n" + run.text.slice(0, 800));
} else {
  fail(`Respuesta inesperada (status ${run.status}):\n` + run.text.slice(0, 800));
}

const after = await sums();
if (JSON.stringify(before) !== JSON.stringify(after)) {
  fail(
    `¡Los puntos reales CAMBIARON! antes=${JSON.stringify(before)} después=${JSON.stringify(after)}`,
  );
}
console.log("\n✅ Post-check: producción intacta (sumas de los 37 participantes idénticas).");
