/**
 * AUDITORÍA PUNTUAL — umbral de typo (camino b) de especial_matches, con el torneo
 * cerrado y dinero de por medio. SOLO LECTURA: nada de UPDATE/INSERT/DELETE.
 *
 * 1. Clasifica los 74 pares reales (goleador+arquero de los 37 aprobados) contra los
 *    oficiales VIGENTES (leídos en frío de tournament_state, no asumidos) usando
 *    especialMatchMotivo importado en vivo desde src/lib/polla.ts — la regla real, no
 *    una copia. También calcula, para TODOS los pares (acierten o no), la distancia de
 *    edición cruda entre nombres normalizados, para poder ver a los "casi typo".
 * 2. Imprime la tabla ordenada por categoría, y las listas A (typo=b) y B (sin acierto
 *    pero cerca: distancia 3-5, o selección vacía en algún lado).
 * 3. Simula DOS escenarios en memoria (no toca la BD): estricto (los aciertos por typo
 *    valen 0) y laxo (los de la lista B valen 10), recalcula puntos_especiales/total y
 *    el orden (mismo criterio de RANK() que get_polla_leaderboard: total desc, luego
 *    aciertos 5/3/2 desc) y compara contra el leaderboard real, con foco en las
 *    posiciones premiadas (1° y 2°, según reglas/Reglamento2026.pdf: 60%/20%).
 *
 * Uso: bun scripts/audit_typo_threshold.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { especialMatchMotivo, normEspecial, parseSpecial } from "../src/lib/polla.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const URL_ = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) {
  console.error("❌ Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(2);
}

async function restGet(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!res.ok) throw new Error(`REST ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Distancia de edición cruda — clon local de la función privada de polla.ts, SOLO para
// reportar (no participa en el cálculo real de puntos, que sigue viviendo en polla.ts/SQL).
function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// ---------- 1) Oficiales VIGENTES — leídos, no asumidos ----------
const [ts] = await restGet("tournament_state?id=eq.1&select=goleador_id,arquero_id");
if (!ts) throw new Error("No se pudo leer tournament_state id=1");
console.log("== Oficiales vigentes (leídos ahora mismo) ==");
console.log(`Goleador: ${JSON.stringify(ts.goleador_id)}`);
console.log(`Arquero:  ${JSON.stringify(ts.arquero_id)}\n`);

// ---------- Picks reales + puntajes actuales (para la simulación de escenarios) ----------
const picks = await restGet(
  "picks?select=participant_id,goleador_id,arquero_id,puntos_grupos,puntos_partidos,puntos_especiales,puntos_total,aciertos_5,aciertos_3,aciertos_2,participants(nombre)&order=participant_id",
);
console.log(`${picks.length} picks reales cargados.\n`);

// ---------- 2) Clasificación de los 74 pares ----------
function clasificar(pick, oficial) {
  const motivo = especialMatchMotivo(pick, oficial);
  const p = parseSpecial(pick ?? "");
  const o = parseSpecial(oficial ?? "");
  const pn = normEspecial(p.nombre) ?? "";
  const onm = normEspecial(o.nombre) ?? "";
  const distNombre = pn && onm ? levenshtein(pn, onm) : null;
  const selVacia = !p.seleccion.trim() || !o.seleccion.trim();
  return { motivo, distNombre, selVacia };
}

const filas = [];
for (const pk of picks) {
  const nombre = pk.participants?.nombre ?? pk.participant_id;
  filas.push({
    participante: nombre,
    categoria: "goleador",
    pick: pk.goleador_id,
    oficial: ts.goleador_id,
    ...clasificar(pk.goleador_id, ts.goleador_id),
  });
  filas.push({
    participante: nombre,
    categoria: "arquero",
    pick: pk.arquero_id,
    oficial: ts.arquero_id,
    ...clasificar(pk.arquero_id, ts.arquero_id),
  });
}

function etiqueta(f) {
  if (f.motivo.tipo === "exacto") return "exacto";
  if (f.motivo.tipo === "typo") return `typo(b) d=${f.motivo.distancia}`;
  if (f.motivo.tipo === "parte-nombre") return "subconjunto(c)";
  return `sin-acierto/${f.motivo.causa}`;
}

const orden = { exacto: 0, typo: 1, "parte-nombre": 2, "sin-acierto": 3 };
filas.sort((a, b) => {
  const oa = orden[a.motivo.tipo],
    ob = orden[b.motivo.tipo];
  if (oa !== ob) return oa - ob;
  if (a.motivo.tipo === "typo") return (a.motivo.distancia ?? 0) - (b.motivo.distancia ?? 0);
  return (a.distNombre ?? 99) - (b.distNombre ?? 99);
});

console.log(
  "== Clasificación de los 74 pares (participante · categoría · escrito · oficial · dist.nombre) ==",
);
for (const f of filas) {
  console.log(
    `${f.participante.padEnd(26)} ${f.categoria.padEnd(9)} ${etiqueta(f).padEnd(22)} "${f.pick ?? ""}"  vs  "${f.oficial ?? ""}"  (d=${f.distNombre ?? "-"})`,
  );
}

// ---------- Conteo por categoría ----------
const conteo = {};
for (const f of filas) {
  const k = f.motivo.tipo === "sin-acierto" ? `sin-acierto/${f.motivo.causa}` : f.motivo.tipo;
  conteo[k] = (conteo[k] ?? 0) + 1;
}
console.log("\n== Conteo por categoría ==");
console.log(JSON.stringify(conteo, null, 1));

// ---------- Lista A: typo(b) ----------
const listaA = filas.filter((f) => f.motivo.tipo === "typo");
console.log(`\n== LISTA A — puntuaron por (b) typo: ${listaA.length} caso(s) ==`);
for (const f of listaA) {
  console.log(
    `- ${f.participante} · ${f.categoria} · escribió "${f.pick}" · oficial "${f.oficial}" · distancia ${f.motivo.distancia}`,
  );
}

// ---------- Lista B: sin-acierto pero cerca (distancia 3-5, o selección vacía) ----------
const listaB = filas.filter(
  (f) =>
    f.motivo.tipo === "sin-acierto" &&
    ((f.distNombre != null && f.distNombre >= 3 && f.distNombre <= 5) || f.selVacia),
);
console.log(`\n== LISTA B — sin acierto pero cerca: ${listaB.length} caso(s) ==`);
for (const f of listaB) {
  console.log(
    `- ${f.participante} · ${f.categoria} · escribió "${f.pick}" · oficial "${f.oficial}" · distancia ${f.distNombre} · causa=${f.motivo.causa} · sel.vacía=${f.selVacia}`,
  );
}

// ---------- 3) Simulación de escenarios (en memoria, NO se escribe nada) ----------
// Recalcula puntos_especiales/total por participante bajo cada escenario, y el orden con
// el mismo criterio de get_polla_leaderboard: total desc, aciertos_5 desc, aciertos_3
// desc, aciertos_2 desc. NOTA: los aciertos_5/3/2 son de GRUPOS/PARTIDOS, no de
// especiales — no cambian en ninguno de los dos escenarios (solo tocamos especiales).

function puntosEspecialesReal(pk) {
  const gol = especialMatchMotivo(pk.goleador_id, ts.goleador_id).tipo !== "sin-acierto";
  const arq = especialMatchMotivo(pk.arquero_id, ts.arquero_id).tipo !== "sin-acierto";
  return (gol ? 10 : 0) + (arq ? 10 : 0);
}

function puntosEspecialesEstricto(pk) {
  // (b) typo → 0. Los demás caminos (a/exacto, c/subconjunto) quedan igual.
  const m = (v, o) => especialMatchMotivo(v, o);
  const golM = m(pk.goleador_id, ts.goleador_id);
  const arqM = m(pk.arquero_id, ts.arquero_id);
  const golOk = golM.tipo === "exacto" || golM.tipo === "parte-nombre";
  const arqOk = arqM.tipo === "exacto" || arqM.tipo === "parte-nombre";
  return (golOk ? 10 : 0) + (arqOk ? 10 : 0);
}

function puntosEspecialesLaxo(pk) {
  // Real + todo lo de la lista B pasa a valer 10.
  let pts = 0;
  const golAcierto = especialMatchMotivo(pk.goleador_id, ts.goleador_id).tipo !== "sin-acierto";
  const arqAcierto = especialMatchMotivo(pk.arquero_id, ts.arquero_id).tipo !== "sin-acierto";
  const golEnListaB = listaB.some(
    (f) =>
      f.participante === (pk.participants?.nombre ?? pk.participant_id) &&
      f.categoria === "goleador",
  );
  const arqEnListaB = listaB.some(
    (f) =>
      f.participante === (pk.participants?.nombre ?? pk.participant_id) &&
      f.categoria === "arquero",
  );
  pts += golAcierto || golEnListaB ? 10 : 0;
  pts += arqAcierto || arqEnListaB ? 10 : 0;
  return pts;
}

function construirLeaderboard(calculaEspeciales) {
  const filas = picks.map((pk) => {
    const pe = calculaEspeciales(pk);
    const total = (pk.puntos_grupos ?? 0) + (pk.puntos_partidos ?? 0) + pe;
    return {
      nombre: pk.participants?.nombre ?? pk.participant_id,
      puntos_especiales: pe,
      puntos_total: total,
      aciertos_5: pk.aciertos_5 ?? 0,
      aciertos_3: pk.aciertos_3 ?? 0,
      aciertos_2: pk.aciertos_2 ?? 0,
    };
  });
  filas.sort(
    (a, b) =>
      b.puntos_total - a.puntos_total ||
      b.aciertos_5 - a.aciertos_5 ||
      b.aciertos_3 - a.aciertos_3 ||
      b.aciertos_2 - a.aciertos_2,
  );
  let pos = 0;
  let prevKey = null;
  filas.forEach((f, i) => {
    const key = `${f.puntos_total}|${f.aciertos_5}|${f.aciertos_3}|${f.aciertos_2}`;
    if (key !== prevKey) pos = i + 1;
    f.posicion = pos;
    prevKey = key;
  });
  return filas;
}

const lbReal = construirLeaderboard(puntosEspecialesReal);
const lbEstricto = construirLeaderboard(puntosEspecialesEstricto);
const lbLaxo = construirLeaderboard(puntosEspecialesLaxo);

function top(lb, n = 5) {
  return lb
    .filter((f) => f.posicion <= n)
    .map((f) => `${f.posicion}. ${f.nombre} (${f.puntos_total})`)
    .join(" | ");
}

console.log("\n== Escenario REAL (tal cual pagó la BD) — top 5 ==");
console.log(top(lbReal));
console.log("\n== Escenario ESTRICTO (typo=b vale 0) — top 5 ==");
console.log(top(lbEstricto));
console.log("\n== Escenario LAXO (lista B vale 10) — top 5 ==");
console.log(top(lbLaxo));

function ganadoresPremiados(lb) {
  // Reglas: 60% al 1°, 20% al 2° (empate = todos comparten el puesto).
  const p1 = lb.filter((f) => f.posicion === 1).map((f) => f.nombre);
  const p2 = lb.filter((f) => f.posicion === 2).map((f) => f.nombre);
  return { p1, p2 };
}

const gReal = ganadoresPremiados(lbReal);
const gEstricto = ganadoresPremiados(lbEstricto);
const gLaxo = ganadoresPremiados(lbLaxo);

console.log("\n== Puestos premiados (1° = 60%, 2° = 20%) ==");
console.log("Real:     1°=" + JSON.stringify(gReal.p1) + " 2°=" + JSON.stringify(gReal.p2));
console.log("Estricto: 1°=" + JSON.stringify(gEstricto.p1) + " 2°=" + JSON.stringify(gEstricto.p2));
console.log("Laxo:     1°=" + JSON.stringify(gLaxo.p1) + " 2°=" + JSON.stringify(gLaxo.p2));

const mismoEq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const cambiaEstricto = !mismoEq(gReal.p1, gEstricto.p1) || !mismoEq(gReal.p2, gEstricto.p2);
const cambiaLaxo = !mismoEq(gReal.p1, gLaxo.p1) || !mismoEq(gReal.p2, gLaxo.p2);

console.log(`\n¿Cambia el 1°/2° en escenario ESTRICTO? ${cambiaEstricto ? "SÍ" : "no"}`);
console.log(`¿Cambia el 1°/2° en escenario LAXO?     ${cambiaLaxo ? "SÍ" : "no"}`);
