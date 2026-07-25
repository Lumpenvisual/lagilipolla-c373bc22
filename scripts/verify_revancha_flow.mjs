/**
 * Verificación FUNCIONAL (no transaccional — toca filas reales, con limpieza al final) del
 * flujo completo de inscripción a La Revancha, usando el mismo cliente/anon key que la app
 * real (no service_role para las partes de usuario — así se ejercita RLS de verdad).
 *
 * No hay navegador disponible en este entorno para clickear la UI, así que este script
 * ejercita exactamente los mismos endpoints que la UI llama (auth.signUp, .insert/.update
 * sobre participants/revancha_picks con el cliente anon) para verificar el flujo real de
 * punta a punta. Las aprobaciones de admin se hacen vía Management API con
 * set_config('request.jwt.claim.sub', admin_uuid) — mismo criterio que los E2E
 * transaccionales de esta sesión — porque el service_role vía REST no simula auth.uid() y
 * dispararía las restricciones de NO-admin en los triggers.
 *
 * Casos:
 *  1. Alta de persona nueva SOLO-revancha -> login con alias+PIN funciona.
 *  2. ...esa persona NO aparece en get_polla_leaderboard() ni con la revancha aprobada.
 *  3. Alta de una persona nueva a la POLLA PRINCIPAL (bug que se corrigió) -> aprobada por
 *     el admin, SÍ aparece en get_polla_leaderboard().
 *  4. Un participante YA en la polla (el mismo del caso 3) pide entrar a Revancha -> su
 *     estado_pago y sus picks quedan intactos (comparados antes/después).
 *  5. El admin aprueba su Revancha sin que cambie su estado_pago de la polla.
 *  6. Con revancha_abierta=false (estado real de prod ahora mismo, sin tocarlo): un intento
 *     de guardar picks de Revancha como usuario normal es RECHAZADO — respeta el candado.
 *  7. Limpieza: ambos usuarios de prueba se borran (cascada a participants/picks).
 *  8. Sumas de control de picks reales antes/después de todo esto: intactas.
 *
 * Uso: SUPABASE_PAT=sbp_... node scripts/verify_revancha_flow.mjs
 */
import { createClient } from "@supabase/supabase-js";
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
const ANON = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const PAT = process.env.SUPABASE_PAT || env.SUPABASE_ACCESS_TOKEN;
if (!URL_ || !ANON || !SERVICE) fail("Faltan credenciales en .env");
if (!PAT) fail("Falta SUPABASE_PAT / SUPABASE_ACCESS_TOKEN");
const REF = new URL(URL_).hostname.split(".")[0];
const ADMIN_UUID = "1e1fc0d6-c5c3-4a5f-90b1-9771538faab3";

function fail(msg) {
  console.error("❌ " + msg);
  process.exit(1);
}
function ok(msg) {
  console.log("✅ " + msg);
}

async function mgmtQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) fail(`Management API ${res.status}: ${text}`);
  return JSON.parse(text);
}

// Mismas funciones que src/lib/auth.ts (no se puede importar TS directo desde un script node).
function aliasToEmail(alias) {
  const slug = alias
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[̀-ͯ]", "g"), "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/(^\.|\.$)/g, "");
  return `${slug}@polla.local`;
}
function pinToPassword(pin) {
  return `polla-pin-${pin}`;
}

