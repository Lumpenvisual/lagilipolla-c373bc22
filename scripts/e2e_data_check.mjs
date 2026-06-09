// E2E de la capa de datos contra el Supabase real (solo lecturas públicas).
// Verifica si las migraciones oficiales/demo ya se aplicaron.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
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
const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
console.log("Supabase URL:", url);
const sb = createClient(url, key);

let ok = 0,
  fail = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  cond ? ok++ : fail++;
};

// 1) tournament_state (public read)
const { data: ts, error: e1 } = await sb
  .from("tournament_state")
  .select("groups, group_k_matches, deadline, cuota_cop")
  .eq("id", 1)
  .single();
check("Lee tournament_state", !e1 && !!ts, e1?.message);

if (ts) {
  const k = ts.groups.K.teams.map((t) => t.nombre);
  console.log("   Grupo K:", k.join(", "));
  const hasCongo = k.includes("RD Congo");
  const hasSlot = JSON.stringify(ts.groups).includes('"po"');
  check(
    "Datos OFICIALES aplicados (Grupo K = RD Congo, sin slots de repechaje)",
    hasCongo && !hasSlot,
    hasSlot
      ? "Aún hay slots 'po' sin resolver → falta migración 221000"
      : hasCongo
        ? ""
        : "Grupo K aún no tiene RD Congo",
  );

  const m6 = ts.group_k_matches.find((x) => x.id === "6");
  console.log("   Partido 6:", m6?.local, "vs", m6?.visitante, "·", m6?.sede);
  check(
    "Partido 6 corregido (RD Congo vs Uzbekistán en Atlanta)",
    m6 && m6.local === "COD" && m6.visitante === "UZB" && /Atlanta/.test(m6.sede || ""),
  );

  check("Cuota en COP = 100000", ts.cuota_cop === 100000, "cuota=" + ts.cuota_cop);
}

// 2) Leaderboard RPC (público)
const { data: lb, error: e2 } = await sb.rpc("get_polla_leaderboard");
check("RPC get_polla_leaderboard responde", !e2, e2?.message);
if (lb) {
  const demos = lb.filter((r) => (r.nombre || "").startsWith("[DEMO]")).length;
  console.log(`   Participantes aprobados en tabla: ${lb.length} (de los cuales [DEMO]: ${demos})`);
  check(
    "Sin datos demo en la tabla (migración 220000 aplicada)",
    demos === 0,
    demos > 0 ? `Aún hay ${demos} [DEMO] → falta migración 220000` : "",
  );
}

console.log(`\nRESUMEN: ${ok} OK · ${fail} fallos`);
process.exit(fail > 0 ? 1 : 0);
