/**
 * E2E de la migración PROPUESTA (no aplicada) `_ts_validate_scores` —
 * supabase/migrations_propuestas/20260721000000_ts_validate_scores_propuesta.sql.
 *
 * Transaccional, con ROLLBACK garantizado (patrón scripts/e2e_recalc_categorias.mjs):
 * Management API = 1 request : 1 transacción implícita (protocolo "simple query" de
 * Postgres) — CREATE FUNCTION/TRIGGER y el bloque DO que sigue viajan en el MISMO
 * request, así que si el DO termina en RAISE EXCEPTION, el trigger recién creado
 * también se revierte. Verificado con una prueba de humo antes de escribir esto:
 * una función creada + un DO que lanza excepción en la misma llamada — la función NO
 * sobrevive al rollback.
 *
 * Dentro de esa única transacción:
 *   0. Crea la función + el trigger propuestos (texto calcado del archivo de la
 *      propuesta — no se reimplementa ni se resume, se aplica tal cual).
 *   1. Siembra un marcador VIEJO a medias (group_k_matches id "1", MEX-RSA, hoy
 *      null/null) con el trigger DESHABILITADO momentáneamente — simula datos que
 *      quedaron a medias por una vía anterior a la existencia de este trigger (la
 *      razón de ser de la variante diff-based, ver cabecera de la propuesta).
 *   2. CASO 1 — marcador NUEVO a medias en el UPDATE actual (id "2", gh=2/ga=null):
 *      debe RECHAZARSE.
 *   3. CASO 2 — un UPDATE que solo toca OTRO partido (id "3", gh=1/ga=1 completo) sin
 *      tocar el marcador viejo a medias del id "1": debe PASAR, y el id "1" debe
 *      seguir intacto (todavía a medias) — es la razón entera del diseño diff-based.
 *   4. CASO 3 — reescritura MASIVA de extra_matches, tipo seed_knockout_bracket: reset
 *      a `[]` y resiembra las 32 entradas completas (mismos ids m73–m104, todas
 *      gh/ga null, JSON calcado de 20260625120000_seed_knockout_bracket.sql). Para el
 *      diff esto son 32 filas "nuevas" a la vez (old_m IS NULL en todas) — debe PASAR.
 *   5. RAISE EXCEPTION 'E2E_OK {...}' → ROLLBACK de TODO (incluida la creación del
 *      trigger): nada queda escrito ni el trigger queda instalado.
 * Post-check por REST: group_k_matches/extra_matches de producción intactos.
 *
 * Uso: SUPABASE_PAT=sbp_... node scripts/e2e_ts_validate_scores.mjs
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

async function tsSnapshot() {
  const res = await fetch(
    `${URL_}/rest/v1/tournament_state?id=eq.1&select=group_k_matches,extra_matches`,
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
  );
  if (!res.ok) fail(`REST tournament_state: ${res.status}`);
  const rows = await res.json();
  return JSON.stringify(rows[0]);
}

console.log("== E2E migración propuesta _ts_validate_scores (transaccional, con ROLLBACK) ==\n");
const before = await tsSnapshot();
console.log("✓ Snapshot de group_k_matches/extra_matches capturado.\n");

// JSON calcado de supabase/migrations/20260625120000_seed_knockout_bracket.sql —
// 32 partidos m73..m104, todos gh/ga null (estado "recién sembrado, nada jugado aún").
const EXTRA_SEED = `[
  {"id":"m73","fase":"dieciseisavos","fecha":"2026-06-28T15:00:00-04:00","local":"Segundo A","visitante":"Segundo B","sede":"SoFi Stadium · Inglewood","gh":null,"ga":null},
  {"id":"m74","fase":"dieciseisavos","fecha":"2026-06-29T16:30:00-04:00","local":"Ganador E","visitante":"Mejor 3° (A/B/C/D/F)","sede":"Gillette Stadium · Foxborough","gh":null,"ga":null},
  {"id":"m75","fase":"dieciseisavos","fecha":"2026-06-29T21:00:00-04:00","local":"Ganador F","visitante":"Segundo C","sede":"Estadio BBVA · Monterrey","gh":null,"ga":null},
  {"id":"m76","fase":"dieciseisavos","fecha":"2026-06-29T13:00:00-04:00","local":"Ganador C","visitante":"Segundo F","sede":"NRG Stadium · Houston","gh":null,"ga":null},
  {"id":"m77","fase":"dieciseisavos","fecha":"2026-06-30T17:00:00-04:00","local":"Ganador I","visitante":"Mejor 3° (C/D/F/G/H)","sede":"MetLife Stadium · East Rutherford","gh":null,"ga":null},
  {"id":"m78","fase":"dieciseisavos","fecha":"2026-06-30T13:00:00-04:00","local":"Segundo E","visitante":"Segundo I","sede":"AT&T Stadium · Arlington","gh":null,"ga":null},
  {"id":"m79","fase":"dieciseisavos","fecha":"2026-06-30T21:00:00-04:00","local":"Ganador A","visitante":"Mejor 3° (C/E/F/H/I)","sede":"Estadio Azteca · Mexico City","gh":null,"ga":null},
  {"id":"m80","fase":"dieciseisavos","fecha":"2026-07-01T12:00:00-04:00","local":"Ganador L","visitante":"Mejor 3° (E/H/I/J/K)","sede":"Mercedes-Benz Stadium · Atlanta","gh":null,"ga":null},
  {"id":"m81","fase":"dieciseisavos","fecha":"2026-07-01T20:00:00-04:00","local":"Ganador D","visitante":"Mejor 3° (B/E/F/I/J)","sede":"Levi's Stadium · Santa Clara","gh":null,"ga":null},
  {"id":"m82","fase":"dieciseisavos","fecha":"2026-07-01T16:00:00-04:00","local":"Ganador G","visitante":"Mejor 3° (A/E/H/I/J)","sede":"Lumen Field · Seattle","gh":null,"ga":null},
  {"id":"m83","fase":"dieciseisavos","fecha":"2026-07-02T19:00:00-04:00","local":"Segundo K","visitante":"Segundo L","sede":"BMO Field · Toronto","gh":null,"ga":null},
  {"id":"m84","fase":"dieciseisavos","fecha":"2026-07-02T15:00:00-04:00","local":"Ganador H","visitante":"Segundo J","sede":"SoFi Stadium · Inglewood","gh":null,"ga":null},
  {"id":"m85","fase":"dieciseisavos","fecha":"2026-07-02T23:00:00-04:00","local":"Ganador B","visitante":"Mejor 3° (E/F/G/I/J)","sede":"BC Place · Vancouver","gh":null,"ga":null},
  {"id":"m86","fase":"dieciseisavos","fecha":"2026-07-03T18:00:00-04:00","local":"Ganador J","visitante":"Segundo H","sede":"Hard Rock Stadium · Miami Gardens","gh":null,"ga":null},
  {"id":"m87","fase":"dieciseisavos","fecha":"2026-07-03T21:30:00-04:00","local":"Ganador K","visitante":"Mejor 3° (D/E/I/J/L)","sede":"Arrowhead Stadium · Kansas City","gh":null,"ga":null},
  {"id":"m88","fase":"dieciseisavos","fecha":"2026-07-03T14:00:00-04:00","local":"Segundo D","visitante":"Segundo G","sede":"AT&T Stadium · Arlington","gh":null,"ga":null},
  {"id":"m89","fase":"octavos","fecha":"2026-07-04T17:00:00-04:00","local":"Ganador Partido 74","visitante":"Ganador Partido 77","sede":"Lincoln Financial Field · Philadelphia","gh":null,"ga":null},
  {"id":"m90","fase":"octavos","fecha":"2026-07-04T13:00:00-04:00","local":"Ganador Partido 73","visitante":"Ganador Partido 75","sede":"NRG Stadium · Houston","gh":null,"ga":null},
  {"id":"m91","fase":"octavos","fecha":"2026-07-05T16:00:00-04:00","local":"Ganador Partido 76","visitante":"Ganador Partido 78","sede":"MetLife Stadium · East Rutherford","gh":null,"ga":null},
  {"id":"m92","fase":"octavos","fecha":"2026-07-05T20:00:00-04:00","local":"Ganador Partido 79","visitante":"Ganador Partido 80","sede":"Estadio Azteca · Mexico City","gh":null,"ga":null},
  {"id":"m93","fase":"octavos","fecha":"2026-07-06T15:00:00-04:00","local":"Ganador Partido 83","visitante":"Ganador Partido 84","sede":"AT&T Stadium · Arlington","gh":null,"ga":null},
  {"id":"m94","fase":"octavos","fecha":"2026-07-06T20:00:00-04:00","local":"Ganador Partido 81","visitante":"Ganador Partido 82","sede":"Lumen Field · Seattle","gh":null,"ga":null},
  {"id":"m95","fase":"octavos","fecha":"2026-07-07T12:00:00-04:00","local":"Ganador Partido 86","visitante":"Ganador Partido 88","sede":"Mercedes-Benz Stadium · Atlanta","gh":null,"ga":null},
  {"id":"m96","fase":"octavos","fecha":"2026-07-07T16:00:00-04:00","local":"Ganador Partido 85","visitante":"Ganador Partido 87","sede":"BC Place · Vancouver","gh":null,"ga":null},
  {"id":"m97","fase":"cuartos","fecha":"2026-07-09T16:00:00-04:00","local":"Ganador Partido 89","visitante":"Ganador Partido 90","sede":"Gillette Stadium · Foxborough","gh":null,"ga":null},
  {"id":"m98","fase":"cuartos","fecha":"2026-07-10T15:00:00-04:00","local":"Ganador Partido 93","visitante":"Ganador Partido 94","sede":"SoFi Stadium · Inglewood","gh":null,"ga":null},
  {"id":"m99","fase":"cuartos","fecha":"2026-07-11T17:00:00-04:00","local":"Ganador Partido 91","visitante":"Ganador Partido 92","sede":"Hard Rock Stadium · Miami Gardens","gh":null,"ga":null},
  {"id":"m100","fase":"cuartos","fecha":"2026-07-11T21:00:00-04:00","local":"Ganador Partido 95","visitante":"Ganador Partido 96","sede":"Arrowhead Stadium · Kansas City","gh":null,"ga":null},
  {"id":"m101","fase":"semis","fecha":"2026-07-14T15:00:00-04:00","local":"Ganador Partido 97","visitante":"Ganador Partido 98","sede":"AT&T Stadium · Arlington","gh":null,"ga":null},
  {"id":"m102","fase":"semis","fecha":"2026-07-15T15:00:00-04:00","local":"Ganador Partido 99","visitante":"Ganador Partido 100","sede":"Mercedes-Benz Stadium · Atlanta","gh":null,"ga":null},
  {"id":"m103","fase":"tercero","fecha":"2026-07-18T17:00:00-04:00","local":"Perdedor Partido 101","visitante":"Perdedor Partido 102","sede":"Hard Rock Stadium · Miami Gardens","gh":null,"ga":null},
  {"id":"m104","fase":"final","fecha":"2026-07-19T15:00:00-04:00","local":"Ganador Partido 101","visitante":"Ganador Partido 102","sede":"MetLife Stadium · East Rutherford","gh":null,"ga":null}
]`;

const TEST_SQL = `
-- 0) Aplicar la propuesta TAL CUAL (calcado de
--    migrations_propuestas/20260721000000_ts_validate_scores_propuesta.sql), como
--    DDL de nivel superior en la MISMA request que el DO de abajo -- si el DO
--    termina en excepción, esta creación se revierte con todo lo demás (protocolo
--    "simple query": statements separados por ";" en un solo request = una sola
--    transacción implícita; verificado con una prueba de humo antes de escribir esto).
CREATE OR REPLACE FUNCTION public._ts_validate_scores()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  m jsonb;
  old_m jsonb;
  mid text;
BEGIN
  FOR m IN SELECT jsonb_array_elements(COALESCE(NEW.group_k_matches, '[]'::jsonb)) LOOP
    mid := m->>'id';
    SELECT e INTO old_m
      FROM jsonb_array_elements(COALESCE(OLD.group_k_matches, '[]'::jsonb)) e
      WHERE e->>'id' = mid;
    IF (old_m IS NULL
        OR (old_m->'gh') IS DISTINCT FROM (m->'gh')
        OR (old_m->'ga') IS DISTINCT FROM (m->'ga'))
       AND public._gp_score_invalid(m) THEN
      RAISE EXCEPTION
        'Marcador oficial inválido en group_k_matches (partido %): usa un solo dígito (0–9) en ambos campos, o déjalos vacíos si no se ha jugado.',
        mid;
    END IF;
  END LOOP;

  FOR m IN SELECT jsonb_array_elements(COALESCE(NEW.extra_matches, '[]'::jsonb)) LOOP
    mid := m->>'id';
    SELECT e INTO old_m
      FROM jsonb_array_elements(COALESCE(OLD.extra_matches, '[]'::jsonb)) e
      WHERE e->>'id' = mid;
    IF (old_m IS NULL
        OR (old_m->'gh') IS DISTINCT FROM (m->'gh')
        OR (old_m->'ga') IS DISTINCT FROM (m->'ga'))
       AND public._gp_score_invalid(m) THEN
      RAISE EXCEPTION
        'Marcador oficial inválido en extra_matches (partido %): usa un solo dígito (0–9) en ambos campos, o déjalos vacíos si no se ha jugado.',
        mid;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public._ts_validate_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ts_validate_scores() TO service_role, authenticated;

DROP TRIGGER IF EXISTS ts_validate_scores ON public.tournament_state;
CREATE TRIGGER ts_validate_scores
  BEFORE UPDATE ON public.tournament_state
  FOR EACH ROW
  WHEN (
    NEW.group_k_matches IS DISTINCT FROM OLD.group_k_matches
    OR NEW.extra_matches IS DISTINCT FROM OLD.extra_matches
  )
  EXECUTE FUNCTION public._ts_validate_scores();

-- 1) El resto del E2E, en un DO que termina forzando ROLLBACK de TODO lo anterior.
DO $e2e$
DECLARE
  v_gk jsonb;
  v_extra jsonb;
  v1_gh jsonb; v1_ga jsonb;
  v3_gh jsonb; v3_ga jsonb;
  caught boolean;
  errmsg text;
  extra_seed jsonb := $json$${EXTRA_SEED}$json$::jsonb;
BEGIN
  -- 1) Sembrar un marcador VIEJO a medias (id "1", hoy null/null) con el trigger
  --    deshabilitado -- simula un dato que quedó a medias por una vía anterior a
  --    la existencia de este trigger (exactamente el escenario que motiva el
  --    diseño diff-based, no la "versión obvia" que revalida todo el arreglo).
  ALTER TABLE public.tournament_state DISABLE TRIGGER ts_validate_scores;
  UPDATE public.tournament_state
     SET group_k_matches = (
       SELECT jsonb_agg(
         CASE WHEN t.e->>'id' = '1' THEN t.e || jsonb_build_object('gh', 2, 'ga', null) ELSE t.e END
         ORDER BY t.ord)
       FROM jsonb_array_elements(group_k_matches) WITH ORDINALITY t(e, ord))
   WHERE id = 1;
  ALTER TABLE public.tournament_state ENABLE TRIGGER ts_validate_scores;

  SELECT (e->'gh'), (e->'ga') INTO v1_gh, v1_ga
    FROM public.tournament_state, jsonb_array_elements(group_k_matches) e
   WHERE id = 1 AND e->>'id' = '1';
  IF NOT (v1_gh = '2'::jsonb AND v1_ga = 'null'::jsonb) THEN
    RAISE EXCEPTION 'E2E_SETUP_FAIL: el marcador viejo a medias (id 1) no quedo como se esperaba (gh=%, ga=%)', v1_gh, v1_ga;
  END IF;

  -- CASO 1: marcador NUEVO a medias en ESTE update (id "2", antes null/null) -> RECHAZAR.
  caught := false;
  BEGIN
    UPDATE public.tournament_state
       SET group_k_matches = (
         SELECT jsonb_agg(
           CASE WHEN t.e->>'id' = '2' THEN t.e || jsonb_build_object('gh', 2, 'ga', null) ELSE t.e END
           ORDER BY t.ord)
         FROM jsonb_array_elements(group_k_matches) WITH ORDINALITY t(e, ord))
     WHERE id = 1;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL caso1: el marcador nuevo a medias (id 2) PASO (debia rechazarse)';
  END IF;
  IF errmsg NOT LIKE '%Marcador oficial inválido%' THEN
    RAISE EXCEPTION 'E2E_FAIL caso1: rechazado pero por otra razon: %', errmsg;
  END IF;
  -- confirmar que el rechazo no dejo nada escrito: id "2" sigue null/null.
  SELECT (e->'gh') INTO v3_gh FROM public.tournament_state, jsonb_array_elements(group_k_matches) e
   WHERE id = 1 AND e->>'id' = '2';
  IF v3_gh IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'E2E_FAIL caso1: el UPDATE rechazado SI dejo escrito el id 2 (gh=%)', v3_gh;
  END IF;

  -- CASO 2: update que SOLO toca OTRO partido (id "3", completo 1-1) sin tocar el
  -- marcador viejo a medias del id "1" -> debe PASAR.
  UPDATE public.tournament_state
     SET group_k_matches = (
       SELECT jsonb_agg(
         CASE WHEN t.e->>'id' = '3' THEN t.e || jsonb_build_object('gh', 1, 'ga', 1) ELSE t.e END
         ORDER BY t.ord)
       FROM jsonb_array_elements(group_k_matches) WITH ORDINALITY t(e, ord))
   WHERE id = 1;

  SELECT (e->'gh'), (e->'ga') INTO v3_gh, v3_ga
    FROM public.tournament_state, jsonb_array_elements(group_k_matches) e
   WHERE id = 1 AND e->>'id' = '3';
  IF NOT (v3_gh = '1'::jsonb AND v3_ga = '1'::jsonb) THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: el update de id 3 no quedo aplicado (gh=%, ga=%)', v3_gh, v3_ga;
  END IF;
  -- el marcador viejo a medias (id "1") sigue INTACTO -- no lo bloqueo ni lo toco.
  SELECT (e->'gh'), (e->'ga') INTO v1_gh, v1_ga
    FROM public.tournament_state, jsonb_array_elements(group_k_matches) e
   WHERE id = 1 AND e->>'id' = '1';
  IF NOT (v1_gh = '2'::jsonb AND v1_ga = 'null'::jsonb) THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: el marcador viejo a medias (id 1) se vio afectado (gh=%, ga=%)', v1_gh, v1_ga;
  END IF;

  -- CASO 3: reescritura MASIVA de extra_matches, tipo seed_knockout_bracket -- reset
  -- a [] y resiembra las 32 entradas completas de una sola vez (todas "nuevas" para
  -- el diff, old_m IS NULL en las 32) -> debe PASAR.
  UPDATE public.tournament_state SET extra_matches = '[]'::jsonb WHERE id = 1;
  UPDATE public.tournament_state SET extra_matches = extra_seed WHERE id = 1;

  SELECT extra_matches INTO v_extra FROM public.tournament_state WHERE id = 1;
  IF jsonb_array_length(v_extra) <> 32 THEN
    RAISE EXCEPTION 'E2E_FAIL caso3: extra_matches no quedo con 32 elementos (%)', jsonb_array_length(v_extra);
  END IF;

  RAISE EXCEPTION 'E2E_OK %', jsonb_build_object(
    'caso1_marcador_nuevo_a_medias', 'rechazado',
    'caso2_marcador_viejo_a_medias_no_bloquea_otro_update', 'paso, id 1 sigue intacto',
    'caso3_reescritura_masiva_extra_matches_32_filas', 'paso'
  )::text;
END $e2e$;
`;

const run = await mgmtQuery(TEST_SQL);
if (run.text.includes("E2E_OK")) {
  console.log("✅ E2E OK — los 3 casos verificados y transacción revertida (ROLLBACK):");
  const m = run.text.match(/E2E_OK\s*(\{.*?\})\s*(?:\\n|\n)CONTEXT/s);
  if (m) {
    try {
      const p = JSON.parse(m[1].replace(/\\"/g, '"'));
      console.log(`   · caso 1 (marcador nuevo a medias): ${p.caso1_marcador_nuevo_a_medias}`);
      console.log(
        `   · caso 2 (viejo a medias no bloquea otro update): ${p.caso2_marcador_viejo_a_medias_no_bloquea_otro_update}`,
      );
      console.log(
        `   · caso 3 (reescritura masiva extra_matches, 32 filas): ${p.caso3_reescritura_masiva_extra_matches_32_filas}`,
      );
    } catch {
      console.log("   payload: " + run.text.slice(0, 700));
    }
  } else {
    console.log("   payload crudo: " + run.text.slice(0, 700));
  }
} else if (run.text.includes("E2E_FAIL") || run.text.includes("E2E_SETUP_FAIL")) {
  fail("Assert E2E falló:\n" + run.text.slice(0, 1000));
} else {
  fail(`Respuesta inesperada (status ${run.status}):\n` + run.text.slice(0, 1000));
}

const after = await tsSnapshot();
if (before !== after) {
  fail(`¡tournament_state CAMBIÓ! (debería estar intacto tras el ROLLBACK)`);
}
console.log(
  "\n✅ Post-check: group_k_matches/extra_matches de producción intactos (ROLLBACK confirmado).",
);
