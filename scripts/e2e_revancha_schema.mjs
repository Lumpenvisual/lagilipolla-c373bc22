/**
 * E2E de la migración de renombrado (aún no aplicada al momento de escribir esto) —
 * supabase/migrations/20260726000000_repechaje_a_revancha.sql.
 *
 * Transaccional, con ROLLBACK garantizado (mismo patrón de siempre): el archivo de la
 * migración entero (leído del disco) viaja como DDL de nivel superior en el MISMO request
 * que el DO final que fuerza el rollback — todos los ALTER/DROP/CREATE de la migración se
 * revierten junto con el resto si el DO termina en RAISE EXCEPTION.
 *
 * A diferencia del E2E anterior (scripts/e2e_repechaje_schema.mjs, que creaba el esquema
 * desde cero), esta vez el esquema `repechaje_*` YA existe en producción (aplicado en la
 * tarea anterior) — esta migración solo lo renombra. El E2E aplica el rename dentro de la
 * transacción y vuelve a correr EXACTAMENTE los mismos casos de aislamiento que ya se
 * probaron para el esquema viejo, pero con los nombres nuevos, para confirmar que el
 * renombrado no rompió nada:
 *   1. Los 37 actuales, fila por fila, idénticos en get_polla_leaderboard() (no debería
 *      moverse nada: esta migración no la toca, solo referencia en_polla_original que no
 *      se renombra). Sumas: 1285/2381/180/3846.
 *   2. Participante ficticio SOLO-revancha: estado_pago_revancha='aprobado', una planilla en
 *      revancha_picks, calc_revancha_points() calcula bien, no aparece en
 *      get_polla_leaderboard(), sí en get_revancha_leaderboard().
 *   3. El error humano: aprueban por error su estado_pago PRINCIPAL -> sigue sin aparecer.
 *   4. Un participante real (La Floresta) que además paga revancha: aparece en ambos, con
 *      puntuaciones independientes; su puntaje principal no se mueve.
 *   5. Hallazgo #20 sigue intacto con los nombres nuevos: UPDATE de solo puntaje pasa con la
 *      revancha cerrada; UPDATE de predicción sigue rechazado.
 *   6. revancha_picks_validate rechaza un partido que no es semis/final (m103).
 * Post-check por REST: sumas de picks intactas. Post-check por Management API: los nombres
 * VIEJOS (repechaje_*) siguen existiendo (nada se aplicó todavía) y los NUEVOS no.
 *
 * Uso: SUPABASE_PAT=sbp_... node scripts/e2e_revancha_schema.mjs
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

console.log("== E2E migración de renombrado repechaje→revancha (transaccional, ROLLBACK) ==\n");
const before = await sums();
console.log(
  `✓ Sumas reales antes: grupos=${before.grupos} partidos=${before.partidos} especiales=${before.especiales} total=${before.total} (${before.filas} filas)\n`,
);

const migrationSql = readFileSync(
  join(root, "supabase/migrations/20260726000000_repechaje_a_revancha.sql"),
  "utf8",
);

const LA_FLORESTA_ID = "06d42e5f-d3a7-487d-bbc8-a93e03d771fd";

const TEST_SQL = `
-- 0) Snapshot PRE-rename.
CREATE TEMP TABLE _pre_lb AS SELECT * FROM public.get_polla_leaderboard();
CREATE TEMP TABLE _pre_floresta_picks AS
  SELECT puntos_grupos, puntos_partidos, puntos_especiales, puntos_total
  FROM public.picks WHERE participant_id = '${LA_FLORESTA_ID}';

-- 1) La migración de renombrado, tal cual el archivo.
${migrationSql}

-- 2) El resto del E2E, en un DO que termina forzando ROLLBACK de TODO lo anterior.
DO $e2e$
DECLARE
  admin_uuid uuid := '1e1fc0d6-c5c3-4a5f-90b1-9771538faab3';
  diff_a int; diff_b int;
  post_sum record;
  ghost_id uuid;
  rep_row record;
  ghost_puntos int;
  caught boolean; errmsg text;
  puntos_antes int;
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

  -- La revancha arranca CERRADA (revancha_abierta=false, el rename no cambia el valor) --
  -- toda la carga de datos de prueba se hace como admin, que salta ese candado por diseño.
  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);

  -- ===== CASO 2: participante ficticio SOLO-revancha =====
  INSERT INTO public.participants (nombre, estado_pago, estado_pago_revancha)
  VALUES ('E2E Fantasma Revancha', 'pendiente', 'aprobado')
  RETURNING id INTO ghost_id;

  IF (SELECT en_polla_original FROM public.participants WHERE id = ghost_id) <> false THEN
    RAISE EXCEPTION 'E2E_SETUP_FAIL: el fantasma no nacio con en_polla_original=false';
  END IF;

  -- m101 FRA 0-2 ESP -> predicho 0-2 exacto (5). m102 ENG 1-2 ARG -> predicho 1-3 (3).
  -- m104 ESP 0-0 ARG -> predicho 1-1 (1). Esperado: 9 pts, aciertos_5=1, aciertos_3=1.
  INSERT INTO public.revancha_picks (participant_id, extra_matches)
  VALUES (
    ghost_id,
    jsonb_build_object(
      'm101', jsonb_build_object('gh', 0, 'ga', 2),
      'm102', jsonb_build_object('gh', 1, 'ga', 3),
      'm104', jsonb_build_object('gh', 1, 'ga', 1)
    )
  );
  PERFORM public.calc_revancha_points(ghost_id);

  SELECT * INTO rep_row FROM public.revancha_picks WHERE participant_id = ghost_id;
  ghost_puntos := rep_row.puntos;
  IF NOT (rep_row.puntos = 9 AND rep_row.aciertos_5 = 1 AND rep_row.aciertos_3 = 1 AND rep_row.aciertos_2 = 0) THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: puntos del fantasma no cuadran (puntos=%, c5=%, c3=%, c2=%)',
      rep_row.puntos, rep_row.aciertos_5, rep_row.aciertos_3, rep_row.aciertos_2;
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_polla_leaderboard() WHERE participant_id = ghost_id) THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: el fantasma SI aparece en get_polla_leaderboard()';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_revancha_leaderboard() WHERE participant_id = ghost_id AND puntos = 9) THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: el fantasma NO aparece (o con puntos incorrectos) en get_revancha_leaderboard()';
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

  -- ===== CASO 4: participante REAL (La Floresta) que ADEMÁS paga revancha =====
  UPDATE public.participants SET estado_pago_revancha = 'aprobado' WHERE id = '${LA_FLORESTA_ID}';

  -- m101 FRA 0-2 ESP -> predicho 1-1 (0). m102 ENG 1-2 ARG -> predicho 2-2 (1, pa=oa).
  -- m104 ESP 0-0 ARG -> predicho 0-1 (1, ph=oh). Esperado: 2 pts, sin aciertos_5/3.
  INSERT INTO public.revancha_picks (participant_id, extra_matches)
  VALUES (
    '${LA_FLORESTA_ID}',
    jsonb_build_object(
      'm101', jsonb_build_object('gh', 1, 'ga', 1),
      'm102', jsonb_build_object('gh', 2, 'ga', 2),
      'm104', jsonb_build_object('gh', 0, 'ga', 1)
    )
  );
  PERFORM public.calc_revancha_points('${LA_FLORESTA_ID}');

  SELECT * INTO rep_row FROM public.revancha_picks WHERE participant_id = '${LA_FLORESTA_ID}';
  IF NOT (rep_row.puntos = 2 AND rep_row.aciertos_5 = 0 AND rep_row.aciertos_3 = 0 AND rep_row.aciertos_2 = 0) THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: puntos de revancha de La Floresta no cuadran (puntos=%, c5=%, c3=%, c2=%)',
      rep_row.puntos, rep_row.aciertos_5, rep_row.aciertos_3, rep_row.aciertos_2;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_polla_leaderboard() WHERE participant_id = '${LA_FLORESTA_ID}') THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: La Floresta desaparecio de get_polla_leaderboard()';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_revancha_leaderboard() WHERE participant_id = '${LA_FLORESTA_ID}' AND puntos = 2) THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: La Floresta no aparece (o con puntos incorrectos) en get_revancha_leaderboard()';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.picks p, _pre_floresta_picks pre
    WHERE p.participant_id = '${LA_FLORESTA_ID}'
      AND (p.puntos_grupos, p.puntos_partidos, p.puntos_especiales, p.puntos_total)
          IS DISTINCT FROM (pre.puntos_grupos, pre.puntos_partidos, pre.puntos_especiales, pre.puntos_total)
  ) THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: los puntos PRINCIPALES de La Floresta se movieron al tocar revancha';
  END IF;

  -- ===== HALLAZGO #20, con los nombres nuevos: sin sesión, revancha cerrada =====
  PERFORM set_config('request.jwt.claim.sub', '', true); -- sin sesión

  puntos_antes := (SELECT puntos FROM public.revancha_picks WHERE participant_id = ghost_id);
  caught := false;
  BEGIN
    UPDATE public.revancha_picks SET puntos = puntos_antes + 1 WHERE participant_id = ghost_id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  IF caught THEN
    RAISE EXCEPTION 'E2E_FAIL hallazgo20 (caso A): un UPDATE de SOLO puntaje sin sesion fue rechazado (%) -- el candado renombrado no deberia mirar esta columna', errmsg;
  END IF;
  UPDATE public.revancha_picks SET puntos = puntos_antes WHERE participant_id = ghost_id;

  caught := false;
  BEGIN
    UPDATE public.revancha_picks
       SET extra_matches = extra_matches || jsonb_build_object('m104', jsonb_build_object('gh', 2, 'ga', 2))
     WHERE participant_id = ghost_id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL hallazgo20 (caso B): un cambio de PREDICCION sin sesion y con la revancha cerrada PASO (debia rechazarse)';
  END IF;
  IF errmsg NOT LIKE '%todavía no está abierta%' THEN
    RAISE EXCEPTION 'E2E_FAIL hallazgo20 (caso B): rechazado pero por otra razon: %', errmsg;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);

  -- ===== Bonus: revancha_picks_validate rechaza un partido que no es semis/final =====
  caught := false;
  BEGIN
    UPDATE public.revancha_picks
       SET extra_matches = extra_matches || jsonb_build_object('m103', jsonb_build_object('gh', 1, 'ga', 1))
     WHERE participant_id = ghost_id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL bonus: se pudo guardar un marcador de tercer puesto (m103) en revancha_picks';
  END IF;
  IF errmsg NOT LIKE '%no es de semis ni de la final%' THEN
    RAISE EXCEPTION 'E2E_FAIL bonus: rechazado pero por otra razon: %', errmsg;
  END IF;

  RAISE EXCEPTION 'E2E_OK %', jsonb_build_object(
    'caso1_37_identicos', 'paso, sumas 1285/2381/180/3846',
    'caso2_fantasma_solo_revancha', jsonb_build_object('puntos', ghost_puntos, 'en_principal', false, 'en_revancha', true),
    'caso3_error_humano_estado_pago', 'paso, sigue sin aparecer en la principal',
    'caso4_la_floresta_ambos', jsonb_build_object('puntos_revancha', 2, 'en_ambos', true, 'principal_intacto', true),
    'hallazgo20_solo_puntaje_pasa_sin_sesion', 'paso',
    'hallazgo20_prediccion_sigue_rechazada', 'paso',
    'bonus_m103_rechazado', 'paso'
  )::text;
END $e2e$;
`;

const run = await mgmtQuery(TEST_SQL);
if (run.text.includes("E2E_OK")) {
  console.log("✅ E2E OK — los 6 casos verificados y transacción revertida (ROLLBACK):");
  const m = run.text.match(/E2E_OK\s*(\{.*?\})\s*(?:\\n|\n)CONTEXT/s);
  if (m) {
    try {
      const p = JSON.parse(m[1].replace(/\\"/g, '"'));
      console.log(`   · caso 1 (37 idénticos): ${p.caso1_37_identicos}`);
      console.log(
        `   · caso 2 (fantasma solo-revancha): ${JSON.stringify(p.caso2_fantasma_solo_revancha)}`,
      );
      console.log(`   · caso 3 (error humano de estado_pago): ${p.caso3_error_humano_estado_pago}`);
      console.log(
        `   · caso 4 (La Floresta en ambos): ${JSON.stringify(p.caso4_la_floresta_ambos)}`,
      );
      console.log(
        `   · hallazgo #20 (solo-puntaje pasa sin sesión, cerrada): ${p.hallazgo20_solo_puntaje_pasa_sin_sesion}`,
      );
      console.log(
        `   · hallazgo #20 (predicción sigue rechazada, cerrada): ${p.hallazgo20_prediccion_sigue_rechazada}`,
      );
      console.log(
        `   · bonus (m103 rechazado por revancha_picks_validate): ${p.bonus_m103_rechazado}`,
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

const after = await sums();
if (JSON.stringify(before) !== JSON.stringify(after)) {
  fail(
    `¡Los puntos reales de picks CAMBIARON! antes=${JSON.stringify(before)} después=${JSON.stringify(after)}`,
  );
}
console.log("\n✅ Post-check 1: sumas de picks intactas (ROLLBACK confirmado).");

const check = await mgmtQuery(
  "SELECT to_regclass('public.repechaje_picks') AS tabla_vieja, to_regclass('public.revancha_picks') AS tabla_nueva, " +
    "(SELECT count(*) FROM pg_proc WHERE proname LIKE '%repechaje%') AS funcs_viejas, " +
    "(SELECT count(*) FROM pg_proc WHERE proname LIKE '%revancha%') AS funcs_nuevas;",
);
console.log("Post-check 2 (¿el rename quedó aplicado por accidente?): " + check.text);
if (
  !check.text.includes('"tabla_vieja":"repechaje_picks"') ||
  !check.text.includes('"tabla_nueva":null') ||
  !check.text.includes('"funcs_nuevas":0')
) {
  fail(
    "¡El rename quedó aplicado parcial o totalmente! No debía en este E2E — revisar antes de nada.",
  );
}
console.log(
  "✅ Post-check 2: el rename NO quedó aplicado (repechaje_picks sigue existiendo, revancha_picks no).",
);