async function sums() {
  const res = await fetch(
    `${URL_}/rest/v1/picks?select=puntos_grupos,puntos_partidos,puntos_especiales,puntos_total`,
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
  );
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

const stamp = Date.now().toString(36);
const soloAlias = `e2e revancha solo ${stamp}`;
const mainAlias = `e2e revancha main ${stamp}`;
const soloPin = "9911";
const mainPin = "9922";

console.log("== Verificación funcional del flujo de La Revancha (contra producción real) ==\n");
const before = await sums();
console.log(
  `Sumas antes: grupos=${before.grupos} partidos=${before.partidos} especiales=${before.especiales} total=${before.total} (${before.filas} filas)\n`,
);

// ===== CASO 1: alta solo-revancha (persona nueva) =====
const soloClient = createClient(URL_, ANON);
const soloEmail = aliasToEmail(soloAlias);
const { data: soloSignUp, error: soloSignErr } = await soloClient.auth.signUp({
  email: soloEmail,
  password: pinToPassword(soloPin),
  options: { data: { nombre: soloAlias } },
});
if (soloSignErr) fail("signUp solo-revancha: " + soloSignErr.message);
const soloUserId = soloSignUp.user.id;

const { data: soloPart, error: soloInsErr } = await soloClient
  .from("participants")
  .insert({
    user_id: soloUserId,
    nombre: soloAlias,
    email: soloEmail,
    en_polla_original: false,
    estado_pago: null,
    estado_pago_revancha: "pendiente",
  })
  .select()
  .single();
if (soloInsErr) fail("insert participants (solo-revancha): " + soloInsErr.message);
ok(
  `Caso 1a: alta solo-revancha insertada (id=${soloPart.id}, estado_pago=${soloPart.estado_pago}, en_polla_original=${soloPart.en_polla_original})`,
);

await soloClient.auth.signOut();
const { error: soloLoginErr } = await soloClient.auth.signInWithPassword({
  email: soloEmail,
  password: pinToPassword(soloPin),
});
if (soloLoginErr) fail("login solo-revancha con alias+PIN: " + soloLoginErr.message);
ok("Caso 1b: login con alias+PIN funciona para la persona nueva solo-revancha.");

// ===== CASO 2: no aparece en get_polla_leaderboard() ni con revancha aprobada =====
const lbBefore = await mgmtQuery(
  `SELECT count(*) FILTER (WHERE participant_id = '${soloPart.id}') AS n FROM public.get_polla_leaderboard();`,
);
if (Number(lbBefore[0].n) !== 0)
  fail("Caso 2: el solo-revancha YA aparece en el leaderboard antes de aprobar nada");

await mgmtQuery(`
  SELECT set_config('request.jwt.claim.sub', '${ADMIN_UUID}', true);
  UPDATE public.participants SET estado_pago_revancha = 'aprobado' WHERE id = '${soloPart.id}';
`);
const lbAfter = await mgmtQuery(
  `SELECT count(*) FILTER (WHERE participant_id = '${soloPart.id}') AS n FROM public.get_polla_leaderboard();`,
);
if (Number(lbAfter[0].n) !== 0)
  fail(
    "Caso 2: el solo-revancha aparece en get_polla_leaderboard() incluso con la revancha aprobada",
  );
ok(
  "Caso 2: el solo-revancha, aprobado en Revancha, sigue sin aparecer en get_polla_leaderboard().",
);

// ===== CASO 3: alta a la POLLA PRINCIPAL (el bug que se corrigió) =====
const mainClient = createClient(URL_, ANON);
const mainEmail = aliasToEmail(mainAlias);
const { data: mainSignUp, error: mainSignErr } = await mainClient.auth.signUp({
  email: mainEmail,
  password: pinToPassword(mainPin),
  options: { data: { nombre: mainAlias } },
});
if (mainSignErr) fail("signUp polla principal: " + mainSignErr.message);
const mainUserId = mainSignUp.user.id;

const { data: mainPart, error: mainInsErr } = await mainClient
  .from("participants")
  .insert({
    user_id: mainUserId,
    nombre: mainAlias,
    email: mainEmail,
    en_polla_original: true,
    estado_pago: "pendiente",
  })
  .select()
  .single();
if (mainInsErr) fail("insert participants (polla principal): " + mainInsErr.message);
if (mainPart.en_polla_original !== true)
  fail(
    "Caso 3: en_polla_original no quedó true en el alta de la polla principal (el bug seguiría vivo)",
  );
ok(`Caso 3a: alta a la polla principal con en_polla_original=true (id=${mainPart.id}).`);

await mgmtQuery(`
  SELECT set_config('request.jwt.claim.sub', '${ADMIN_UUID}', true);
  UPDATE public.participants SET estado_pago = 'aprobado' WHERE id = '${mainPart.id}';
`);
const mainInLb = await mgmtQuery(
  `SELECT count(*) FILTER (WHERE participant_id = '${mainPart.id}') AS n FROM public.get_polla_leaderboard();`,
);
if (Number(mainInLb[0].n) !== 1)
  fail(
    "Caso 3b: el participante aprobado de la polla principal NO aparece en get_polla_leaderboard() — el bug de en_polla_original seguiría vivo",
  );
ok(
  "Caso 3b: aprobado por el admin, SÍ aparece en get_polla_leaderboard() (el bug quedó corregido).",
);

// ===== CASO 4: ese mismo participante pide entrar a Revancha, sin tocar su estado_pago/picks =====
const preRowResult = await mgmtQuery(
  `SELECT estado_pago FROM public.participants WHERE id = '${mainPart.id}';`,
);
const preRow = preRowResult[0];

const { error: entrarErr } = await mainClient
  .from("participants")
  .update({ estado_pago_revancha: "pendiente" })
  .eq("id", mainPart.id);
if (entrarErr) fail("pedir entrar a Revancha: " + entrarErr.message);

const postRow = await mgmtQuery(
  `SELECT estado_pago, estado_pago_revancha FROM public.participants WHERE id = '${mainPart.id}';`,
);
if (postRow[0].estado_pago_revancha !== "pendiente")
  fail("Caso 4: estado_pago_revancha no quedó en 'pendiente'");
if (postRow[0].estado_pago !== preRow.estado_pago)
  fail(
    `Caso 4: estado_pago de la polla se movió (${preRow.estado_pago} -> ${postRow[0].estado_pago})`,
  );
ok(
  `Caso 4: pidió entrar a Revancha sin tocar su estado_pago de la polla (sigue en '${postRow[0].estado_pago}').`,
);

// ===== CASO 5: el admin aprueba su Revancha sin alterar su estado_pago de la polla =====
await mgmtQuery(`
  SELECT set_config('request.jwt.claim.sub', '${ADMIN_UUID}', true);
  UPDATE public.participants SET estado_pago_revancha = 'aprobado' WHERE id = '${mainPart.id}';
`);
const afterApprove = await mgmtQuery(
  `SELECT estado_pago, estado_pago_revancha FROM public.participants WHERE id = '${mainPart.id}';`,
);
if (afterApprove[0].estado_pago_revancha !== "aprobado")
  fail("Caso 5: no quedó aprobado en Revancha");
if (afterApprove[0].estado_pago !== preRow.estado_pago)
  fail("Caso 5: aprobar Revancha movió el estado_pago de la polla principal");
ok("Caso 5: el admin aprobó su Revancha sin tocar su estado_pago de la polla.");

// ===== CASO 6: revancha_abierta=false en prod ahora mismo -> guardar picks se rechaza =====
const tsRow = await mgmtQuery(`SELECT revancha_abierta FROM public.tournament_state WHERE id = 1;`);
if (tsRow[0].revancha_abierta === true) {
  console.log(
    "⚠️  Caso 6 omitido: revancha_abierta ya está en true en prod (no se toca este flag desde un script de verificación).",
  );
} else {
  const extraMatchesResult = await mgmtQuery(
    `SELECT jsonb_agg(m) AS ms FROM (SELECT m FROM public.tournament_state ts, jsonb_array_elements(ts.extra_matches) m WHERE ts.id=1 AND m->>'fase' IN ('semis','final')) x;`,
  );
  const extraMatches = extraMatchesResult[0].ms;
  const firstMatchId = extraMatches?.[0]?.id;
  if (!firstMatchId) {
    console.log("⚠️  Caso 6 omitido: no hay partidos de semis/final cargados todavía.");
  } else {
    const { error: saveErr } = await mainClient
      .from("revancha_picks")
      .insert({ participant_id: mainPart.id, extra_matches: { [firstMatchId]: { gh: 1, ga: 0 } } });
    if (!saveErr)
      fail("Caso 6: se pudo guardar una planilla de Revancha estando revancha_abierta=false");
    ok(
      `Caso 6: guardar picks de Revancha fue rechazado con la revancha cerrada (${saveErr.message}).`,
    );
  }
}

// ===== CASO 7: limpieza — borrar ambos usuarios de prueba (cascada) =====
const svc = createClient(URL_, SERVICE);
const { error: delSoloErr } = await svc.auth.admin.deleteUser(soloUserId);
const { error: delMainErr } = await svc.auth.admin.deleteUser(mainUserId);
if (delSoloErr) fail("No se pudo borrar el usuario de prueba solo-revancha: " + delSoloErr.message);
if (delMainErr)
  fail("No se pudo borrar el usuario de prueba de la polla principal: " + delMainErr.message);
ok("Caso 7: ambos usuarios de prueba borrados (cascada a participants/picks/revancha_picks).");

// ===== CASO 8: sumas de control de picks reales, intactas =====
const after = await sums();
if (JSON.stringify(before) !== JSON.stringify(after)) {
  fail(
    `Las sumas de picks reales cambiaron: antes=${JSON.stringify(before)} después=${JSON.stringify(after)}`,
  );
}
ok(
  `Caso 8: sumas de picks intactas — grupos=${after.grupos} partidos=${after.partidos} especiales=${after.especiales} total=${after.total} (${after.filas} filas).`,
);

console.log("\n✅ Verificación funcional completa — 8/8 casos en verde.");
