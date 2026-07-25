/**
 * E2E de que una MISMA cuenta (mismo user_id, misma fila de participants) puede estar
 * inscrita en la polla Y en La Revancha, aprobadas por separado, con puntuaciones
 * independientes — usando el mecanismo YA existente (participants_own_update +
 * participants_own_update_guard, migración 20260728000000). Transaccional con ROLLBACK: un
 * solo user_id de principio a fin, nada persiste en producción.
 *
 * Ejercita RLS de verdad (no solo triggers) vía SET ROLE authenticated + jwt claim, porque
 * Management API corre como postgres y bypassea RLS por defecto — mismo criterio que
 * e2e_revancha_inscripcion.mjs.
 *
 * Casos:
 *   1. Alta a la polla (en_polla_original=true, estado_pago='pendiente') -> admin aprueba ->
 *      aparece en get_polla_leaderboard().
 *   2. La MISMA cuenta pide entrar a Revancha (self-update NULL->'pendiente') -> estado_pago
 *      de la polla NO se mueve (comparación campo por campo de toda la fila, no solo
 *      estado_pago).
 *   3. Admin aprueba Revancha ('pendiente'->'aprobado') sin tocar estado_pago.
 *   4. Ahora en AMBAS: aparece en get_polla_leaderboard() Y en get_revancha_leaderboard(),
 *      mismo user_id, puntuaciones calculadas por funciones y tablas completamente
 *      separadas (calc_pick_points/picks vs calc_revancha_points/revancha_picks).
 *   5. Rechazo -> pago -> re-aprobación: admin rechaza Revancha; el usuario NO puede volver
 *      a pedirla (bloqueado por el trigger); el admin SÍ puede aprobarla directo
 *      (rechazado -> aprobado, sin pasar por pendiente).
 *   6. El trigger sigue bloqueando lo de siempre: el usuario no puede tocar su estado_pago
 *      de la polla, ni auto-aprobarse la Revancha.
 *   7. Sumas de control de picks reales, intactas.
 *
 * Uso: SUPABASE_PAT=sbp_... node scripts/e2e_doble_registro_misma_cuenta.mjs
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

console.log("== E2E doble registro, MISMA cuenta (transaccional, ROLLBACK) ==\n");
const before = await sums();
console.log(
  `✓ Sumas reales antes: grupos=${before.grupos} partidos=${before.partidos} especiales=${before.especiales} total=${before.total} (${before.filas} filas)\n`,
);

const TEST_SQL = `
DO $e2e$
DECLARE
  admin_uuid uuid := '${ADMIN_UUID}';
  ghost_user uuid;
  ghost_id uuid;
  pre_lb_count int;
  pre_row record;
  post_row record;
  lb_polla record;
  lb_revancha record;
  caught boolean; errmsg text;
BEGIN
  SELECT count(*) INTO pre_lb_count FROM public.get_polla_leaderboard();

  -- Usuario auth real para la MISMA cuenta de principio a fin.
  ghost_user := gen_random_uuid();
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', ghost_user, 'authenticated', 'authenticated',
    'e2e.doblereg.misma@polla.local', crypt('polla-pin-8800', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  );

  -- ===== CASO 1: alta a la polla (RLS real) -> admin aprueba -> aparece en el leaderboard =====
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', ghost_user::text, true);
  INSERT INTO public.participants (user_id, nombre, email, en_polla_original, estado_pago)
  VALUES (ghost_user, 'E2E Doble Registro Misma Cuenta', 'e2e.doblereg.misma@polla.local', true, 'pendiente')
  RETURNING id INTO ghost_id;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);
  UPDATE public.participants SET estado_pago = 'aprobado' WHERE id = ghost_id;

  IF NOT EXISTS (SELECT 1 FROM public.get_polla_leaderboard() WHERE participant_id = ghost_id) THEN
    RAISE EXCEPTION 'E2E_FAIL caso1: no aparece en get_polla_leaderboard() tras la aprobacion';
  END IF;
  IF (SELECT count(*) FROM public.get_polla_leaderboard()) <> pre_lb_count + 1 THEN
    RAISE EXCEPTION 'E2E_FAIL caso1: el tamano del leaderboard no crecio en exactamente 1';
  END IF;

  -- Snapshot de TODA la fila (no solo estado_pago) para comparar campo por campo después.
  SELECT * INTO pre_row FROM public.participants WHERE id = ghost_id;

  -- ===== CASO 2: la MISMA cuenta pide entrar a Revancha (self-update, RLS real) =====
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', ghost_user::text, true);
  UPDATE public.participants SET estado_pago_revancha = 'pendiente' WHERE id = ghost_id;
  EXECUTE 'RESET ROLE';

  SELECT * INTO post_row FROM public.participants WHERE id = ghost_id;
  IF post_row.estado_pago_revancha IS DISTINCT FROM 'pendiente' THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: estado_pago_revancha no quedo en pendiente';
  END IF;
  -- Comparación CAMPO POR CAMPO de toda la fila (excepto estado_pago_revancha, que es lo
  -- único que debía cambiar): nombre, email, estado_pago, en_polla_original, inscripcion_at.
  IF pre_row.estado_pago IS DISTINCT FROM post_row.estado_pago
     OR pre_row.en_polla_original IS DISTINCT FROM post_row.en_polla_original
     OR pre_row.nombre IS DISTINCT FROM post_row.nombre
     OR pre_row.email IS DISTINCT FROM post_row.email
     OR pre_row.inscripcion_at IS DISTINCT FROM post_row.inscripcion_at
  THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: algun otro campo de la fila se movio al pedir entrar a Revancha (pre=%, post=%)', pre_row, post_row;
  END IF;
  IF post_row.estado_pago IS DISTINCT FROM 'aprobado' THEN
    RAISE EXCEPTION 'E2E_FAIL caso2: estado_pago de la polla ya no es aprobado (%)', post_row.estado_pago;
  END IF;

  -- ===== CASO 3: admin aprueba Revancha sin tocar estado_pago =====
  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);
  UPDATE public.participants SET estado_pago_revancha = 'aprobado' WHERE id = ghost_id;

  SELECT * INTO post_row FROM public.participants WHERE id = ghost_id;
  IF post_row.estado_pago_revancha IS DISTINCT FROM 'aprobado' THEN
    RAISE EXCEPTION 'E2E_FAIL caso3: no quedo aprobado en Revancha';
  END IF;
  IF post_row.estado_pago IS DISTINCT FROM 'aprobado' THEN
    RAISE EXCEPTION 'E2E_FAIL caso3: aprobar Revancha movio el estado_pago de la polla (%)', post_row.estado_pago;
  END IF;

  -- ===== CASO 4: ahora en AMBAS, puntuaciones independientes =====
  -- Planilla de Revancha real sobre los 3 partidos de semis+final ya con oficial en prod
  -- (m101 FRA 0-2 ESP, m102 ENG 1-2 ARG, m104 final ESP 0-0 ARG): 0-2 exacto(5) +
  -- 1-3(3, gana ARG y acierta un gol) + 1-1(1, empate) = 9 pts.
  INSERT INTO public.revancha_picks (participant_id, extra_matches) VALUES (
    ghost_id, jsonb_build_object(
      'm101', jsonb_build_object('gh', 0, 'ga', 2),
      'm102', jsonb_build_object('gh', 1, 'ga', 3),
      'm104', jsonb_build_object('gh', 1, 'ga', 1)
    ));
  PERFORM public.calc_revancha_points(ghost_id);

  SELECT * INTO lb_polla FROM public.get_polla_leaderboard() WHERE participant_id = ghost_id;
  SELECT * INTO lb_revancha FROM public.get_revancha_leaderboard() WHERE participant_id = ghost_id;

  IF lb_polla.participant_id IS NULL THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: no aparece en get_polla_leaderboard() estando en ambas';
  END IF;
  IF lb_revancha.participant_id IS NULL THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: no aparece en get_revancha_leaderboard() estando en ambas';
  END IF;
  IF NOT (lb_revancha.puntos = 9 AND lb_revancha.aciertos_5 = 1 AND lb_revancha.aciertos_3 = 1) THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: puntos de Revancha no cuadran (puntos=%, c5=%, c3=%)', lb_revancha.puntos, lb_revancha.aciertos_5, lb_revancha.aciertos_3;
  END IF;
  IF lb_polla.puntos_total IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'E2E_FAIL caso4: puntos_total de la polla no es 0 (sin picks reales) — algo los movio (%)', lb_polla.puntos_total;
  END IF;

  -- ===== CASO 5: rechazo -> el usuario NO puede re-pedir -> el admin SI puede reaprobar directo =====
  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);
  UPDATE public.participants SET estado_pago_revancha = 'rechazado' WHERE id = ghost_id;

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', ghost_user::text, true);
  caught := false;
  BEGIN
    UPDATE public.participants SET estado_pago_revancha = 'pendiente' WHERE id = ghost_id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL caso5: el usuario PUDO volver a pedir Revancha tras el rechazo (debia bloquearse)';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);
  UPDATE public.participants SET estado_pago_revancha = 'aprobado' WHERE id = ghost_id;
  SELECT * INTO post_row FROM public.participants WHERE id = ghost_id;
  IF post_row.estado_pago_revancha IS DISTINCT FROM 'aprobado' THEN
    RAISE EXCEPTION 'E2E_FAIL caso5: el admin no pudo re-aprobar directo (rechazado->aprobado)';
  END IF;

  -- ===== CASO 6: el trigger sigue bloqueando lo de siempre (estado_pago propio, auto-aprobación) =====
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', ghost_user::text, true);
  caught := false;
  BEGIN
    UPDATE public.participants SET estado_pago = 'rechazado' WHERE id = ghost_id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL caso6a: el usuario pudo cambiar su propio estado_pago de la polla';
  END IF;

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', ghost_user::text, true);
  caught := false;
  BEGIN
    UPDATE public.participants SET estado_pago_revancha = 'pendiente' WHERE id = ghost_id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL caso6b: el usuario pudo tocar estado_pago_revancha ya aprobado (debia rechazarse)';
  END IF;

  RAISE EXCEPTION 'E2E_OK %', jsonb_build_object(
    'caso1_alta_polla_aprobada', jsonb_build_object('en_leaderboard', true),
    'caso2_pide_entrar_sin_mover_polla', jsonb_build_object('estado_pago_revancha', 'pendiente', 'estado_pago_intacto', true),
    'caso3_admin_aprueba_revancha', jsonb_build_object('estado_pago_intacto', true),
    'caso4_en_ambas_independiente', jsonb_build_object('revancha_puntos', lb_revancha.puntos, 'polla_puntos_total', lb_polla.puntos_total),
    'caso5_rechazo_bloqueo_y_reaprobacion_admin', 'paso',
    'caso6_trigger_sigue_bloqueando', 'paso'
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
      console.log(
        `   · caso 1 (alta polla aprobada): ${JSON.stringify(p.caso1_alta_polla_aprobada)}`,
      );
      console.log(
        `   · caso 2 (pide entrar sin mover polla): ${JSON.stringify(p.caso2_pide_entrar_sin_mover_polla)}`,
      );
      console.log(
        `   · caso 3 (admin aprueba Revancha): ${JSON.stringify(p.caso3_admin_aprueba_revancha)}`,
      );
      console.log(
        `   · caso 4 (en ambas, independiente): ${JSON.stringify(p.caso4_en_ambas_independiente)}`,
      );
      console.log(
        `   · caso 5 (rechazo -> bloqueo -> re-aprobación admin): ${p.caso5_rechazo_bloqueo_y_reaprobacion_admin}`,
      );
      console.log(`   · caso 6 (trigger sigue bloqueando): ${p.caso6_trigger_sigue_bloqueando}`);
    } catch {
      console.log("   payload: " + run.text.slice(0, 1800));
    }
  } else {
    console.log("   payload crudo: " + run.text.slice(0, 1800));
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
console.log("\n✅ Post-check: sumas de picks intactas (ROLLBACK confirmado) — 7/7.");

const check = await mgmtQuery(
  "SELECT count(*) AS ghosts_residuales FROM public.participants WHERE nombre = 'E2E Doble Registro Misma Cuenta';",
);
console.log("Residuos: " + check.text);
if (!check.text.includes('"ghosts_residuales":0')) {
  fail("¡Quedó un participante ficticio en producción! Revisar antes de nada.");
}
console.log("✅ Cero residuos en producción.");
