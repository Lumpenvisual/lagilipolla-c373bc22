/**
 * E2E del CIERRE DEL CAMPEONATO — transaccional, sin tocar producción.
 *
 * Simula dentro de UNA transacción (Management API = 1 request : 1 transacción):
 *   1. Completa los marcadores KO pendientes (tercero/final incluidos) y fija
 *      goleador/arquero oficiales de prueba (tomados del pick real de un
 *      participante, con mayúsculas/espacios cambiados para probar norm_especial).
 *   2. El trigger ts_recalc_on_official_change recalcula los puntos.
 *   3. Asserts: puntos_especiales correctos en TODOS los picks, leaderboard
 *      coherente, y condición del podio cumplida (réplica SQL del gate
 *      isTournamentComplete del frontend).
 *   4. Termina con RAISE EXCEPTION 'E2E_OK {payload}' → la excepción garantiza
 *      el ROLLBACK: NADA queda escrito. El script valida que el "error" sea E2E_OK.
 *   5. Post-check por REST (service_role): el estado real quedó intacto.
 *
 * Uso:  SUPABASE_PAT=sbp_... node scripts/e2e_final_flow.mjs
 * (el PAT se genera en Supabase → Account → Access Tokens)
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

async function restState() {
  const res = await fetch(
    `${URL_}/rest/v1/tournament_state?id=eq.1&select=extra_matches,goleador_id,arquero_id`,
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
  );
  if (!res.ok) fail(`REST tournament_state: ${res.status}`);
  const [row] = await res.json();
  return row;
}

// ---------- 0) Pre-checks ----------
console.log("== E2E cierre del campeonato (transaccional, con ROLLBACK) ==\n");

const trig = await mgmtQuery(
  "select tgname from pg_trigger where tgrelid = 'public.tournament_state'::regclass and tgname = 'ts_recalc_on_official_change';",
);
if (!trig.ok)
  fail(`Management API no responde (status ${trig.status}): ${trig.text}\n¿PAT válido?`);
if (!trig.text.includes("ts_recalc_on_official_change"))
  fail(
    "El trigger ts_recalc_on_official_change NO existe en prod. Aplica primero la migración 20260715170000_auto_recalc_on_official_change.sql",
  );
console.log("✓ Trigger ts_recalc_on_official_change presente en prod");

const before = await restState();
console.log("✓ Snapshot del estado real tomado (para el post-check)\n");

// ---------- 1) La prueba: un solo request = una transacción; la excepción final hace ROLLBACK ----------
const TEST_SQL = `
DO $e2e$
DECLARE
  test_gol text; test_arq text;
  bad int; ganadores_gol int; ganadores_arq int;
  k_ids text[];
  grupos_ok boolean; k_ok boolean; ko_ok boolean; has_final boolean; esp_ok boolean;
  ko_total int; lider record; payload jsonb; s2 record;
BEGIN
  -- Especiales de prueba: el pick real de un participante, con mayúsculas y
  -- espacios cambiados para probar la comparación normalizada (norm_especial).
  SELECT p.goleador_id, p.arquero_id INTO test_gol, test_arq
  FROM public.picks p
  WHERE p.goleador_id IS NOT NULL AND p.arquero_id IS NOT NULL
  LIMIT 1;
  IF test_gol IS NULL THEN
    RAISE EXCEPTION 'E2E_FAIL: no hay picks con especiales para probar';
  END IF;
  test_gol := '  ' || upper(test_gol) || '  ';
  test_arq := lower(test_arq);

  -- Cierre simulado: completa los marcadores KO pendientes (1-0) y fija especiales.
  -- Este UPDATE debe disparar ts_recalc_on_official_change (recalcula todos los picks).
  UPDATE public.tournament_state SET
    extra_matches = (
      SELECT jsonb_agg(
        CASE WHEN (t.m->>'gh') IS NULL OR (t.m->>'ga') IS NULL
             THEN t.m || jsonb_build_object('gh', 1, 'ga', 0)
             ELSE t.m END
        ORDER BY t.ord)
      FROM jsonb_array_elements(extra_matches) WITH ORDINALITY t(m, ord)
    ),
    goleador_id = test_gol,
    arquero_id  = test_arq
  WHERE id = 1;

  -- ASSERT A: el trigger recalculó los especiales de TODOS los picks (10+10 con
  -- especial_matches, la regla vigente: nombre igual, typo pequeño o apellido/parte
  -- del nombre con selección coincidente).
  SELECT count(*) INTO bad FROM public.picks p
  WHERE p.puntos_especiales IS DISTINCT FROM (
      (CASE WHEN public.especial_matches(p.goleador_id, test_gol) THEN 10 ELSE 0 END)
    + (CASE WHEN public.especial_matches(p.arquero_id, test_arq) THEN 10 ELSE 0 END));
  IF bad > 0 THEN
    RAISE EXCEPTION 'E2E_FAIL: % picks con puntos_especiales incorrectos tras el trigger', bad;
  END IF;

  SELECT count(*) INTO ganadores_gol FROM public.picks p
  WHERE public.especial_matches(p.goleador_id, test_gol);
  SELECT count(*) INTO ganadores_arq FROM public.picks p
  WHERE public.especial_matches(p.arquero_id, test_arq);
  IF ganadores_gol < 1 THEN
    RAISE EXCEPTION 'E2E_FAIL: nadie sumó los 10 pts de goleador (norm_especial no coincidió)';
  END IF;

  -- ASSERT B: el leaderboard público refleja los puntos recalculados.
  SELECT count(*) INTO bad
  FROM public.get_polla_leaderboard() lb
  JOIN public.picks p ON p.participant_id = lb.participant_id
  WHERE lb.puntos_total IS DISTINCT FROM p.puntos_total
     OR lb.puntos_especiales IS DISTINCT FROM p.puntos_especiales;
  IF bad > 0 THEN
    RAISE EXCEPTION 'E2E_FAIL: % filas del leaderboard no coinciden con picks', bad;
  END IF;
  SELECT lb.nombre, lb.puntos_total INTO lider
  FROM public.get_polla_leaderboard() lb ORDER BY lb.posicion, lb.nombre LIMIT 1;

  -- ASSERT C: condición del podio (réplica SQL de isTournamentComplete del frontend).
  SELECT * INTO s2 FROM public.tournament_state WHERE id = 1;
  SELECT bool_and(g.value->>'pos1' IS NOT NULL AND g.value->>'pos2' IS NOT NULL)
    INTO grupos_ok FROM jsonb_each(s2.groups) g;
  SELECT array_agg(t->>'id') INTO k_ids
    FROM jsonb_array_elements(s2.groups->'K'->'teams') t;
  SELECT bool_and((m->>'gh') IS NOT NULL AND (m->>'ga') IS NOT NULL) INTO k_ok
    FROM jsonb_array_elements(s2.group_k_matches) m
    WHERE (m->>'local') = ANY(k_ids) AND (m->>'visitante') = ANY(k_ids);
  SELECT bool_and((m->>'gh') IS NOT NULL AND (m->>'ga') IS NOT NULL),
         bool_or(m->>'fase' = 'final'), count(*)
    INTO ko_ok, has_final, ko_total
    FROM jsonb_array_elements(s2.extra_matches) m;
  esp_ok := COALESCE(btrim(s2.goleador_id),'') <> '' AND COALESCE(btrim(s2.arquero_id),'') <> '';
  IF NOT (grupos_ok AND k_ok AND ko_ok AND has_final AND ko_total >= 32 AND esp_ok) THEN
    RAISE EXCEPTION 'E2E_FAIL: condición de podio incompleta (grupos:% K:% ko:% final:% n:% esp:%)',
      grupos_ok, k_ok, ko_ok, has_final, ko_total, esp_ok;
  END IF;

  payload := jsonb_build_object(
    'picks_recalculados', (SELECT count(*) FROM public.picks),
    'aciertos_goleador', ganadores_gol,
    'aciertos_arquero', ganadores_arq,
    'lider', lider.nombre,
    'lider_puntos', lider.puntos_total,
    'llaves_ko', ko_total,
    'condicion_podio', true
  );
  -- Éxito: la excepción aborta la transacción → ROLLBACK garantizado, nada se escribe.
  RAISE EXCEPTION 'E2E_OK %', payload::text;
END $e2e$;
`;

const run = await mgmtQuery(TEST_SQL);
if (run.text.includes("E2E_OK")) {
  const m = run.text.match(/E2E_OK\s*(\{.*?\})/s);
  let payload = null;
  if (m) {
    try {
      payload = JSON.parse(m[1].replace(/\\"/g, '"'));
    } catch {
      /* payload ilegible: se muestra crudo abajo */
    }
  }
  console.log("✅ E2E OK — flujo completo verificado y transacción revertida (ROLLBACK):");
  if (payload) {
    console.log(`   · picks recalculados por el trigger: ${payload.picks_recalculados}`);
    console.log(`   · +10 pts goleador: ${payload.aciertos_goleador} participante(s)`);
    console.log(`   · +10 pts arquero:  ${payload.aciertos_arquero} participante(s)`);
    console.log(`   · líder del podio simulado: ${payload.lider} (${payload.lider_puntos} pts)`);
    console.log(`   · llaves KO completas: ${payload.llaves_ko} · condición de podio: cumplida`);
  } else {
    console.log("   payload: " + run.text.slice(0, 400));
  }
} else if (run.text.includes("E2E_FAIL")) {
  fail("Assert E2E falló:\n" + run.text.slice(0, 600));
} else {
  fail(
    `Respuesta inesperada del Management API (status ${run.status}):\n` + run.text.slice(0, 600),
  );
}

// ---------- 2) Post-check: producción quedó intacta ----------
const after = await restState();
const same =
  JSON.stringify(before.extra_matches) === JSON.stringify(after.extra_matches) &&
  before.goleador_id === after.goleador_id &&
  before.arquero_id === after.arquero_id;
if (!same) fail("¡El estado de producción CAMBIÓ! Revisa tournament_state (no debió pasar).");
console.log(
  "\n✅ Post-check: producción intacta (extra_matches y especiales idénticos al snapshot).",
);
