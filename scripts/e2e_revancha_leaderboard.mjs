/**
 * E2E de supabase/migrations/20260729000000_revancha_public_pick.sql (get_public_revancha_
 * pick, equivalente de get_public_pick pero para La Revancha, con redacción por kickoff).
 * Transaccional, con ROLLBACK garantizado: la migración entera viaja en el MISMO request
 * que el DO final que fuerza el rollback vía RAISE EXCEPTION — nada de esto queda en
 * producción.
 *
 * Reejecutado 29-jul-2026 contra producción YA MIGRADA (mismo criterio que
 * e2e_revancha_recalc.mjs / e2e_revancha_inscripcion.mjs): la migración usa
 * `CREATE OR REPLACE FUNCTION`, así que es idempotente sin ajustes — el único cambio es el
 * post-check final, que ahora espera que la función SÍ exista (antes esperaba lo contrario).
 *
 * Los 3 partidos de semis+final (m101, m102, m104) YA tienen resultado oficial real en
 * prod (FRA 0-2 ESP, ENG 1-2 ARG, ESP 0-0 ARG — la final) — se reutilizan tal cual, sin
 * tocarlos, para calcular puntos de picks ficticios con predicciones conocidas.
 *
 * Casos:
 *   1. Con 0 inscritos reales en Revancha (estado real de prod ahora mismo), get_revancha_
 *      leaderboard() devuelve 0 filas sin romper.
 *   2. 3 participantes ficticios con revancha_picks distintas -> get_revancha_leaderboard()
 *      ordena por puntos con los desempates 5→3→2 correctos (Ghost C 15pts > Ghost A 9pts >
 *      Ghost B 2pts).
 *   3. get_polla_leaderboard() y las sumas reales de picks NO se ven afectadas: 37 filas,
 *      1285/2381/180/3846.
 *   4. get_public_revancha_pick() de un ficticio solo trae extra_matches de semis/final (las
 *      únicas columnas que la función expone) — nunca groups/group_k_matches.
 *   5. REDACCIÓN POR KICKOFF (decisión confirmada: revelar es automático por hora de
 *      partido, igual que get_public_pick — mismo patrón, no uno nuevo):
 *      a) Con TODA la fase de semis (m101+m102) reprogramada al futuro, get_public_revancha_
 *         pick() para un TERCERO no trae ni m101 ni m102 — pero la fila CRUDA de
 *         revancha_picks, leída como el DUEÑO (RLS por ownership, sin candado de fecha) y
 *         como el ADMIN (RLS admin_all), sigue trayendo el marcador completo.
 *      b) Semis en el pasado (revelada) + final en el futuro (oculta): get_public_revancha_
 *         pick() trae m101/m102 pero NO m104 — independencia de fases, no "todo o nada".
 * Post-check por REST: sumas de picks reales intactas. Post-check por Management API:
 * get_public_revancha_pick no quedó creada en producción.
 *
 * Uso: SUPABASE_PAT=sbp_... node scripts/e2e_revancha_leaderboard.mjs
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
const ADMIN_UUID = "1e1fc0d6-c5c3-4a5f-90b1-9771538faab3";

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

console.log(
  "== E2E get_public_revancha_pick + tabla de La Revancha (transaccional, ROLLBACK) ==\n",
);
const before = await sums();
console.log(
  `✓ Sumas reales antes: grupos=${before.grupos} partidos=${before.partidos} especiales=${before.especiales} total=${before.total} (${before.filas} filas)\n`,
);

const migrationSql = readFileSync(
  join(root, "supabase/migrations/20260729000000_revancha_public_pick.sql"),
  "utf8",
);

const TEST_SQL = `
-- 1) La migración propuesta, tal cual el archivo.
${migrationSql}

-- 2) El resto del E2E, en un DO que termina forzando ROLLBACK de TODO lo anterior.
DO $e2e$
DECLARE
  admin_uuid uuid := '${ADMIN_UUID}';
  ghost_a uuid; ghost_b uuid; ghost_c uuid; ghost_a_user uuid;
  pre_lb_count int;
  pre_revancha_lb_count int;
  rowA record; rowB record; rowC record;
  detailA record;
  ownerRaw record; adminRaw record; thirdPartyDetail record; indepDetail record;
BEGIN
  -- Usuario auth temporal para Ghost A (para probar que el DUEÑO ve su fila cruda sin
  -- redacción, vía RLS por ownership — no vía get_public_revancha_pick).
  ghost_a_user := gen_random_uuid();
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', ghost_a_user, 'authenticated', 'authenticated',
    'e2e.revancha.ghosta@polla.local', crypt('polla-pin-9977', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  );
  SELECT count(*) INTO pre_lb_count FROM public.get_polla_leaderboard();
  SELECT count(*) INTO pre_revancha_lb_count FROM public.get_revancha_leaderboard();

  -- ===== CASO 1: con 0 inscritos reales, no rompe =====
  IF pre_revancha_lb_count <> 0 THEN
    RAISE EXCEPTION 'E2E_SETUP_FAIL: ya hay % inscritos reales en Revancha (se esperaba 0)', pre_revancha_lb_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);

  -- ===== CASO 2: 3 participantes ficticios con revancha_picks distintas =====
  INSERT INTO public.participants (user_id, nombre, en_polla_original, estado_pago, estado_pago_revancha)
  VALUES (ghost_a_user, 'E2E Revancha Ghost A', false, NULL, 'aprobado') RETURNING id INTO ghost_a;
  INSERT INTO public.participants (nombre, en_polla_original, estado_pago, estado_pago_revancha)
  VALUES ('E2E Revancha Ghost B', false, NULL, 'aprobado') RETURNING id INTO ghost_b;
  INSERT INTO public.participants (nombre, en_polla_original, estado_pago, estado_pago_revancha)
  VALUES ('E2E Revancha Ghost C', false, NULL, 'aprobado') RETURNING id INTO ghost_c;

  -- Oficiales reales ya existentes (no se tocan): m101 FRA 0-2 ESP, m102 ENG 1-2 ARG, m104 (final) ESP 0-0 ARG.
  -- Ghost A: 0-2 exacto(5) + 1-3(3, gana ARG y acierta un gol) + 1-1(1, empate) = 9, c5=1 c3=1
  INSERT INTO public.revancha_picks (participant_id, extra_matches) VALUES (
    ghost_a, jsonb_build_object(
      'm101', jsonb_build_object('gh', 0, 'ga', 2),
      'm102', jsonb_build_object('gh', 1, 'ga', 3),
      'm104', jsonb_build_object('gh', 1, 'ga', 1)
    ));
  -- Ghost B: 1-1(0) + 2-2(1, empate) + 0-1(1, un gol) = 2, sin aciertos_5/3
  INSERT INTO public.revancha_picks (participant_id, extra_matches) VALUES (
    ghost_b, jsonb_build_object(
      'm101', jsonb_build_object('gh', 1, 'ga', 1),
      'm102', jsonb_build_object('gh', 2, 'ga', 2),
      'm104', jsonb_build_object('gh', 0, 'ga', 1)
    ));
  -- Ghost C: los 3 exactos = 15, c5=3
  INSERT INTO public.revancha_picks (participant_id, extra_matches) VALUES (
    ghost_c, jsonb_build_object(
      'm101', jsonb_build_object('gh', 0, 'ga', 2),
      'm102', jsonb_build_object('gh', 1, 'ga', 2),
      'm104', jsonb_build_object('gh', 0, 'ga', 0)
    ));

  PERFORM public.calc_revancha_points(ghost_a);
  PERFORM public.calc_revancha_points(ghost_b);
  PERFORM public.calc_revancha_points(ghost_c);

  SELECT * INTO rowA FROM public.get_revancha_leaderboard() WHERE participant_id = ghost_a;
  SELECT * INTO rowB FROM public.get_revancha_leaderboard() WHERE participant_id = ghost_b;
  SELECT * INTO rowC FROM public.get_revancha_leaderboard() WHERE participant_id = ghost_c;

  IF NOT (rowC.puntos = 15 AND rowC.aciertos_5 = 3) THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: Ghost C no dio 15pts/aciertos_5=3 (puntos=%, c5=%)', rowC.puntos, rowC.aciertos_5;
  END IF;
  IF NOT (rowA.puntos = 9 AND rowA.aciertos_5 = 1 AND rowA.aciertos_3 = 1) THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: Ghost A no dio 9pts/c5=1/c3=1 (puntos=%, c5=%, c3=%)', rowA.puntos, rowA.aciertos_5, rowA.aciertos_3;
  END IF;
  IF NOT (rowB.puntos = 2 AND rowB.aciertos_5 = 0 AND rowB.aciertos_3 = 0) THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: Ghost B no dio 2pts (puntos=%, c5=%, c3=%)', rowB.puntos, rowB.aciertos_5, rowB.aciertos_3;
  END IF;
  IF NOT (rowC.posicion = 1 AND rowA.posicion = 2 AND rowB.posicion = 3) THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: orden incorrecto (posiciones C=%, A=%, B=%)', rowC.posicion, rowA.posicion, rowB.posicion;
  END IF;

  -- ===== CASO 3: get_polla_leaderboard() y sumas de picks reales, intactas =====
  IF (SELECT count(*) FROM public.get_polla_leaderboard()) <> pre_lb_count THEN
    RAISE EXCEPTION 'E2E_FAIL caso3: get_polla_leaderboard() cambio de tamano';
  END IF;
  IF (SELECT count(*) FROM public.get_polla_leaderboard()) <> 37 THEN
    RAISE EXCEPTION 'E2E_FAIL caso3: get_polla_leaderboard() no tiene 37 filas (%)', (SELECT count(*) FROM public.get_polla_leaderboard());
  END IF;

  -- ===== CASO 4: get_public_revancha_pick solo trae semis/final, nunca grupos =====
  SELECT * INTO detailA FROM public.get_public_revancha_pick(ghost_a);
  IF detailA.participant_id IS NULL THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: get_public_revancha_pick no devolvio nada para Ghost A';
  END IF;
  IF NOT (detailA.extra_matches ? 'm101' AND detailA.extra_matches ? 'm102' AND detailA.extra_matches ? 'm104') THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: faltan partidos de semis/final en el detalle (%)', detailA.extra_matches;
  END IF;
  IF (SELECT to_jsonb(detailA) ? 'groups') OR (SELECT to_jsonb(detailA) ? 'group_k_matches') THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: el detalle de Revancha trae columnas de grupos que no deberia tener';
  END IF;

  -- ===== CASO 5a: TODA la fase de semis (m101+m102) al futuro -> oculta para un tercero,
  --                pero la fila cruda sigue visible para el dueño y para el admin =====
  UPDATE public.tournament_state SET extra_matches = (
    SELECT jsonb_agg(
      CASE WHEN e->>'id' IN ('m101','m102')
           THEN jsonb_set(e, '{fecha}', to_jsonb((now() + interval '5 days')::text))
           ELSE e END
    )
    FROM jsonb_array_elements(extra_matches) e
  ) WHERE id = 1;

  SELECT * INTO thirdPartyDetail FROM public.get_public_revancha_pick(ghost_a);
  IF (thirdPartyDetail.extra_matches ? 'm101') OR (thirdPartyDetail.extra_matches ? 'm102') THEN
    RAISE EXCEPTION 'E2E_FAIL caso5a: semis con fecha futura SI aparecio para un tercero via get_public_revancha_pick (%)', thirdPartyDetail.extra_matches;
  END IF;

  -- El dueño (Ghost A, vía RLS por ownership, SIN pasar por get_public_revancha_pick) sigue
  -- viendo su propia fila completa — la redacción es solo del RPC público, no de la fila cruda.
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', ghost_a_user::text, true);
  SELECT * INTO ownerRaw FROM public.revancha_picks WHERE participant_id = ghost_a;
  EXECUTE 'RESET ROLE';
  IF NOT (ownerRaw.extra_matches ? 'm101' AND ownerRaw.extra_matches ? 'm102') THEN
    RAISE EXCEPTION 'E2E_FAIL caso5a: el DUEÑO no ve su propia fila cruda de revancha_picks (%)', ownerRaw.extra_matches;
  END IF;

  -- El admin también ve la fila cruda completa (RLS admin_all, sin candado de fecha).
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);
  SELECT * INTO adminRaw FROM public.revancha_picks WHERE participant_id = ghost_a;
  EXECUTE 'RESET ROLE';
  IF NOT (adminRaw.extra_matches ? 'm101' AND adminRaw.extra_matches ? 'm102') THEN
    RAISE EXCEPTION 'E2E_FAIL caso5a: el ADMIN no ve la fila cruda completa de revancha_picks (%)', adminRaw.extra_matches;
  END IF;

  -- ===== CASO 5b: semis en el pasado (revelada) + final en el futuro (oculta) ->
  --               independencia de fases, no todo-o-nada =====
  UPDATE public.tournament_state SET extra_matches = (
    SELECT jsonb_agg(
      CASE
        WHEN e->>'id' IN ('m101','m102') THEN jsonb_set(e, '{fecha}', to_jsonb((now() - interval '1 day')::text))
        WHEN e->>'id' = 'm104' THEN jsonb_set(e, '{fecha}', to_jsonb((now() + interval '5 days')::text))
        ELSE e
      END
    )
    FROM jsonb_array_elements(extra_matches) e
  ) WHERE id = 1;

  SELECT * INTO indepDetail FROM public.get_public_revancha_pick(ghost_a);
  IF NOT (indepDetail.extra_matches ? 'm101' AND indepDetail.extra_matches ? 'm102') THEN
    RAISE EXCEPTION 'E2E_FAIL caso5b: semis con fecha pasada NO aparecio (deberia estar revelada) (%)', indepDetail.extra_matches;
  END IF;
  IF indepDetail.extra_matches ? 'm104' THEN
    RAISE EXCEPTION 'E2E_FAIL caso5b: la final con fecha futura SI aparecio (deberia seguir oculta, independiente de semis) (%)', indepDetail.extra_matches;
  END IF;

  RAISE EXCEPTION 'E2E_OK %', jsonb_build_object(
    'caso1_cero_inscritos', 'paso',
    'caso2_orden_correcto', jsonb_build_object('ghostC', rowC.puntos, 'ghostA', rowA.puntos, 'ghostB', rowB.puntos),
    'caso3_polla_intacta', jsonb_build_object('filas', 37),
    'caso4_detalle_solo_semis_final', 'paso',
    'caso5a_futuro_oculto_tercero_pero_dueno_y_admin_ven_crudo', 'paso',
    'caso5b_independencia_de_fases', 'paso'
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
      console.log(`   · caso 1 (0 inscritos): ${p.caso1_cero_inscritos}`);
      console.log(`   · caso 2 (orden correcto): ${JSON.stringify(p.caso2_orden_correcto)}`);
      console.log(`   · caso 3 (polla intacta): ${JSON.stringify(p.caso3_polla_intacta)}`);
      console.log(`   · caso 4 (detalle solo semis/final): ${p.caso4_detalle_solo_semis_final}`);
      console.log(
        `   · caso 5a (futuro oculto para un tercero, dueño/admin ven crudo): ${p.caso5a_futuro_oculto_tercero_pero_dueno_y_admin_ven_crudo}`,
      );
      console.log(
        `   · caso 5b (independencia de fases semis/final): ${p.caso5b_independencia_de_fases}`,
      );
    } catch {
      console.log("   payload: " + run.text.slice(0, 1400));
    }
  } else {
    console.log("   payload crudo: " + run.text.slice(0, 1400));
  }
} else if (run.text.includes("E2E_FAIL") || run.text.includes("E2E_SETUP_FAIL")) {
  fail("Assert E2E falló:\n" + run.text.slice(0, 1800));
} else {
  fail(`Respuesta inesperada (status ${run.status}):\n` + run.text.slice(0, 1800));
}

const after = await sums();
if (JSON.stringify(before) !== JSON.stringify(after)) {
  fail(
    `¡Los puntos reales de picks CAMBIARON! antes=${JSON.stringify(before)} después=${JSON.stringify(after)}`,
  );
}
console.log("\n✅ Post-check 1: sumas de picks intactas (ROLLBACK confirmado).");

const check = await mgmtQuery(
  "SELECT to_regprocedure('public.get_public_revancha_pick(uuid)') AS fn, " +
    "(SELECT count(*) FROM public.participants WHERE nombre LIKE 'E2E Revancha Ghost%') AS ghosts_residuales, " +
    "(SELECT count(*) FROM auth.users WHERE email = 'e2e.revancha.ghosta@polla.local') AS auth_residuales;",
);
console.log("Post-check 2 (objetos reales / residuos): " + check.text);
if (
  check.text.includes('"fn":null') ||
  !check.text.includes('"ghosts_residuales":0') ||
  !check.text.includes('"auth_residuales":0')
) {
  fail(
    "¡get_public_revancha_pick no está instalada como se esperaba, o quedaron residuos! Revisar antes de nada.",
  );
}
console.log(
  "✅ Post-check 2: get_public_revancha_pick existe en prod y no quedaron ghosts/usuarios residuales.",
);
