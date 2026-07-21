/**
 * E2E de la migración PROPUESTA (no aplicada) del esquema del Repechaje —
 * supabase/migrations_propuestas/20260725000000_repechaje_schema_propuesta.sql.
 *
 * Transaccional, con ROLLBACK garantizado (patrón scripts/e2e_ts_validate_scores.mjs):
 * Management API = 1 request : 1 transacción implícita. El archivo de la migración entero
 * (leído del disco, no retranscrito) viaja como DDL de nivel superior en el MISMO request
 * que el DO final que fuerza el rollback — si el DO termina en RAISE EXCEPTION, la migración
 * completa (tabla nueva, columnas nuevas, funciones, triggers, RLS) se revierte con todo lo
 * demás. Verificado en la tarea anterior que ese patrón funciona (DDL + DO-que-falla en un
 * solo request = ninguno de los dos sobrevive).
 *
 * Dentro de esa transacción:
 *   0. Captura el leaderboard principal y las sumas de `picks` ANTES de tocar nada (tablas
 *      temporales, viven en la misma transacción).
 *   1. Aplica la migración completa.
 *   2. CASO 1 — los 37 actuales, fila por fila, idénticos en get_polla_leaderboard() tras
 *      agregar la guarda B (en_polla_original) y el backfill. Sumas de picks: 1285/2381/
 *      180/3846.
 *   3. CASO 2 — participante ficticio SOLO-repechaje (en_polla_original=false, la fila nace
 *      así por default): con estado_pago_repechaje='aprobado' y una planilla de repechaje,
 *      NO aparece en get_polla_leaderboard(), SÍ en get_repechaje_leaderboard() con los
 *      puntos correctos (verificados a mano y contra _match_pts).
 *   4. CASO 3 — el error humano: a esa misma persona se le aprueba por error el
 *      estado_pago PRINCIPAL. Sigue sin aparecer en get_polla_leaderboard() porque
 *      en_polla_original sigue en false — esta es la guarda B haciendo su trabajo.
 *   5. CASO 4 — un participante REAL de la polla (La Floresta) que ADEMÁS paga repechaje:
 *      aparece en ambos leaderboards, con puntuaciones independientes; su puntos_total de
 *      la polla principal no se mueve ni un punto.
 *   6. Hallazgo #20, probado en vivo (no solo por diseño): sin sesión y con el repechaje
 *      cerrado (repechaje_abierto=false), un UPDATE de SOLO puntaje pasa igual (no dispara
 *      el candado); un UPDATE que sí toca extra_matches sigue rechazado.
 *   7. Bonus — repechaje_picks_validate rechaza un partido que no es semis/final (m103,
 *      tercer puesto).
 *   8. RAISE EXCEPTION 'E2E_OK {...}' → ROLLBACK de TODO.
 * Post-check por REST: sumas de picks intactas, y repechaje_picks/las columnas nuevas NO
 * existen (confirma que ni la migración quedó aplicada).
 *
 * Uso: SUPABASE_PAT=sbp_... node scripts/e2e_repechaje_schema.mjs
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

console.log("== E2E migración propuesta del esquema de Repechaje (transaccional, ROLLBACK) ==\n");
const before = await sums();
console.log(
  `✓ Sumas reales antes: grupos=${before.grupos} partidos=${before.partidos} especiales=${before.especiales} total=${before.total} (${before.filas} filas)\n`,
);

const migrationSql = readFileSync(
  join(root, "supabase/migrations_propuestas/20260725000000_repechaje_schema_propuesta.sql"),
  "utf8",
);

// La Floresta: participante real de la polla (37 actuales), usado en el CASO 4.
const LA_FLORESTA_ID = "06d42e5f-d3a7-487d-bbc8-a93e03d771fd";

const TEST_SQL = `
-- 0) Snapshot PRE-migración (tablas temporales: viven y mueren con esta transacción).
CREATE TEMP TABLE _pre_lb AS SELECT * FROM public.get_polla_leaderboard();
CREATE TEMP TABLE _pre_floresta_picks AS
  SELECT puntos_grupos, puntos_partidos, puntos_especiales, puntos_total
  FROM public.picks WHERE participant_id = '${LA_FLORESTA_ID}';

-- 1) La migración propuesta completa, tal cual el archivo.
${migrationSql}

-- 2) El resto del E2E, en un DO que termina forzando ROLLBACK de TODO lo anterior.
DO $e2e$
DECLARE
  admin_uuid uuid := '1e1fc0d6-c5c3-4a5f-90b1-9771538faab3';
  diff_a int; diff_b int;
  pre_sum record; post_sum record;
  ghost_id uuid;
  rep_row record;
  ghost_puntos int;
  caught boolean; errmsg text;
  puntos_antes int;
  m101 jsonb; m102 jsonb; m104 jsonb; m103 jsonb;
BEGIN
  -- ===== CASO 1: los 37 actuales, fila por fila, idénticos =====
  SELECT count(*) INTO diff_a FROM ((SELECT * FROM _pre_lb) EXCEPT (SELECT * FROM public.get_polla_leaderboard())) d;
  SELECT count(*) INTO diff_b FROM ((SELECT * FROM public.get_polla_leaderboard()) EXCEPT (SELECT * FROM _pre_lb)) d;
  IF diff_a <> 0 OR diff_b <> 0 THEN
    RAISE EXCEPTION 'E2E_FAIL caso1: get_polla_leaderboard() cambio filas (faltan=%, nuevas=%)', diff_a, diff_b;
  END IF;
  IF (SELECT count(*) FROM public.get_polla_leaderboard()) <> 37 THEN
    RAISE EXCEPTION 'E2E_FAIL caso1: get_polla_leaderboard() no tiene 37 filas (%)', (SELECT count(*) FROM public.get_polla_leaderboard());
  END IF;
  SELECT sum(puntos_grupos) g, sum(puntos_partidos) m, sum(puntos_especiales) e, sum(puntos_total) t
    INTO post_sum FROM public.picks;
  IF post_sum.g <> 1285 OR post_sum.m <> 2381 OR post_sum.e <> 180 OR post_sum.t <> 3846 THEN
    RAISE EXCEPTION 'E2E_FAIL caso1: sumas no cuadran (grupos=%, partidos=%, especiales=%, total=%)',
      post_sum.g, post_sum.m, post_sum.e, post_sum.t;
  END IF;

  -- ===== Datos reales de semis/final para los picks de repechaje =====
  SELECT m INTO m101 FROM jsonb_array_elements((SELECT extra_matches FROM public.tournament_state WHERE id=1)) m WHERE m->>'id'='m101';
  SELECT m INTO m102 FROM jsonb_array_elements((SELECT extra_matches FROM public.tournament_state WHERE id=1)) m WHERE m->>'id'='m102';
  SELECT m INTO m103 FROM jsonb_array_elements((SELECT extra_matches FROM public.tournament_state WHERE id=1)) m WHERE m->>'id'='m103';
  SELECT m INTO m104 FROM jsonb_array_elements((SELECT extra_matches FROM public.tournament_state WHERE id=1)) m WHERE m->>'id'='m104';

  -- El repechaje arranca CERRADO (repechaje_abierto=false por default) -- toda la carga de
  -- datos de prueba (casos 2-4) se hace como admin, que ya salta ese candado por diseño
  -- (igual que enforce_picks_deadline). El candado en sí se prueba aparte, explícitamente,
  -- en el bloque "HALLAZGO #20" más abajo.
  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);

  -- ===== CASO 2: participante ficticio SOLO-repechaje =====
  INSERT INTO public.participants (nombre, estado_pago, estado_pago_repechaje)
  VALUES ('E2E Fantasma Repechaje', 'pendiente', 'aprobado')
  RETURNING id INTO ghost_id;

  IF (SELECT en_polla_original FROM public.participants WHERE id = ghost_id) <> false THEN
    RAISE EXCEPTION 'E2E_SETUP_FAIL: el fantasma no nacio con en_polla_original=false';
  END IF;

  -- m101 FRA 0-2 ESP -> predicho 0-2 exacto (5). m102 ENG 1-2 ARG -> predicho 1-3 (3).
  -- m104 ESP 0-0 ARG -> predicho 1-1 (1). Esperado: 9 pts, aciertos_5=1, aciertos_3=1.
  INSERT INTO public.repechaje_picks (participant_id, extra_matches)
  VALUES (
    ghost_id,
    jsonb_build_object(
      'm101', jsonb_build_object('gh', 0, 'ga', 2),
      'm102', jsonb_build_object('gh', 1, 'ga', 3),
      'm104', jsonb_build_object('gh', 1, 'ga', 1)
    )
  );
  PERFORM public.calc_repechaje_points(ghost_id);

  SELECT * INTO rep_row FROM public.repechaje_picks WHERE participant_id = ghost_id;
  ghost_puntos := rep_row.puntos;
  IF NOT (rep_row.puntos = 9 AND rep_row.aciertos_5 = 1 AND rep_row.aciertos_3 = 1 AND rep_row.aciertos_2 = 0) THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: puntos del fantasma no cuadran (puntos=%, c5=%, c3=%, c2=%)',
      rep_row.puntos, rep_row.aciertos_5, rep_row.aciertos_3, rep_row.aciertos_2;
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_polla_leaderboard() WHERE participant_id = ghost_id) THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: el fantasma SI aparece en get_polla_leaderboard()';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_repechaje_leaderboard() WHERE participant_id = ghost_id AND puntos = 9) THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: el fantasma NO aparece (o con puntos incorrectos) en get_repechaje_leaderboard()';
  END IF;

  -- ===== CASO 3: el error humano — aprueban por error el pago PRINCIPAL del fantasma =====
  UPDATE public.participants SET estado_pago = 'aprobado' WHERE id = ghost_id;

  IF EXISTS (SELECT 1 FROM public.get_polla_leaderboard() WHERE participant_id = ghost_id) THEN
    RAISE EXCEPTION 'E2E_FAIL caso3: el fantasma aparece en get_polla_leaderboard() tras el error de aprobacion — la guarda B no funciono';
  END IF;
  IF (SELECT count(*) FROM public.get_polla_leaderboard()) <> 37 THEN
    RAISE EXCEPTION 'E2E_FAIL caso3: get_polla_leaderboard() ya no tiene 37 filas tras el error de aprobacion (%)',
      (SELECT count(*) FROM public.get_polla_leaderboard());
  END IF;

  -- ===== CASO 4: participante REAL (La Floresta) que ADEMÁS paga repechaje =====
  UPDATE public.participants SET estado_pago_repechaje = 'aprobado' WHERE id = '${LA_FLORESTA_ID}';

  -- m101 FRA 0-2 ESP -> predicho 1-1 (0). m102 ENG 1-2 ARG -> predicho 2-2 (1, pa=oa).
  -- m104 ESP 0-0 ARG -> predicho 0-1 (1, ph=oh). Esperado: 2 pts, sin aciertos_5/3.
  INSERT INTO public.repechaje_picks (participant_id, extra_matches)
  VALUES (
    '${LA_FLORESTA_ID}',
    jsonb_build_object(
      'm101', jsonb_build_object('gh', 1, 'ga', 1),
      'm102', jsonb_build_object('gh', 2, 'ga', 2),
      'm104', jsonb_build_object('gh', 0, 'ga', 1)
    )
  );
  PERFORM public.calc_repechaje_points('${LA_FLORESTA_ID}');

  SELECT * INTO rep_row FROM public.repechaje_picks WHERE participant_id = '${LA_FLORESTA_ID}';
  IF NOT (rep_row.puntos = 2 AND rep_row.aciertos_5 = 0 AND rep_row.aciertos_3 = 0 AND rep_row.aciertos_2 = 0) THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: puntos de repechaje de La Floresta no cuadran (puntos=%, c5=%, c3=%, c2=%)',
      rep_row.puntos, rep_row.aciertos_5, rep_row.aciertos_3, rep_row.aciertos_2;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_polla_leaderboard() WHERE participant_id = '${LA_FLORESTA_ID}') THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: La Floresta desaparecio de get_polla_leaderboard()';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_repechaje_leaderboard() WHERE participant_id = '${LA_FLORESTA_ID}' AND puntos = 2) THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: La Floresta no aparece (o con puntos incorrectos) en get_repechaje_leaderboard()';
  END IF;
  -- Su puntaje de la polla PRINCIPAL no se movio ni un punto.
  IF EXISTS (
    SELECT 1 FROM public.picks p, _pre_floresta_picks pre
    WHERE p.participant_id = '${LA_FLORESTA_ID}'
      AND (p.puntos_grupos, p.puntos_partidos, p.puntos_especiales, p.puntos_total)
          IS DISTINCT FROM (pre.puntos_grupos, pre.puntos_partidos, pre.puntos_especiales, pre.puntos_total)
  ) THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: los puntos PRINCIPALES de La Floresta se movieron al tocar repechaje';
  END IF;

  -- ===== HALLAZGO #20 aplicado desde el día uno: BEFORE UPDATE OF extra_matches, no
  -- BEFORE UPDATE a secas. Se prueba sin sesión (auth.uid() = NULL, ni admin ni participante
  -- dueño) con repechaje_abierto TODAVÍA en false (nunca se tocó): =====
  PERFORM set_config('request.jwt.claim.sub', '', true); -- sin sesión

  -- 1) Un UPDATE que SOLO toca puntaje (lo que hace calc_repechaje_points) debe PASAR
  --    igual, aunque el repechaje esté cerrado -- exactamente el bug que ya se arregló
  --    para picks, reproducido aquí ANTES de que exista, no después.
  puntos_antes := (SELECT puntos FROM public.repechaje_picks WHERE participant_id = ghost_id);
  caught := false;
  BEGIN
    UPDATE public.repechaje_picks SET puntos = puntos_antes + 1 WHERE participant_id = ghost_id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  IF caught THEN
    RAISE EXCEPTION 'E2E_FAIL hallazgo20 (caso A): un UPDATE de SOLO puntaje sin sesion fue rechazado (%) -- el candado no deberia mirar esta columna', errmsg;
  END IF;
  -- Revertir el +1 de prueba (no debe afectar el resto de asserts).
  UPDATE public.repechaje_picks SET puntos = puntos_antes WHERE participant_id = ghost_id;

  -- 2) Un UPDATE que SÍ toca extra_matches, sin sesión y con repechaje_abierto=false, debe
  --    SEGUIR rechazado -- el candado no quedó roto por el fix del punto 1.
  caught := false;
  BEGIN
    UPDATE public.repechaje_picks
       SET extra_matches = extra_matches || jsonb_build_object('m104', jsonb_build_object('gh', 2, 'ga', 2))
     WHERE participant_id = ghost_id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL hallazgo20 (caso B): un cambio de PREDICCION sin sesion y con el repechaje cerrado PASO (debia rechazarse)';
  END IF;
  IF errmsg NOT LIKE '%todavía no está abierto%' THEN
    RAISE EXCEPTION 'E2E_FAIL hallazgo20 (caso B): rechazado pero por otra razon: %', errmsg;
  END IF;

  -- Volver a admin para el resto del setup (bonus de abajo).
  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);

  -- ===== Bonus: repechaje_picks_validate rechaza un partido que no es semis/final =====
  caught := false;
  BEGIN
    UPDATE public.repechaje_picks
       SET extra_matches = extra_matches || jsonb_build_object('m103', jsonb_build_object('gh', 1, 'ga', 1))
     WHERE participant_id = ghost_id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL bonus: se pudo guardar un marcador de tercer puesto (m103) en repechaje_picks';
  END IF;
  IF errmsg NOT LIKE '%no es de semis ni de la final%' THEN
    RAISE EXCEPTION 'E2E_FAIL bonus: rechazado pero por otra razon: %', errmsg;
  END IF;

  RAISE EXCEPTION 'E2E_OK %', jsonb_build_object(
    'caso1_37_identicos', 'paso, sumas 1285/2381/180/3846',
    'caso2_fantasma_solo_repechaje', jsonb_build_object('puntos', ghost_puntos, 'en_principal', false, 'en_repechaje', true),
    'caso3_error_humano_estado_pago', 'paso, sigue sin aparecer en la principal',
    'caso4_la_floresta_ambos', jsonb_build_object('puntos_repechaje', 2, 'en_ambos', true, 'principal_intacto', true),
    'hallazgo20_solo_puntaje_pasa_sin_sesion', 'paso',
    'hallazgo20_prediccion_sigue_rechazada', 'paso',
    'bonus_m103_rechazado', 'paso'
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
      console.log(`   · caso 1 (37 idénticos): ${p.caso1_37_identicos}`);
      console.log(
        `   · caso 2 (fantasma solo-repechaje): ${JSON.stringify(p.caso2_fantasma_solo_repechaje)}`,
      );
      console.log(`   · caso 3 (error humano de estado_pago): ${p.caso3_error_humano_estado_pago}`);
      console.log(
        `   · caso 4 (La Floresta en ambos): ${JSON.stringify(p.caso4_la_floresta_ambos)}`,
      );
      console.log(
        `   · hallazgo #20 (solo-puntaje pasa sin sesión, cerrado): ${p.hallazgo20_solo_puntaje_pasa_sin_sesion}`,
      );
      console.log(
        `   · hallazgo #20 (predicción sigue rechazada, cerrado): ${p.hallazgo20_prediccion_sigue_rechazada}`,
      );
      console.log(
        `   · bonus (m103 rechazado por repechaje_picks_validate): ${p.bonus_m103_rechazado}`,
      );
    } catch {
      console.log("   payload: " + run.text.slice(0, 1200));
    }
  } else {
    console.log("   payload crudo: " + run.text.slice(0, 1200));
  }
} else if (run.text.includes("E2E_FAIL") || run.text.includes("E2E_SETUP_FAIL")) {
  fail("Assert E2E falló:\n" + run.text.slice(0, 1500));
} else {
  fail(`Respuesta inesperada (status ${run.status}):\n` + run.text.slice(0, 1500));
}

// Post-check 1: sumas de picks intactas.
const after = await sums();
if (JSON.stringify(before) !== JSON.stringify(after)) {
  fail(
    `¡Los puntos reales de picks CAMBIARON! antes=${JSON.stringify(before)} después=${JSON.stringify(after)}`,
  );
}
console.log("\n✅ Post-check 1: sumas de picks intactas (ROLLBACK confirmado).");

// Post-check 2: la migración NO quedó aplicada (la tabla/columnas no existen).
const check = await mgmtQuery(
  "SELECT to_regclass('public.repechaje_picks') AS tabla, " +
    "(SELECT count(*) FROM information_schema.columns WHERE table_name='participants' AND column_name IN ('en_polla_original','estado_pago_repechaje')) AS cols_participants, " +
    "(SELECT count(*) FROM information_schema.columns WHERE table_name='tournament_state' AND column_name IN ('repechaje_abierto','repechaje_locked_at')) AS cols_ts;",
);
console.log("Post-check 2 (¿quedó algo aplicado?): " + check.text);
if (
  !check.text.includes('"tabla":null') ||
  !check.text.includes('"cols_participants":0') ||
  !check.text.includes('"cols_ts":0')
) {
  fail("¡La migración quedó aplicada parcial o totalmente! No debía — revisar antes de nada.");
}
console.log(
  "✅ Post-check 2: la migración NO quedó aplicada (repechaje_picks no existe, columnas nuevas no existen).",
);
