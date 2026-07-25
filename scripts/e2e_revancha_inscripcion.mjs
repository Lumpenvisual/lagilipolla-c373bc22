/**
 * E2E de supabase/migrations/20260728000000_revancha_inscripcion.sql (estado_pago nullable +
 * participants_own_insert reforzado + participants_own_update nueva, con guard de
 * inmutabilidad de campos). Transaccional, con ROLLBACK garantizado: la migración entera
 * (leída del disco) viaja en el MISMO request que el DO final que fuerza el rollback vía
 * RAISE EXCEPTION.
 *
 * Reejecutado 28-jul-2026 contra producción YA MIGRADA (mismo criterio que
 * e2e_revancha_recalc.mjs): dos ajustes respecto de la corrida pre-aplicación —
 *   1) Se antepone un `DROP POLICY IF EXISTS "participants_own_update"` antes del cuerpo de
 *      la migración, porque esa policy (a diferencia de participants_own_insert, que sí se
 *      DROPea a sí misma) no traía guarda de idempotencia y ya existe en prod — sin este
 *      DROP, el segundo CREATE POLICY del mismo nombre abortaría la transacción antes de
 *      llegar a los 8 casos de prueba.
 *   2) El post-check final ahora espera que policy/trigger SÍ existan y que estado_pago YA
 *      sea nullable (antes esperaba lo contrario).
 *
 * A diferencia de los E2E anteriores de este proyecto, este SÍ ejercita RLS de verdad para
 * los casos de INSERT/UPDATE propio: Management API corre como `postgres` (superusuario,
 * bypassea RLS), así que los casos que dependen de que la policy realmente RECHACE algo
 * usan `SET ROLE authenticated` + `set_config('request.jwt.claim.sub', ...)` antes de cada
 * intento, y `RESET ROLE` después — sin esto, cualquier INSERT/UPDATE "ilegal" pasaría igual
 * bajo el superusuario y el E2E daría un falso verde.
 *
 * Casos:
 *   A. Alta solo-revancha (persona nueva) con la forma B exacta -> pasa, estado_pago queda
 *      NULL, en_polla_original queda false.
 *   B. La misma persona nueva intenta colarse con estado_pago_revancha='aprobado' -> RLS
 *      rechaza (auto-aprobación).
 *   C. Alta "mezclada" (en_polla_original=true pero además con estado_pago_revancha ya
 *      seteado) -> RLS rechaza (ninguna de las dos formas la cubre).
 *   D. Participante EXISTENTE de la polla (en_polla_original=true, sin revancha aún) pide
 *      entrar: self-UPDATE de estado_pago_revancha NULL->'pendiente' -> pasa; su estado_pago
 *      de la polla y sus puntos de picks NO se mueven.
 *   E. El mismo participante intenta auto-aprobarse la revancha -> el trigger de
 *      inmutabilidad rechaza.
 *   F. El mismo participante intenta tocar su propio estado_pago (polla principal) -> el
 *      trigger de inmutabilidad rechaza.
 *   G. El admin SÍ puede aprobar la revancha del participante nuevo (bypass del guard).
 *   H. Ese participante aprobado en revancha sigue sin aparecer en get_polla_leaderboard()
 *      (las dos guardas ya existentes — estado_pago y en_polla_original — siguen intactas).
 * Post-check por REST: sumas de picks intactas (1285/2381/180/3846, esta migración no toca
 * picks ni revancha_picks). Post-check por Management API: la policy y el trigger nuevos NO
 * quedaron aplicados a producción (nada de esto se aplicó todavía).
 *
 * Uso: SUPABASE_PAT=sbp_... node scripts/e2e_revancha_inscripcion.mjs
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

console.log("== E2E migración de inscripción a La Revancha (transaccional, ROLLBACK) ==\n");
const before = await sums();
console.log(
  `✓ Sumas reales antes: grupos=${before.grupos} partidos=${before.partidos} especiales=${before.especiales} total=${before.total} (${before.filas} filas)\n`,
);

const migrationSql =
  'DROP POLICY IF EXISTS "participants_own_update" ON public.participants;\n' +
  readFileSync(join(root, "supabase/migrations/20260728000000_revancha_inscripcion.sql"), "utf8");

const ADMIN_UUID = "1e1fc0d6-c5c3-4a5f-90b1-9771538faab3";

const TEST_SQL = `
-- 1) La migración propuesta, tal cual el archivo.
${migrationSql}

-- 2) El resto del E2E, en un DO que termina forzando ROLLBACK de TODO lo anterior.
DO $e2e$
DECLARE
  admin_uuid uuid := '${ADMIN_UUID}';
  new_user_id uuid;
  existing_part record;
  ghost_part_id uuid;
  caught boolean; errmsg text;
  pre_lb_count int;
  pre_existing_puntos_total int;
BEGIN
  SELECT count(*) INTO pre_lb_count FROM public.get_polla_leaderboard();

  -- Un participante REAL, ya de la polla original, que todavía no pidió entrar a la revancha.
  SELECT p.id, p.user_id, p.estado_pago INTO existing_part
  FROM public.participants p
  WHERE p.en_polla_original = true AND p.user_id IS NOT NULL AND p.estado_pago_revancha IS NULL
  LIMIT 1;
  IF existing_part IS NULL THEN
    RAISE EXCEPTION 'E2E_SETUP_FAIL: no hay ningun participante existente apto para el caso "pedir entrar"';
  END IF;
  SELECT puntos_total INTO pre_existing_puntos_total FROM public.picks WHERE participant_id = existing_part.id;

  -- Usuario auth temporal para la "persona nueva" (participants.user_id tiene FK a auth.users).
  new_user_id := gen_random_uuid();
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated',
    'e2e.revancha.nuevo@polla.local', crypt('polla-pin-9999', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  );

  -- ===== CASO A: alta solo-revancha, forma B exacta, vía RLS real (SET ROLE authenticated) =====
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', new_user_id::text, true);
  INSERT INTO public.participants (user_id, nombre, email, en_polla_original, estado_pago, estado_pago_revancha)
  VALUES (new_user_id, 'E2E Nuevo Solo-Revancha', 'e2e.revancha.nuevo@polla.local', false, NULL, 'pendiente')
  RETURNING id INTO ghost_part_id;
  EXECUTE 'RESET ROLE';

  IF (SELECT estado_pago FROM public.participants WHERE id = ghost_part_id) IS NOT NULL THEN
    RAISE EXCEPTION 'E2E_FAIL casoA: estado_pago no quedo NULL para el alta solo-revancha';
  END IF;
  IF (SELECT en_polla_original FROM public.participants WHERE id = ghost_part_id) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'E2E_FAIL casoA: en_polla_original no quedo false';
  END IF;

  -- ===== CASO B: la misma persona nueva intenta auto-aprobarse la revancha en el alta =====
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', new_user_id::text, true);
  caught := false;
  BEGIN
    INSERT INTO public.participants (user_id, nombre, en_polla_original, estado_pago, estado_pago_revancha)
    VALUES (new_user_id, 'E2E Trampa Auto-Aprobado', false, NULL, 'aprobado');
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL casoB: un self-insert con estado_pago_revancha=aprobado PASO (debia rechazarse por RLS)';
  END IF;

  -- ===== CASO C: alta "mezclada" (ninguna de las dos formas del WITH CHECK la cubre) =====
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', new_user_id::text, true);
  caught := false;
  BEGIN
    INSERT INTO public.participants (user_id, nombre, en_polla_original, estado_pago, estado_pago_revancha)
    VALUES (new_user_id, 'E2E Trampa Mezclada', true, 'pendiente', 'pendiente');
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL casoC: un self-insert mezclando ambas formas PASO (debia rechazarse)';
  END IF;

  -- ===== CASO D: participante EXISTENTE pide entrar (own_update, NULL -> 'pendiente') =====
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', existing_part.user_id::text, true);
  UPDATE public.participants SET estado_pago_revancha = 'pendiente' WHERE id = existing_part.id;
  EXECUTE 'RESET ROLE';

  IF (SELECT estado_pago_revancha FROM public.participants WHERE id = existing_part.id) IS DISTINCT FROM 'pendiente' THEN
    RAISE EXCEPTION 'E2E_FAIL casoD: pedir entrar a la revancha no quedo en pendiente';
  END IF;
  IF (SELECT estado_pago FROM public.participants WHERE id = existing_part.id) IS DISTINCT FROM existing_part.estado_pago THEN
    RAISE EXCEPTION 'E2E_FAIL casoD: estado_pago de la polla principal se movio al pedir entrar a la revancha';
  END IF;
  IF (SELECT puntos_total FROM public.picks WHERE participant_id = existing_part.id) IS DISTINCT FROM pre_existing_puntos_total THEN
    RAISE EXCEPTION 'E2E_FAIL casoD: los puntos de la polla principal de ese participante se movieron';
  END IF;

  -- ===== CASO E: el mismo participante intenta auto-aprobarse la revancha =====
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', existing_part.user_id::text, true);
  caught := false;
  BEGIN
    UPDATE public.participants SET estado_pago_revancha = 'aprobado' WHERE id = existing_part.id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL casoE: el participante se auto-aprobo la revancha (debia rechazarse)';
  END IF;

  -- ===== CASO F: el mismo participante intenta tocar su propio estado_pago (polla principal) =====
  -- Debe ser un valor REALMENTE distinto del actual, si no el guard no ve ningun cambio.
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', existing_part.user_id::text, true);
  caught := false;
  BEGIN
    UPDATE public.participants
       SET estado_pago = CASE WHEN existing_part.estado_pago = 'aprobado' THEN 'rechazado' ELSE 'aprobado' END
     WHERE id = existing_part.id;
  EXCEPTION WHEN OTHERS THEN
    caught := true; errmsg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT caught THEN
    RAISE EXCEPTION 'E2E_FAIL casoF: el participante pudo cambiar su propio estado_pago (debia rechazarse)';
  END IF;

  -- ===== CASO G: el admin SI puede aprobar la revancha del nuevo participante =====
  PERFORM set_config('request.jwt.claim.sub', admin_uuid::text, true);
  UPDATE public.participants SET estado_pago_revancha = 'aprobado' WHERE id = ghost_part_id;
  IF (SELECT estado_pago_revancha FROM public.participants WHERE id = ghost_part_id) IS DISTINCT FROM 'aprobado' THEN
    RAISE EXCEPTION 'E2E_FAIL casoG: el admin no pudo aprobar la revancha del participante nuevo';
  END IF;

  -- ===== CASO H: sigue sin aparecer en la tabla principal (las dos guardas ya existentes) =====
  IF EXISTS (SELECT 1 FROM public.get_polla_leaderboard() WHERE participant_id = ghost_part_id) THEN
    RAISE EXCEPTION 'E2E_FAIL casoH: el solo-revancha aprobado aparece en get_polla_leaderboard()';
  END IF;
  IF (SELECT count(*) FROM public.get_polla_leaderboard()) <> pre_lb_count THEN
    RAISE EXCEPTION 'E2E_FAIL casoH: get_polla_leaderboard() cambio de tamano (antes=%, ahora=%)',
      pre_lb_count, (SELECT count(*) FROM public.get_polla_leaderboard());
  END IF;

  RAISE EXCEPTION 'E2E_OK %', jsonb_build_object(
    'casoA_alta_solo_revancha', jsonb_build_object('estado_pago', 'NULL', 'en_polla_original', false),
    'casoB_auto_aprobado_en_alta_rechazado', 'paso',
    'casoC_alta_mezclada_rechazada', 'paso',
    'casoD_pedir_entrar', jsonb_build_object('estado_pago_revancha', 'pendiente', 'polla_principal_intacta', true),
    'casoE_auto_aprobacion_rechazada', 'paso',
    'casoF_tocar_estado_pago_propio_rechazado', 'paso',
    'casoG_admin_aprueba_revancha', 'paso',
    'casoH_guardas_intactas', jsonb_build_object('en_principal', false, 'tamano_leaderboard', pre_lb_count)
  )::text;
END $e2e$;
`;

const run = await mgmtQuery(TEST_SQL);
if (run.text.includes("E2E_OK")) {
  console.log("✅ E2E OK — los 8 casos verificados y transacción revertida (ROLLBACK):");
  const m = run.text.match(/E2E_OK\s*(\{.*?\})\s*(?:\\n|\n)CONTEXT/s);
  if (m) {
    try {
      const p = JSON.parse(m[1].replace(/\\"/g, '"'));
      console.log(
        `   · caso A (alta solo-revancha): ${JSON.stringify(p.casoA_alta_solo_revancha)}`,
      );
      console.log(
        `   · caso B (auto-aprobado en alta rechazado): ${p.casoB_auto_aprobado_en_alta_rechazado}`,
      );
      console.log(`   · caso C (alta mezclada rechazada): ${p.casoC_alta_mezclada_rechazada}`);
      console.log(`   · caso D (pedir entrar): ${JSON.stringify(p.casoD_pedir_entrar)}`);
      console.log(`   · caso E (auto-aprobación rechazada): ${p.casoE_auto_aprobacion_rechazada}`);
      console.log(
        `   · caso F (tocar estado_pago propio rechazado): ${p.casoF_tocar_estado_pago_propio_rechazado}`,
      );
      console.log(`   · caso G (admin aprueba revancha): ${p.casoG_admin_aprueba_revancha}`);
      console.log(`   · caso H (guardas intactas): ${JSON.stringify(p.casoH_guardas_intactas)}`);
    } catch {
      console.log("   payload: " + run.text.slice(0, 1600));
    }
  } else {
    console.log("   payload crudo: " + run.text.slice(0, 1600));
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
  "SELECT " +
    "(SELECT count(*) FROM pg_policies WHERE tablename='participants' AND policyname='participants_own_update') AS policy_nueva, " +
    "(SELECT count(*) FROM pg_trigger WHERE tgname='participants_own_update_guard_before') AS trigger_nuevo, " +
    "(SELECT attnotnull FROM pg_attribute WHERE attrelid='public.participants'::regclass AND attname='estado_pago') AS estado_pago_not_null;",
);
console.log("Post-check 2 (objetos reales ya instalados en prod): " + check.text);
if (
  !check.text.includes('"policy_nueva":1') ||
  !check.text.includes('"trigger_nuevo":1') ||
  !check.text.includes('"estado_pago_not_null":false')
) {
  fail(
    "¡Los objetos de la migración NO están instalados como se esperaba! Revisar antes de nada.",
  );
}
console.log(
  "✅ Post-check 2: participants_own_update + trigger existen en prod, estado_pago es nullable.",
);
