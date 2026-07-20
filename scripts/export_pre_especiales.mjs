// Snapshot de seguridad PRE-migración de puntos especiales (goleador/arquero).
// SOLO LECTURA: select vía service_role (salta RLS) + RPC pública get_polla_leaderboard.
// No escribe nada en la BD. Salida: backups/pre-especiales-<fecha>/ (gitignored).
// Uso: bun scripts/export_pre_especiales.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const env = Object.fromEntries(
  readFileSync(new URL(".env", root), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^"|"$/g, ""),
      ];
    }),
);

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(2);
}
const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = new Date().toISOString().slice(0, 10);
const outDir = new URL(`backups/pre-especiales-${stamp}/`, root);
mkdirSync(outDir, { recursive: true });

const csvCell = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (cols, rows) =>
  [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";

// ── a) participants LEFT JOIN picks → puntajes.csv ─────────────────────────
const { data: participants, error: pe } = await sb
  .from("participants")
  .select("id, nombre, estado_pago")
  .order("nombre");
if (pe) throw new Error(`participants: ${pe.message}`);

const { data: picks, error: ke } = await sb
  .from("picks")
  .select(
    "participant_id, goleador_id, arquero_id, puntos_grupos, puntos_partidos, puntos_especiales, puntos_total, aciertos_5, aciertos_3, aciertos_2, updated_at",
  );
if (ke) throw new Error(`picks: ${ke.message}`);

const byPid = new Map(picks.map((p) => [p.participant_id, p]));
const cols = [
  "id",
  "nombre",
  "estado_pago",
  "goleador_id",
  "arquero_id",
  "puntos_grupos",
  "puntos_partidos",
  "puntos_especiales",
  "puntos_total",
  "aciertos_5",
  "aciertos_3",
  "aciertos_2",
  "updated_at",
];
const joined = participants.map((pa) => ({ ...pa, ...(byPid.get(pa.id) ?? {}) }));
writeFileSync(new URL("puntajes.csv", outDir), toCsv(cols, joined));
console.log(`✅ puntajes.csv: ${joined.length} participantes (${picks.length} con picks)`);

// ── b) leaderboard tal cual lo ve la gente ─────────────────────────────────
const { data: lb, error: le } = await sb.rpc("get_polla_leaderboard");
if (le) throw new Error(`get_polla_leaderboard: ${le.message}`);
writeFileSync(new URL("leaderboard.json", outDir), JSON.stringify(lb, null, 2));
if (lb.length) writeFileSync(new URL("leaderboard.csv", outDir), toCsv(Object.keys(lb[0]), lb));
console.log(`✅ leaderboard: ${lb.length} filas`);

// ── c) tournament_state completo ───────────────────────────────────────────
const { data: ts, error: te } = await sb.from("tournament_state").select("*").eq("id", 1).single();
if (te) throw new Error(`tournament_state: ${te.message}`);
writeFileSync(new URL("tournament_state.json", outDir), JSON.stringify(ts, null, 2));
console.log(
  `✅ tournament_state: goleador_id=${JSON.stringify(ts.goleador_id)} arquero_id=${JSON.stringify(ts.arquero_id)}`,
);

writeFileSync(
  new URL("_manifest.json", outDir),
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      url,
      project_ref: new URL(url).hostname.split(".")[0],
    },
    null,
    2,
  ),
);
console.log(`\n📦 Snapshot en backups/pre-especiales-${stamp}/`);
