/**
 * E2E de la migración PROPUESTA (no aplicada) — supabase/migrations_propuestas/
 * 20260727000000_revancha_recalc_y_cuota_propuesta.sql — recálculo automático de La
 * Revancha + cuota configurable.
 *
 * Transaccional, con ROLLBACK garantizado (patrón de siempre): el archivo de la migración
 * entero viaja como DDL de nivel superior en el MISMO request que el DO final que fuerza el
 * rollback.
 *
 * Dentro de esa transacción:
 *   0. Snapshot PRE: leaderboard principal + sumas de picks + el marcador oficial real de
 *      m101 (semis), capturado dinámicamente (no hardcodeado) para poder revertirlo.
 *   1. Aplica la migración completa.
 *   2. Setup (como admin): un participante ficticio con una planilla de Revancha, prediciendo
 *      m101 EXACTO al oficial original (5 pts garantizados sin adivinar nada).
 *   3. CASO 1 — cambiar el marcador oficial de m101 dispara el recálculo de AMBAS
 *      competencias: las sumas de `picks` se mueven (la polla principal recalculó) Y
 *      revancha_picks.puntos del fantasma pasa a valer exactamente lo que devuelve
 *      _match_pts(nuevo_oficial, prediccion) — no un valor adivinado a mano, la verdad
 *      calculada por la misma función que usa calc_revancha_points.
 *   4. CASO 2 — fault injection: se rompe calc_revancha_points a propósito (RAISE EXCEPTION
 *      incondicional) y se vuelve a cambiar el oficial. El UPDATE de tournament_state NO
 *      debe fallar, los puntos de `picks` SÍ deben recalcular correctamente, y
 *      revancha_picks.puntos del fantasma debe quedar SIN TOCAR (prueba que el fallo se
 *      atrapó de verdad, no que "pasó igual" con datos viejos). Se restaura la función real
 *      después.
 *   5. CASO 3 — hallazgo #20 en vivo: sin sesión de admin, se cambia el oficial de nuevo;
 *      revancha_picks SÍ se recalcula correctamente (SECURITY DEFINER, sin depender de rol).
 *   6. Se revierte m101 a su valor oficial real original (capturado en el paso 0).
 *   7. CASO 4 — sumas de control de picks: 1285/2381/180/3846.
 *   8. CASO 5 — get_polla_leaderboard() sigue con las mismas 37 filas que el snapshot PRE.
 *   9. RAISE EXCEPTION 'E2E_OK {...}' → ROLLBACK de TODO.
 * Post-check por REST: sumas de picks intactas. Post-check por Management API: los objetos
 * nuevos (trigger, funciones, columna) NO quedaron aplicados.
 *
 * Uso: SUPABASE_PAT=sbp_... node scripts/e2e_revancha_recalc.mjs
 * (o con SUPABASE_ACCESS_TOKEN en .env)
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
if (!PAT)
  fail("Falta el PAT: pásalo como SUPABASE_PAT=sbp_... o define SUPABASE_ACCESS_TOKEN en .env");
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

console.log("== E2E migración propuesta: recálculo + cuota de La Revancha (ROLLBACK) ==\n");
const before = await sums();
console.log(
  `✓ Sumas reales antes: grupos=${before.grupos} partidos=${before.partidos} especiales=${before.especiales} total=${before.total} (${before.filas} filas)\n`,
);

const migrationSql = readFileSync(
  join(root, "supabase/migrations_propuestas/20260727000000_revancha_recalc_y_cuota_propuesta.sql"),
  "utf8",
);

const TEST_SQL = `
-- 0) Snapshot PRE-migración.
CREATE TEMP TABLE _pre_lb AS SELECT * FROM public.get_polla_leaderboard();

-- 1) La migración propuesta completa, tal cual el archivo.
${migrationSql}

-- 2) El resto del E2E, en un DO que termina forzando ROLLBACK de TODO lo anterior.
DO $e2e$
DECLARE
  admin_uuid uuid := '1e1fc0d6-c5c3-4a5f-90b1-9771538faab3';
  ghost_id uuid;
  orig_m101 jsonb;
  mutated_m101 jsonb;
  new_oh int;
  expected_pts int;
  ghost_puntos int;
  ghost_puntos_before_break int;
  pre_partidos numeric; post_partidos numeric;
  caught boolean; errmsg text;
  diff_a int; diff_b int;
BEGIN
  -- ===== Setup: capturar el oficial REAL de m101 (semis), sin adivinar nada =====
  SELECT m INTO orig_m101
    FROM jsonb_array_elements((SELECT extra_matches FROM public.tournament_state WHERE id=1)) m
   WHERE m->>'id' = 'm101';
  IF orig_m101 IS NULL THEN
    RAISE EXCEPTION 'E2E_SETUP_FAIL: no se encontro el partido m101 en extra_matches';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);

  INSERT INTO public.participants (nombre, estado_pago, estado_pago_revancha)
  VALUES ('E2E Fantasma Recalc', 'pendiente', 'aprobado')
  RETURNING id INTO ghost_id;

  -- Predicción EXACTA al oficial original -> 5 pts garantizados, sin adivinar.
  INSERT INTO public.revancha_picks (participant_id, extra_matches)
  VALUES (ghost_id, jsonb_build_object('m101', orig_m101));

  -- ===== CASO 1: cambiar el oficial de m101 dispara AMBAS cascadas =====
  SELECT sum(puntos_partidos) INTO pre_partidos FROM public.picks;

  new_oh := (COALESCE((orig_m101->>'gh')::int, 0) + 1) % 10;
  mutated_m101 := orig_m101 || jsonb_build_object('gh', new_oh);
  expected_pts := public._match_pts(mutated_m101, orig_m101); -- verdad calculada, no adivinada

  UPDATE public.tournament_state
     SET extra_matches = (
       SELECT jsonb_agg(CASE WHEN e->>'id' = 'm101' THEN mutated_m101 ELSE e END)
       FROM jsonb_array_elements(extra_matches) e)
   WHERE id = 1;

  SELECT sum(puntos_partidos) INTO post_partidos FROM public.picks;
  IF post_partidos = pre_partidos THEN
    RAISE EXCEPTION 'E2E_FAIL caso1: las sumas de picks.puntos_partidos NO se movieron -- el recalculo de la polla principal no disparo';
  END IF;

  SELECT puntos INTO ghost_puntos FROM public.revancha_picks WHERE participant_id = ghost_id;
  IF ghost_puntos IS DISTINCT FROM expected_pts THEN
    RAISE EXCEPTION 'E2E_FAIL caso1: revancha_picks del fantasma no recalculo bien (esperado=%, real=%)', expected_pts, ghost_puntos;
  END IF;

  -- ===== CASO 2: fault injection -- calc_revancha_points roto no debe abortar nada =====
  ghost_puntos_before_break := ghost_puntos;

  CREATE OR REPLACE FUNCTION public.calc_revancha_points(_participant_id uuid)
  RETURNS void LANGUAGE plpgsql AS $fn$
  BEGIN
    RAISE EXCEPTION 'ROTO A PROPOSITO PARA EL E2E';
  END;
  $fn$;

  SELECT sum(puntos_partidos) INTO pre_partidos FROM public.picks;

  new_oh := (new_oh + 1) % 10;
  mutated_m101 := mutated_m101 || jsonb_build_object('gh', new_oh);

  caught := false;
  BEGIN
    UPDATE public.tournament_state
       SET extra_matches = (
         SELECT jsonb_agg(CASE WHEN e->>'id' = 'm101' THEN mutated_m101 ELSE e END)
         FROM jsonb_array_elements(extra_matches) e)
     WHERE id = 1;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  IF caught THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: el UPDATE de tournament_state fallo por culpa de calc_revancha_points roto (%) -- el aislamiento no funciono', errmsg;
  END IF;

  SELECT sum(puntos_partidos) INTO post_partidos FROM public.picks;
  IF post_partidos = pre_partidos THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: la polla principal NO recalculo mientras Revancha estaba rota -- el aislamiento fallo al reves';
  END IF;

  SELECT puntos INTO ghost_puntos FROM public.revancha_picks WHERE participant_id = ghost_id;
  IF ghost_puntos IS DISTINCT FROM ghost_puntos_before_break THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: revancha_picks del fantasma SI cambio pese a que calc_revancha_points estaba roto (esperado sin tocar=%, real=%)', ghost_puntos_before_break, ghost_puntos;
  END IF;

  -- Restaurar la función real para el caso 3.
  CREATE OR REPLACE FUNCTION public.calc_revancha_points(_participant_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
  DECLARE
    s record; p record; match_o jsonb; pts int;
    pts_total int := 0; c5 int := 0; c3 int := 0; c2 int := 0;
  BEGIN
    SELECT * INTO s FROM public.tournament_state WHERE id = 1;
    SELECT * INTO p FROM public.revancha_picks WHERE participant_id = _participant_id;
    IF NOT FOUND OR s IS NULL THEN RETURN; END IF;

    FOR match_o IN SELECT jsonb_array_elements(COALESCE(s.extra_matches, '[]'::jsonb)) LOOP
      IF match_o->>'fase' NOT IN ('semis','final') THEN CONTINUE; END IF;
      pts := public._match_pts(match_o, p.extra_matches -> (match_o->>'id'));
      IF pts IS NULL THEN CONTINUE; END IF;
      pts_total := pts_total + pts;
      IF pts = 5 THEN c5 := c5 + 1;
      ELSIF pts = 3 THEN c3 := c3 + 1;
      ELSIF pts = 2 THEN c2 := c2 + 1;
      END IF;
    END LOOP;

    UPDATE public.revancha_picks SET
      puntos = pts_total, aciertos_5 = c5, aciertos_3 = c3, aciertos_2 = c2
    WHERE participant_id = _participant_id;
  END;
  $fn$;

  REVOKE EXECUTE ON FUNCTION public.calc_revancha_points(uuid) FROM PUBLIC, anon, authenticated;

  -- ===== CASO 3: hallazgo #20 en vivo -- sin sesion, revancha SI se recalcula =====
  PERFORM set_config('request.jwt.claim.sub', '', true); -- sin sesión

  new_oh := (new_oh + 1) % 10;
  mutated_m101 := mutated_m101 || jsonb_build_object('gh', new_oh);
  expected_pts := public._match_pts(mutated_m101, orig_m101);

  UPDATE public.tournament_state
     SET extra_matches = (
       SELECT jsonb_agg(CASE WHEN e->>'id' = 'm101' THEN mutated_m101 ELSE e END)
       FROM jsonb_array_elements(extra_matches) e)
   WHERE id = 1;

  SELECT puntos INTO ghost_puntos FROM public.revancha_picks WHERE participant_id = ghost_id;
  IF ghost_puntos IS DISTINCT FROM expected_pts THEN
    RAISE EXCEPTION 'E2E_FAIL caso3: revancha_picks NO se recalculo sin sesion de admin (esperado=%, real=%)', expected_pts, ghost_puntos;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);

  -- ===== Revertir m101 a su oficial REAL original =====
  UPDATE public.tournament_state
     SET extra_matches = (
       SELECT jsonb_agg(CASE WHEN e->>'id' = 'm101' THEN orig_m101 ELSE e END)
       FROM jsonb_array_elements(extra_matches) e)
   WHERE id = 1;

  -- ===== CASO 4: sumas de control =====
  IF (SELECT sum(puntos_grupos) FROM public.picks) <> 1285
     OR (SELECT sum(puntos_partidos) FROM public.picks) <> 2381
     OR (SELECT sum(puntos_especiales) FROM public.picks) <> 180
     OR (SELECT sum(puntos_total) FROM public.picks) <> 3846 THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: sumas no cuadran tras revertir m101 (grupos=%, partidos=%, especiales=%, total=%)',
      (SELECT sum(puntos_grupos) FROM public.picks),
      (SELECT sum(puntos_partidos) FROM public.picks),
      (SELECT sum(puntos_especiales) FROM public.picks),
      (SELECT sum(puntos_total) FROM public.picks);
  END IF;

  -- ===== CASO 5: get_polla_leaderboard() sigue con las mismas 37 filas =====
  SELECT count(*) INTO diff_a FROM ((SELECT * FROM _pre_lb) EXCEPT (SELECT * FROM public.get_polla_leaderboard())) d;
  SELECT count(*) INTO diff_b FROM ((SELECT * FROM public.get_polla_leaderboard()) EXCEPT (SELECT * FROM _pre_lb)) d;
  IF diff_a <> 0 OR diff_b <> 0 THEN
    RAISE EXCEPTION 'E2E_FAIL caso5: get_polla_leaderboard() cambio filas tras revertir m101 (faltan=%, nuevas=%)', diff_a, diff_b;
  END IF;
  IF (SELECT count(*) FROM public.get_polla_leaderboard()) <> 37 THEN
    RAISE EXCEPTION 'E2E_FAIL caso5: get_polla_leaderboard() no tiene 37 filas (%)', (SELECT count(*) FROM public.get_polla_leaderboard());
  END IF;

  RAISE EXCEPTION 'E2E_OK %', jsonb_build_object(
    'caso1_ambas_cascadas_disparan', jsonb_build_object('picks_se_movio', true, 'revancha_puntos', ghost_puntos),
    'caso2_aislamiento', jsonb_build_object('update_no_fallo', true, 'picks_sí_recalculo', true, 'revancha_no_toco_datos_viejos', true),
    'caso3_hallazgo20_sin_sesion', 'paso',
    'caso4_sumas_control', '1285/2381/180/3846 OK',
    'caso5_37_filas_identicas', 'paso'
  )::text;
END $e2e$;
`;

const run = await mgmtQuery(TEST_SQL);
if (run.text.includes("E2E_OK")) {
  console.log("✅ E2E OK — los 5 casos verificados y transacción revertida (ROLLBACK):");
  const m = run.text.match(/E2E_OK\s*(\{.*?\})\s*(?:\\n|\n)CONTEXT/s);
  if (m) {
    try {
      const p = JSON.parse(m[1].replace(/\\"/g, '"'));
      console.log(
        `   · caso 1 (ambas cascadas disparan): ${JSON.stringify(p.caso1_ambas_cascadas_disparan)}`,
      );
      console.log(
        `   · caso 2 (aislamiento, fault injection): ${JSON.stringify(p.caso2_aislamiento)}`,
      );
      console.log(`   · caso 3 (hallazgo #20 sin sesión): ${p.caso3_hallazgo20_sin_sesion}`);
      console.log(`   · caso 4 (sumas de control): ${p.caso4_sumas_control}`);
      console.log(`   · caso 5 (37 filas idénticas): ${p.caso5_37_filas_identicas}`);
    } catch {
      console.log("   payload: " + run.text.slice(0, 1500));
    }
  } else {
    console.log("   payload crudo: " + run.text.slice(0, 1500));
  }
} else if (run.text.includes("E2E_FAIL") || run.text.includes("E2E_SETUP_FAIL")) {
  fail("Assert E2E falló:\n" + run.text.slice(0, 2000));
} else {
  fail(`Respuesta inesperada (status ${run.status}):\n` + run.text.slice(0, 2000));
}

const after = await sums();
if (JSON.stringify(before) !== JSON.stringify(after)) {
  fail(
    `¡Los puntos reales de picks CAMBIARON! antes=${JSON.stringify(before)} después=${JSON.stringify(after)}`,
  );
}
console.log("\n✅ Post-check 1: sumas de picks intactas (ROLLBACK confirmado).");

const check = await mgmtQuery(
  "SELECT " +
    "(SELECT count(*) FROM pg_proc WHERE proname IN ('ts_recalc_revancha_on_official_change','recalc_revancha_report')) AS funcs_nuevas, " +
    "(SELECT count(*) FROM pg_trigger WHERE tgname = 'ts_recalc_revancha_on_official_change') AS trig_nuevo, " +
    "(SELECT count(*) FROM information_schema.columns WHERE table_name='tournament_state' AND column_name='revancha_cuota_cop') AS col_nueva;",
);
console.log("Post-check 2 (¿quedó algo aplicado?): " + check.text);
if (
  !check.text.includes('"funcs_nuevas":0') ||
  !check.text.includes('"trig_nuevo":0') ||
  !check.text.includes('"col_nueva":0')
) {
  fail("¡Algo quedó aplicado por accidente! No debía en este E2E — revisar antes de nada.");
}
console.log("✅ Post-check 2: nada quedó aplicado (trigger/funciones/columna nuevos no existen).");
