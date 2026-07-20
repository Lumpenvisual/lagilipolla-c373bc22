/**
 * E2E del RECÁLCULO POR CATEGORÍA (T4) — transaccional, sin tocar producción.
 *
 * Dentro de UNA transacción (Management API = 1 request : 1 transacción):
 *   1. Corrompe a propósito los datos oficiales: grupo A con 1º=2º y la final
 *      (m104) con marcador a medio llenar (gh sin ga). Cada UPDATE dispara
 *      ts_recalc_on_official_change → recalc_all_picks_internal().
 *   2. Asserts de SEPARACIÓN del guard:
 *      A. Grupo A corrupto: los puntos de PARTIDOS y ESPECIALES no se mueven;
 *         los de GRUPOS bajan (solo se omite el grupo A) pero no a cero.
 *      B. m104 a medias: los puntos de GRUPOS quedan como en A; los de PARTIDOS
 *         bajan (solo m104 omitido); los ESPECIALES siguen intactos (180).
 *      C. El reporte de recalc_all_picks_internal() lista exactamente el m104
 *         («marcador incompleto») y el grupo A («1º y 2º repetidos»).
 *      D. _official_data_issues() (la fuente del guard duro de recalc_all_picks)
 *         enumera los mismos ítems.
 *   3. RAISE EXCEPTION 'E2E_OK {payload}' → ROLLBACK garantizado.
 *   4. Post-check por REST: los totales reales quedaron intactos.
 *
 * Uso:  SUPABASE_PAT=sbp_... node scripts/e2e_recalc_categorias.mjs
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
    grupos: s("puntos_grupos"),
    partidos: s("puntos_partidos"),
    especiales: s("puntos_especiales"),
    total: s("puntos_total"),
  };
}

console.log("== E2E recálculo por categoría (transaccional, con ROLLBACK) ==\n");
const before = await sums();
console.log(
  `✓ Sumas reales: grupos=${before.grupos} partidos=${before.partidos} especiales=${before.especiales}\n`,
);

const TEST_SQL = `
DO $e2e$
DECLARE
  pre_g bigint; pre_m bigint; pre_e bigint;
  a_g bigint; a_m bigint; a_e bigint;
  b_g bigint; b_m bigint; b_e bigint;
  rep jsonb; issues jsonb; payload jsonb;
BEGIN
  SELECT sum(puntos_grupos), sum(puntos_partidos), sum(puntos_especiales)
    INTO pre_g, pre_m, pre_e FROM public.picks;

  -- 1) Grupo A corrupto (1º = 2º). El trigger recalcula.
  UPDATE public.tournament_state
     SET groups = jsonb_set(groups, '{A,pos2}', groups->'A'->'pos1')
   WHERE id = 1;

  SELECT sum(puntos_grupos), sum(puntos_partidos), sum(puntos_especiales)
    INTO a_g, a_m, a_e FROM public.picks;

  IF a_m IS DISTINCT FROM pre_m THEN
    RAISE EXCEPTION 'E2E_FAIL: el grupo A corrupto altero los puntos de PARTIDOS (% -> %)', pre_m, a_m;
  END IF;
  IF a_e IS DISTINCT FROM pre_e THEN
    RAISE EXCEPTION 'E2E_FAIL: el grupo A corrupto altero los ESPECIALES (% -> %)', pre_e, a_e;
  END IF;
  IF NOT (a_g < pre_g AND a_g > 0) THEN
    RAISE EXCEPTION 'E2E_FAIL: grupos deberia bajar solo por el grupo A y seguir > 0 (% -> %)', pre_g, a_g;
  END IF;

  -- 2) Final (m104) a medio llenar (gh sin ga). El trigger recalcula.
  UPDATE public.tournament_state
     SET extra_matches = (
       SELECT jsonb_agg(
         CASE WHEN t.m->>'id' = 'm104' THEN t.m || jsonb_build_object('ga', null) ELSE t.m END
         ORDER BY t.ord)
       FROM jsonb_array_elements(extra_matches) WITH ORDINALITY t(m, ord))
   WHERE id = 1;

  SELECT sum(puntos_grupos), sum(puntos_partidos), sum(puntos_especiales)
    INTO b_g, b_m, b_e FROM public.picks;

  IF b_g IS DISTINCT FROM a_g THEN
    RAISE EXCEPTION 'E2E_FAIL: m104 incompleto altero los puntos de GRUPOS (% -> %)', a_g, b_g;
  END IF;
  IF b_e IS DISTINCT FROM pre_e THEN
    RAISE EXCEPTION 'E2E_FAIL: m104 incompleto altero los ESPECIALES (% -> %)', pre_e, b_e;
  END IF;
  IF NOT (b_m < pre_m AND b_m > 0) THEN
    RAISE EXCEPTION 'E2E_FAIL: partidos deberia bajar solo por m104 y seguir > 0 (% -> %)', pre_m, b_m;
  END IF;

  -- 3) El reporte dice la verdad.
  rep := public.recalc_all_picks_internal();
  IF NOT (rep->'partidos_omitidos' @> '[{"id":"m104","motivo":"marcador incompleto"}]'::jsonb) THEN
    RAISE EXCEPTION 'E2E_FAIL: el reporte no lista m104 incompleto: %', rep->'partidos_omitidos';
  END IF;
  IF jsonb_array_length(rep->'partidos_omitidos') <> 1 THEN
    RAISE EXCEPTION 'E2E_FAIL: partidos_omitidos deberia tener solo m104: %', rep->'partidos_omitidos';
  END IF;
  IF NOT (rep->'grupos_omitidos' @> '[{"id":"A","motivo":"1º y 2º repetidos"}]'::jsonb)
     OR jsonb_array_length(rep->'grupos_omitidos') <> 1 THEN
    RAISE EXCEPTION 'E2E_FAIL: grupos_omitidos deberia listar solo el A: %', rep->'grupos_omitidos';
  END IF;
  IF (rep->>'participantes')::int < 1 THEN
    RAISE EXCEPTION 'E2E_FAIL: participantes = % en el reporte', rep->>'participantes';
  END IF;

  -- 4) La fuente del guard duro enumera lo mismo.
  issues := public._official_data_issues();
  IF issues->'partidos_omitidos' IS DISTINCT FROM rep->'partidos_omitidos'
     OR issues->'grupos_omitidos' IS DISTINCT FROM rep->'grupos_omitidos' THEN
    RAISE EXCEPTION 'E2E_FAIL: _official_data_issues difiere del reporte: %', issues;
  END IF;

  payload := jsonb_build_object(
    'grupos', jsonb_build_object('antes', pre_g, 'sin_grupo_A', a_g),
    'partidos', jsonb_build_object('antes', pre_m, 'sin_m104', b_m),
    'especiales_intactos', b_e,
    'reporte', rep
  );
  RAISE EXCEPTION 'E2E_OK %', payload::text;
END $e2e$;
`;

const run = await mgmtQuery(TEST_SQL);
if (run.text.includes("E2E_OK")) {
  console.log("✅ E2E OK — separación por categoría verificada y transacción revertida:");
  const m = run.text.match(/E2E_OK\s*(\{.*?\})\s*(?:\\n|\n)CONTEXT/s);
  if (m) {
    try {
      const p = JSON.parse(m[1].replace(/\\"/g, '"'));
      console.log(
        `   · grupos: ${p.grupos.antes} → ${p.grupos.sin_grupo_A} al omitir el grupo A (partidos y especiales intactos)`,
      );
      console.log(
        `   · partidos: ${p.partidos.antes} → ${p.partidos.sin_m104} al omitir m104 (grupos y especiales intactos)`,
      );
      console.log(`   · especiales siempre calculados: ${p.especiales_intactos}`);
      console.log(`   · reporte: ${JSON.stringify(p.reporte)}`);
    } catch {
      console.log("   payload: " + run.text.slice(0, 500));
    }
  }
} else if (run.text.includes("E2E_FAIL")) {
  fail("Assert E2E falló:\n" + run.text.slice(0, 700));
} else {
  fail(`Respuesta inesperada (status ${run.status}):\n` + run.text.slice(0, 700));
}

const after = await sums();
if (JSON.stringify(before) !== JSON.stringify(after))
  fail(
    `¡Los puntos reales CAMBIARON! antes=${JSON.stringify(before)} después=${JSON.stringify(after)}`,
  );
console.log("\n✅ Post-check: producción intacta (sumas idénticas al snapshot).");
