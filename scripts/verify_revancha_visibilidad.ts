/**
 * Verificación FUNCIONAL (no transaccional — crea filas reales, con limpieza total al
 * final) de la regla de visibilidad de tablas de La Revancha. Sin navegador disponible en
 * este entorno para clickear la navegación, así que en vez de eso:
 *   1. Da de alta 3 cuentas reales (mismo flujo que la UI: auth.signUp + insert con el
 *      cliente anon), una por cada combinación relevante de la tabla de la tarea.
 *   2. Lee la fila de `participants` de cada una EXACTAMENTE como la lee useAuth
 *      (`select("*")`), con la sesión de esa propia cuenta.
 *   3. Le pasa esa fila real a las funciones REALMENTE exportadas por src/lib/polla.ts
 *      (puedeVerTablaPolla/puedeVerTablaRevancha) — no una reimplementación — y compara
 *      contra lo que la tabla de la tarea exige.
 *   4. Borra las 3 cuentas al final (cascada a participants). Cero residuos.
 *
 * Esto prueba dos cosas que un test unitario con datos inventados no prueba por sí solo:
 * que useAuth() de verdad trae ambos campos (si le faltara uno, `participant.campo` sería
 * `undefined` y la regla fallaría en silencio con datos reales), y que la función ya
 * shippeada decide bien sobre una fila real, no una construida a mano.
 *
 * Caso 4 (no logueado) y caso 5 (URLs públicas, no bloqueadas) se verificaron aparte por
 * SSR real (curl a /leaderboard y /revancha/leaderboard sin sesión: 200 en ambas).
 *
 * Uso: SUPABASE_PAT=sbp_... bun run scripts/verify_revancha_visibilidad.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { puedeVerTablaPolla, puedeVerTablaRevancha } from "@/lib/polla";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env: Record<string, string> = {};
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

function fail(msg: string): never {
  console.error("❌ " + msg);
  process.exit(1);
}
function ok(msg: string) {
  console.log("✅ " + msg);
}

async function mgmtQuery(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) fail(`Management API ${res.status}: ${text}`);
  return JSON.parse(text);
}

function aliasToEmail(alias: string): string {
  const slug = alias
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[̀-ͯ]", "g"), "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/(^\.|\.$)/g, "");
  return `${slug}@polla.local`;
}
function pinToPassword(pin: string): string {
  return `polla-pin-${pin}`;
}

const stamp = Date.now().toString(36);
const userIds: string[] = [];

async function altaYLogin(alias: string, pin: string, mode: "polla" | "revancha") {
  const client = createClient(URL_!, ANON!);
  const email = aliasToEmail(alias);
  const { data: signUp, error: signErr } = await client.auth.signUp({
    email,
    password: pinToPassword(pin),
    options: { data: { nombre: alias } },
  });
  if (signErr) fail(`signUp ${alias}: ${signErr.message}`);
  const uid = signUp.user!.id;
  userIds.push(uid);

  const payload =
    mode === "revancha"
      ? {
          user_id: uid,
          nombre: alias,
          email,
          en_polla_original: false,
          estado_pago: null,
          estado_pago_revancha: "pendiente",
        }
      : {
          user_id: uid,
          nombre: alias,
          email,
          en_polla_original: true,
          estado_pago: "pendiente",
        };
  const { data: part, error: insErr } = await client
    .from("participants")
    .insert(payload)
    .select()
    .single();
  if (insErr) fail(`insert participants (${alias}): ${insErr.message}`);
  return { client, participantId: (part as { id: string }).id, uid };
}

async function fetchOwnRow(client: ReturnType<typeof createClient>) {
  // Exactamente el select de useAuth (src/hooks/useAuth.tsx): select("*").eq("user_id", uid).
  const { data: user } = await client.auth.getUser();
  const { data, error } = await client
    .from("participants")
    .select("*")
    .eq("user_id", user!.user!.id)
    .maybeSingle();
  if (error) fail(`fetch propia fila: ${error.message}`);
  return data as { en_polla_original: boolean; estado_pago_revancha: string | null };
}

console.log("== Verificación funcional de la regla de visibilidad de tablas (prod real) ==\n");

// ===== Caso: SOLO POLLA (sin unirse a Revancha) =====
const soloPolla = await altaYLogin(`e2e vis solopolla ${stamp}`, "9001", "polla");
await mgmtQuery(`
  SELECT set_config('request.jwt.claim.sub', '${ADMIN_UUID}', true);
  UPDATE public.participants SET estado_pago = 'aprobado' WHERE id = '${soloPolla.participantId}';
`);
{
  const row = await fetchOwnRow(soloPolla.client);
  if (row.en_polla_original !== true || row.estado_pago_revancha !== null) {
    fail(`solo-polla: forma inesperada de la fila real (${JSON.stringify(row)})`);
  }
  const verPolla = puedeVerTablaPolla(row, false);
  const verRevancha = puedeVerTablaRevancha(row, false);
  if (!(verPolla === true && verRevancha === false)) {
    fail(`solo-polla: veredicto incorrecto (polla=${verPolla}, revancha=${verRevancha})`);
  }
  ok("Solo polla: ve tabla polla=true, ve tabla Revancha=false — correcto.");
}

// ===== Caso: SOLO REVANCHA (aprobado) =====
const soloRevancha = await altaYLogin(`e2e vis solorevancha ${stamp}`, "9002", "revancha");
await mgmtQuery(`
  SELECT set_config('request.jwt.claim.sub', '${ADMIN_UUID}', true);
  UPDATE public.participants SET estado_pago_revancha = 'aprobado' WHERE id = '${soloRevancha.participantId}';
`);
{
  const row = await fetchOwnRow(soloRevancha.client);
  if (row.en_polla_original !== false || row.estado_pago_revancha !== "aprobado") {
    fail(`solo-revancha: forma inesperada de la fila real (${JSON.stringify(row)})`);
  }
  const verPolla = puedeVerTablaPolla(row, false);
  const verRevancha = puedeVerTablaRevancha(row, false);
  if (!(verPolla === false && verRevancha === true)) {
    fail(`solo-revancha: veredicto incorrecto (polla=${verPolla}, revancha=${verRevancha})`);
  }
  ok(
    "Solo Revancha: ve tabla polla=false, ve tabla Revancha=true — el caso que motiva la tarea, correcto.",
  );
}

// ===== Caso: EN AMBAS =====
const enAmbas = await altaYLogin(`e2e vis enambas ${stamp}`, "9003", "polla");
await mgmtQuery(`
  SELECT set_config('request.jwt.claim.sub', '${ADMIN_UUID}', true);
  UPDATE public.participants SET estado_pago = 'aprobado' WHERE id = '${enAmbas.participantId}';
`);
// Pide entrar a Revancha (self-update, como hace /revancha en la UI real) y el admin aprueba.
{
  const { error } = await enAmbas.client
    .from("participants")
    .update({ estado_pago_revancha: "pendiente" })
    .eq("id", enAmbas.participantId);
  if (error) fail(`pedir entrar a Revancha (en-ambas): ${error.message}`);
}
await mgmtQuery(`
  SELECT set_config('request.jwt.claim.sub', '${ADMIN_UUID}', true);
  UPDATE public.participants SET estado_pago_revancha = 'aprobado' WHERE id = '${enAmbas.participantId}';
`);
{
  const row = await fetchOwnRow(enAmbas.client);
  if (row.en_polla_original !== true || row.estado_pago_revancha !== "aprobado") {
    fail(`en-ambas: forma inesperada de la fila real (${JSON.stringify(row)})`);
  }
  const verPolla = puedeVerTablaPolla(row, false);
  const verRevancha = puedeVerTablaRevancha(row, false);
  if (!(verPolla === true && verRevancha === true)) {
    fail(`en-ambas: veredicto incorrecto (polla=${verPolla}, revancha=${verRevancha})`);
  }
  ok("En ambas: ve tabla polla=true, ve tabla Revancha=true — correcto.");
}

// ===== Admin: ve las dos, sin importar participant =====
{
  const verPolla = puedeVerTablaPolla(null, true);
  const verRevancha = puedeVerTablaRevancha(null, true);
  if (!(verPolla === true && verRevancha === true)) {
    fail(`admin: veredicto incorrecto (polla=${verPolla}, revancha=${verRevancha})`);
  }
  ok("Admin: ve tabla polla=true, ve tabla Revancha=true — correcto.");
}

// ===== Limpieza: borrar las 3 cuentas reales (cascada a participants) =====
const svc = createClient(URL_!, SERVICE!);
for (const uid of userIds) {
  const { error } = await svc.auth.admin.deleteUser(uid);
  if (error) fail(`no se pudo borrar el usuario de prueba ${uid}: ${error.message}`);
}
ok(`Limpieza: ${userIds.length} cuentas de prueba borradas (cascada a participants).`);

const residual = await mgmtQuery(
  `SELECT count(*) AS n FROM public.participants WHERE nombre LIKE 'e2e vis %';`,
);
if (Number(residual[0].n) !== 0) {
  fail(`Quedaron ${residual[0].n} participantes de prueba residuales en producción.`);
}
ok("Post-check: cero residuos en producción.");

console.log("\n✅ Verificación funcional completa — 4/4 casos autenticados en verde.");
