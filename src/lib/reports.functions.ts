import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type ExcelJS from "exceljs";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  parseSpecial,
  groupPts,
  matchPts,
  FASE_LABEL,
  type TournamentState,
  type PickRow,
  type Fase,
} from "@/lib/polla";

type AdminContext = { supabase: SupabaseClient<Database>; userId: string };

type LeaderboardRow = {
  posicion: number;
  nombre: string;
  puntos_grupos: number;
  puntos_partidos: number;
  puntos_especiales: number;
  puntos_total: number;
  aciertos_5: number;
  aciertos_3: number;
  aciertos_2: number;
};

// ============== Shared helpers ==============

type Group = TournamentState["groups"][keyof TournamentState["groups"]];

async function requireAdmin(ctx: AdminContext) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden");
}

function bufToBase64(u8: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  // btoa is available in Workers + Node 18+
  return btoa(s);
}

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 32) || "participante"
  );
}

const GROUP_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

function teamName(group: Group, id: string | null | undefined): string {
  if (!id) return "—";
  const t = group.teams.find((x) => x.id === id);
  if (t) return t.nombre;
  for (const tt of group.teams) {
    const cand = tt.candidatos?.find((c) => c.id === id);
    if (cand) return cand.n;
  }
  return id;
}

/**
 * Escribe la planilla completa de un participante en UNA hoja compacta
 * (grupos + Grupo K + eliminatorias + especiales, con puntos por línea).
 * Reutilizado por los exports admin (por usuario y consolidado).
 */
function writePlanillaSheet(
  ws: ExcelJS.Worksheet,
  tournament: TournamentState,
  pick: PickRow,
): void {
  ws.columns = [
    { header: "", key: "a", width: 26 },
    { header: "", key: "b", width: 18 },
    { header: "", key: "c", width: 26 },
    { header: "", key: "d", width: 14 },
    { header: "Puntos", key: "pts", width: 10 },
  ];
  const section = (title: string) => {
    const row = ws.addRow({ a: title });
    row.font = { bold: true };
  };

  section("GRUPOS — 1º y 2º");
  ws.addRow({ a: "Grupo", b: "Mi 1º / 2º", c: "Oficial 1º / 2º", d: "", pts: "Pts" });
  for (const k of GROUP_KEYS) {
    const g = tournament.groups[k];
    const p = pick.groups?.[k] ?? { pos1: null, pos2: null };
    ws.addRow({
      a: `Grupo ${k}`,
      b: `${teamName(g, p.pos1)} / ${teamName(g, p.pos2)}`,
      c: `${teamName(g, g.pos1)} / ${teamName(g, g.pos2)}`,
      pts: groupPts(g.pos1, g.pos2, p.pos1, p.pos2),
    });
  }

  section("GRUPO K — marcadores");
  for (const m of tournament.group_k_matches) {
    const pr = pick.group_k_matches?.[m.id];
    ws.addRow({
      a: teamName(tournament.groups.K, m.local),
      b: `${pr?.gh ?? "-"} - ${pr?.ga ?? "-"}`,
      c: teamName(tournament.groups.K, m.visitante),
      d: m.gh != null && m.ga != null ? `${m.gh}-${m.ga}` : "",
      pts: matchPts(m.gh, m.ga, pr?.gh, pr?.ga),
    });
  }

  const extras = tournament.extra_matches ?? [];
  if (extras.length) {
    section("ELIMINATORIAS — marcadores");
    const fases: Fase[] = ["dieciseisavos", "octavos", "cuartos", "semis", "tercero", "final"];
    for (const fase of fases) {
      const list = extras.filter((m) => m.fase === fase);
      if (!list.length) continue;
      const h = ws.addRow({ a: FASE_LABEL[fase] });
      h.font = { italic: true };
      for (const m of list) {
        const pr = pick.extra_matches?.[m.id];
        ws.addRow({
          a: m.local || "—",
          b: `${pr?.gh ?? "-"} - ${pr?.ga ?? "-"}`,
          c: m.visitante || "—",
          d: m.gh != null && m.ga != null ? `${m.gh}-${m.ga}` : "",
          pts: matchPts(m.gh, m.ga, pr?.gh, pr?.ga),
        });
      }
    }
  }

  section("ESPECIALES");
  const gol = parseSpecial(pick.goleador_id);
  const arq = parseSpecial(pick.arquero_id);
  ws.addRow({ a: "Goleador", b: gol.nombre || "—", c: gol.seleccion });
  ws.addRow({ a: "Arquero", b: arq.nombre || "—", c: arq.seleccion });
  section(`TOTAL: ${pick.puntos_total ?? 0} pts`);
}

// ============== USER: PDF comprobante ==============

export const generateComprobantePDF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    // 1) Load participant + pick + tournament state
    const { data: part, error: e1 } = await sb
      .from("participants")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!part) throw new Error("No estás inscrito.");
    if (part.estado_pago !== "aprobado")
      throw new Error("Completa tu pago para descargar el comprobante.");

    const [{ data: pick, error: e2 }, { data: ts, error: e3 }] = await Promise.all([
      sb.from("picks").select("*").eq("participant_id", part.id).maybeSingle(),
      sb.from("tournament_state").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (e2) throw new Error(e2.message);
    if (e3) throw new Error(e3.message);
    if (!pick) throw new Error("Aún no has guardado tu planilla.");

    const tournament = ts as unknown as TournamentState;
    const myPick = pick as unknown as PickRow & { updated_at: string };

    // 2) Compute verification code (matches SQL function)
    const enc = new TextEncoder().encode(
      `${part.id}${Math.floor(new Date(myPick.updated_at).getTime() / 1000)}`,
    );
    const hash = await crypto.subtle.digest("SHA-256", enc);
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const codigo = hex.slice(0, 12);

    // 3) Build QR PNG
    const { default: QRCode } = await import("qrcode");
    const qrDataUrl = await QRCode.toDataURL(
      `${import.meta.env.VITE_APP_URL}/verificar/${codigo}`,
      { margin: 0, scale: 6 },
    );
    const qrPng = Uint8Array.from(atob(qrDataUrl.split(",")[1]), (c) => c.charCodeAt(0));

    // 4) Build PDF with pdf-lib
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Comprobante LA GILIPOLLA 2026 - ${part.nombre}`);
    pdf.setAuthor("Bar El Guanábano");
    pdf.setSubject("Comprobante de planilla - Mundial FIFA 2026");

    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const helvObl = await pdf.embedFont(StandardFonts.HelveticaOblique);

    const A4 = { w: 595.28, h: 841.89 };
    const page = pdf.addPage([A4.w, A4.h]);
    const yellow = rgb(1, 0.8, 0);
    const blue = rgb(0, 0.27, 0.67);
    const red = rgb(0.84, 0.13, 0.13);
    const dark = rgb(0.1, 0.1, 0.13);
    const muted = rgb(0.45, 0.45, 0.5);
    const line = rgb(0.85, 0.85, 0.88);

    // Membrete tricolor
    page.drawRectangle({ x: 0, y: A4.h - 8, width: A4.w, height: 8, color: yellow });
    page.drawRectangle({ x: 0, y: A4.h - 14, width: A4.w, height: 6, color: blue });
    page.drawRectangle({ x: 0, y: A4.h - 20, width: A4.w, height: 6, color: red });

    // Logo / Title
    page.drawText("LA GILIPOLLA 2026", {
      x: 40,
      y: A4.h - 55,
      size: 22,
      font: helvBold,
      color: dark,
    });
    page.drawText("Bar El Guanábano - Mundial FIFA 2026", {
      x: 40,
      y: A4.h - 72,
      size: 10,
      font: helvObl,
      color: muted,
    });
    page.drawText("COMPROBANTE OFICIAL DE PLANILLA", {
      x: 40,
      y: A4.h - 90,
      size: 9,
      font: helvBold,
      color: blue,
    });

    // QR (top right)
    const qrImg = await pdf.embedPng(qrPng);
    const qrSize = 90;
    page.drawImage(qrImg, {
      x: A4.w - 40 - qrSize,
      y: A4.h - 30 - qrSize,
      width: qrSize,
      height: qrSize,
    });
    page.drawText("Verificar:", {
      x: A4.w - 40 - qrSize,
      y: A4.h - 30 - qrSize - 12,
      size: 7,
      font: helv,
      color: muted,
    });
    page.drawText(codigo, {
      x: A4.w - 40 - qrSize,
      y: A4.h - 30 - qrSize - 22,
      size: 8,
      font: helvBold,
      color: dark,
    });

    let y = A4.h - 130;

    // Participant block
    page.drawLine({ start: { x: 40, y }, end: { x: A4.w - 40, y }, thickness: 0.5, color: line });
    y -= 18;
    page.drawText("Participante", { x: 40, y, size: 8, font: helvBold, color: muted });
    y -= 14;
    page.drawText(part.nombre, { x: 40, y, size: 14, font: helvBold, color: dark });
    y -= 14;
    const issued = new Date().toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      dateStyle: "long",
      timeStyle: "short",
    });
    page.drawText(`Emitido: ${issued} COT`, { x: 40, y, size: 9, font: helv, color: muted });
    y -= 12;
    page.drawText(`Cuota pagada: $${(100000).toLocaleString("es-CO")} COP`, {
      x: 40,
      y,
      size: 9,
      font: helv,
      color: muted,
    });
    y -= 18;

    // Groups table
    page.drawLine({ start: { x: 40, y }, end: { x: A4.w - 40, y }, thickness: 0.5, color: line });
    y -= 14;
    page.drawText("PRONOSTICOS POR GRUPO (1° y 2°)", {
      x: 40,
      y,
      size: 10,
      font: helvBold,
      color: blue,
    });
    y -= 4;

    // 3-column layout
    const colW = (A4.w - 80) / 3;
    let row = 0;
    for (const k of GROUP_KEYS) {
      const col = row % 3;
      const rowIdx = Math.floor(row / 3);
      const xb = 40 + col * colW;
      const yb = y - 14 - rowIdx * 48;
      const g = tournament.groups[k];
      const p = myPick.groups[k] ?? { pos1: null, pos2: null };
      page.drawText(`Grupo ${k}`, { x: xb, y: yb, size: 9, font: helvBold, color: dark });
      page.drawText(`1° ${teamName(g, p.pos1)}`, {
        x: xb,
        y: yb - 12,
        size: 8,
        font: helv,
        color: dark,
      });
      page.drawText(`2° ${teamName(g, p.pos2)}`, {
        x: xb,
        y: yb - 22,
        size: 8,
        font: helv,
        color: dark,
      });
      // points if known
      if (g.pos1 && g.pos2 && p.pos1 && p.pos2) {
        let pts = 0;
        if (p.pos1 === g.pos1 && p.pos2 === g.pos2) pts = 5;
        else if (p.pos1 === g.pos2 && p.pos2 === g.pos1) pts = 3;
        else if ([p.pos1, p.pos2].some((x) => x === g.pos1 || x === g.pos2)) pts = 1;
        page.drawText(`+${pts} pts`, {
          x: xb,
          y: yb - 33,
          size: 7,
          font: helvBold,
          color: pts > 0 ? blue : muted,
        });
      }
      row++;
    }
    y -= 14 + Math.ceil(GROUP_KEYS.length / 3) * 48;

    // Group K matches
    page.drawLine({ start: { x: 40, y }, end: { x: A4.w - 40, y }, thickness: 0.5, color: line });
    y -= 14;
    page.drawText("PARTIDOS DEL GRUPO K (Colombia)", {
      x: 40,
      y,
      size: 10,
      font: helvBold,
      color: red,
    });
    y -= 14;
    for (const m of tournament.group_k_matches) {
      const p = myPick.group_k_matches?.[m.id];
      const lName = teamName(tournament.groups.K, m.local);
      const vName = teamName(tournament.groups.K, m.visitante);
      const txt = `${lName}  ${p?.gh ?? "-"} - ${p?.ga ?? "-"}  ${vName}`;
      page.drawText(txt, { x: 40, y, size: 9, font: helv, color: dark });
      if (m.gh != null && m.ga != null) {
        page.drawText(`oficial: ${m.gh}-${m.ga}`, {
          x: A4.w - 130,
          y,
          size: 8,
          font: helvObl,
          color: muted,
        });
      }
      y -= 13;
    }
    y -= 6;

    // Specials
    page.drawLine({ start: { x: 40, y }, end: { x: A4.w - 40, y }, thickness: 0.5, color: line });
    y -= 14;
    page.drawText("SELECCIONES ESPECIALES", { x: 40, y, size: 10, font: helvBold, color: blue });
    y -= 14;
    // goleador_id/arquero_id son texto libre del participante: "Nombre (Selección)".
    const golText = myPick.goleador_id?.trim() || null;
    const arqText = myPick.arquero_id?.trim() || null;
    page.drawText(`Goleador del Mundial: ${golText ?? "—"}`, {
      x: 40,
      y,
      size: 9,
      font: helv,
      color: dark,
    });
    y -= 12;
    page.drawText(`Mejor arquero:        ${arqText ?? "—"}`, {
      x: 40,
      y,
      size: 9,
      font: helv,
      color: dark,
    });
    y -= 18;

    // Footer
    page.drawLine({ start: { x: 40, y }, end: { x: A4.w - 40, y }, thickness: 0.5, color: line });
    y -= 12;
    page.drawText(
      "Documento informativo. La planilla oficial es la registrada en el sistema con su marca de tiempo.",
      { x: 40, y, size: 7, font: helvObl, color: muted },
    );
    y -= 9;
    page.drawText(`Marca de tiempo de la planilla: ${new Date(myPick.updated_at).toISOString()}`, {
      x: 40,
      y,
      size: 7,
      font: helv,
      color: muted,
    });
    y -= 9;
    page.drawText(
      `Verifica este comprobante en: ${import.meta.env.VITE_APP_URL}/verificar/${codigo}`,
      { x: 40, y, size: 7, font: helv, color: blue },
    );

    const bytes = await pdf.save();
    return {
      filename: `gilipolla-comprobante-${slugify(part.nombre)}-${nowStamp()}.pdf`,
      base64: bufToBase64(bytes),
      mime: "application/pdf",
    };
  });

// ============== Common Excel helpers ==============

async function makeWorkbook(): Promise<{ wb: ExcelJS.Workbook }> {
  // exceljs is CJS; handle both the synthetic-default and namespace interop shapes.
  const mod: typeof import("exceljs") & { default?: typeof import("exceljs") } =
    await import("exceljs");
  const Lib = mod.default ?? mod;
  return { wb: new Lib.Workbook() };
}

async function workbookToBase64(wb: ExcelJS.Workbook): Promise<string> {
  const buf: ArrayBuffer = await wb.xlsx.writeBuffer();
  return bufToBase64(new Uint8Array(buf));
}

// ============== USER: planilla en Excel ==============

export const generateMyPlanillaXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const { data: part } = await sb
      .from("participants")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!part) throw new Error("No estás inscrito.");
    if (part.estado_pago !== "aprobado") throw new Error("Pago no aprobado.");
    const [{ data: pick }, { data: ts }] = await Promise.all([
      sb.from("picks").select("*").eq("participant_id", part.id).maybeSingle(),
      sb.from("tournament_state").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (!pick) throw new Error("Sin planilla guardada.");
    const tournament = ts as unknown as TournamentState;
    const myPick = pick as unknown as PickRow;

    const { wb } = await makeWorkbook();
    const ws = wb.addWorksheet("Mi planilla");
    ws.columns = [
      { header: "Grupo", key: "g", width: 8 },
      { header: "Mi 1°", key: "p1", width: 22 },
      { header: "Mi 2°", key: "p2", width: 22 },
      { header: "Oficial 1°", key: "o1", width: 22 },
      { header: "Oficial 2°", key: "o2", width: 22 },
      { header: "Puntos", key: "pts", width: 10 },
    ];
    for (const k of GROUP_KEYS) {
      const g = tournament.groups[k];
      const p = myPick.groups[k] ?? { pos1: null, pos2: null };
      let pts = 0;
      if (g.pos1 && g.pos2 && p.pos1 && p.pos2) {
        if (p.pos1 === g.pos1 && p.pos2 === g.pos2) pts = 5;
        else if (p.pos1 === g.pos2 && p.pos2 === g.pos1) pts = 3;
        else if ([p.pos1, p.pos2].some((x) => x === g.pos1 || x === g.pos2)) pts = 1;
      }
      ws.addRow({
        g: k,
        p1: teamName(g, p.pos1),
        p2: teamName(g, p.pos2),
        o1: teamName(g, g.pos1),
        o2: teamName(g, g.pos2),
        pts,
      });
    }

    const ws2 = wb.addWorksheet("Grupo K");
    ws2.columns = [
      { header: "Local", key: "l", width: 24 },
      { header: "Mi marcador", key: "p", width: 14 },
      { header: "Visitante", key: "v", width: 24 },
      { header: "Oficial", key: "o", width: 12 },
    ];
    for (const m of tournament.group_k_matches) {
      const p = myPick.group_k_matches?.[m.id];
      ws2.addRow({
        l: teamName(tournament.groups.K, m.local),
        p: `${p?.gh ?? "-"} - ${p?.ga ?? "-"}`,
        v: teamName(tournament.groups.K, m.visitante),
        o: m.gh != null && m.ga != null ? `${m.gh}-${m.ga}` : "",
      });
    }

    // Eliminatorias (extra_matches): marcador propio vs oficial + puntos.
    const extras = tournament.extra_matches ?? [];
    if (extras.length) {
      const wsKO = wb.addWorksheet("Eliminatorias");
      wsKO.columns = [
        { header: "Fase", key: "f", width: 20 },
        { header: "Local", key: "l", width: 22 },
        { header: "Mi marcador", key: "p", width: 14 },
        { header: "Visitante", key: "v", width: 22 },
        { header: "Oficial", key: "o", width: 12 },
        { header: "Puntos", key: "pts", width: 10 },
      ];
      const fases: Fase[] = ["dieciseisavos", "octavos", "cuartos", "semis", "tercero", "final"];
      for (const fase of fases) {
        for (const m of extras.filter((x) => x.fase === fase)) {
          const p = myPick.extra_matches?.[m.id];
          wsKO.addRow({
            f: FASE_LABEL[fase],
            l: m.local || "—",
            p: `${p?.gh ?? "-"} - ${p?.ga ?? "-"}`,
            v: m.visitante || "—",
            o: m.gh != null && m.ga != null ? `${m.gh}-${m.ga}` : "",
            pts: matchPts(m.gh, m.ga, p?.gh, p?.ga),
          });
        }
      }
    }

    const ws3 = wb.addWorksheet("Especiales");
    ws3.addRow(["Categoría", "Mi elección", "Selección"]);
    // goleador_id/arquero_id son texto libre del participante: "Nombre (Selección)".
    const gol = parseSpecial(myPick.goleador_id);
    const arq = parseSpecial(myPick.arquero_id);
    ws3.addRow(["Goleador", gol.nombre || "—", gol.seleccion]);
    ws3.addRow(["Arquero", arq.nombre || "—", arq.seleccion]);

    return {
      filename: `gilipolla-planilla-${slugify(part.nombre)}-${nowStamp()}.xlsx`,
      base64: await workbookToBase64(wb),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  });

// ============== ADMIN: leaderboard ==============

export const generateLeaderboardXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const sb = context.supabase;
    const { data: lb, error } = await sb.rpc("get_polla_leaderboard");
    if (error) throw new Error(error.message);
    const { wb } = await makeWorkbook();
    const ws = wb.addWorksheet("Leaderboard");
    ws.columns = [
      { header: "Pos", key: "pos", width: 6 },
      { header: "Nombre", key: "nombre", width: 28 },
      { header: "Grupos", key: "pg", width: 10 },
      { header: "Partidos", key: "pp", width: 10 },
      { header: "Especiales", key: "pe", width: 12 },
      { header: "Total", key: "tot", width: 10 },
      { header: "#5pt", key: "a5", width: 8 },
      { header: "#3pt", key: "a3", width: 8 },
      { header: "#2pt", key: "a2", width: 8 },
    ];
    for (const r of (lb ?? []) as LeaderboardRow[]) {
      ws.addRow({
        pos: r.posicion,
        nombre: r.nombre,
        pg: r.puntos_grupos,
        pp: r.puntos_partidos,
        pe: r.puntos_especiales,
        tot: r.puntos_total,
        a5: r.aciertos_5,
        a3: r.aciertos_3,
        a2: r.aciertos_2,
      });
    }
    return {
      filename: `gilipolla-leaderboard-${nowStamp()}.xlsx`,
      base64: await workbookToBase64(wb),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  });

// ============== ADMIN: participantes ==============

export const generateParticipantesXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const sb = context.supabase;
    const { data: parts, error } = await sb
      .from("participants")
      .select("*")
      .order("inscripcion_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { wb } = await makeWorkbook();
    const ws = wb.addWorksheet("Participantes");
    ws.columns = [
      { header: "Nombre", key: "n", width: 28 },
      { header: "Email", key: "e", width: 28 },
      { header: "Celular", key: "c", width: 14 },
      { header: "Estado pago", key: "s", width: 14 },
      { header: "Inscripción", key: "i", width: 22 },
    ];
    for (const p of parts ?? []) {
      ws.addRow({ n: p.nombre, e: p.email, c: p.celular, s: p.estado_pago, i: p.inscripcion_at });
    }
    return {
      filename: `gilipolla-participantes-${nowStamp()}.xlsx`,
      base64: await workbookToBase64(wb),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  });

// ============== ADMIN: planilla de un participante ==============

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Nombre de hoja Excel válido (≤31 chars, sin caracteres prohibidos), único en el set. */
function safeSheetName(raw: string, used: Set<string>): string {
  const base =
    (raw || "planilla")
      .replace(/[\\/?*[\]:]/g, "")
      .slice(0, 28)
      .trim() || "planilla";
  let name = base.slice(0, 31);
  let i = 1;
  while (used.has(name)) name = `${base.slice(0, 26)}~${i++}`;
  used.add(name);
  return name;
}

export const generateUserPlanillaXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ participantId: z.string().uuid() }).strict().parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: part }, { data: pick }, { data: ts }] = await Promise.all([
      supabaseAdmin.from("participants").select("*").eq("id", data.participantId).maybeSingle(),
      supabaseAdmin
        .from("picks")
        .select("*")
        .eq("participant_id", data.participantId)
        .maybeSingle(),
      supabaseAdmin.from("tournament_state").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (!part) throw new Error("Participante no encontrado.");
    if (!pick) throw new Error("Este participante no tiene planilla guardada.");
    const { wb } = await makeWorkbook();
    const ws = wb.addWorksheet(safeSheetName(part.nombre, new Set()));
    writePlanillaSheet(ws, ts as unknown as TournamentState, pick as unknown as PickRow);
    return {
      filename: `gilipolla-planilla-${slugify(part.nombre)}-${nowStamp()}.xlsx`,
      base64: await workbookToBase64(wb),
      mime: XLSX_MIME,
    };
  });

// ============== ADMIN: todas las planillas ==============

export const generateAllPlanillasXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: ts }, { data: parts, error }, { data: picks }] = await Promise.all([
      supabaseAdmin.from("tournament_state").select("*").eq("id", 1).maybeSingle(),
      supabaseAdmin
        .from("participants")
        .select("*")
        .eq("estado_pago", "aprobado")
        .order("nombre", { ascending: true }),
      supabaseAdmin.from("picks").select("*"),
    ]);
    if (error) throw new Error(error.message);
    const tournament = ts as unknown as TournamentState;
    const pickById = new Map((picks ?? []).map((p) => [p.participant_id, p as unknown as PickRow]));

    const { wb } = await makeWorkbook();
    const sum = wb.addWorksheet("Resumen");
    sum.columns = [
      { header: "Participante", key: "n", width: 28 },
      { header: "Grupos", key: "pg", width: 10 },
      { header: "Partidos", key: "pp", width: 10 },
      { header: "Especiales", key: "pe", width: 12 },
      { header: "Total", key: "tot", width: 10 },
    ];
    const used = new Set<string>(["Resumen"]);
    for (const part of parts ?? []) {
      const pick = pickById.get(part.id);
      sum.addRow({
        n: part.nombre,
        pg: pick?.puntos_grupos ?? 0,
        pp: pick?.puntos_partidos ?? 0,
        pe: pick?.puntos_especiales ?? 0,
        tot: pick?.puntos_total ?? 0,
      });
      if (!pick) continue;
      const ws = wb.addWorksheet(safeSheetName(part.nombre, used));
      writePlanillaSheet(ws, tournament, pick);
    }
    return {
      filename: `gilipolla-todas-planillas-${nowStamp()}.xlsx`,
      base64: await workbookToBase64(wb),
      mime: XLSX_MIME,
    };
  });

// ============== ADMIN: backup completo ==============

export const generateBackupXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { wb } = await makeWorkbook();

    const tables = [
      "participants",
      "picks",
      "tournament_state",
      "user_roles",
      "admin_audit",
    ] as const;
    for (const t of tables) {
      const { data, error } = await supabaseAdmin.from(t).select("*");
      if (error) throw new Error(`${t}: ${error.message}`);
      const rows = (data ?? []) as Record<string, unknown>[];
      const ws = wb.addWorksheet(t);
      if (rows.length > 0) {
        const cols = Object.keys(rows[0]);
        ws.columns = cols.map((c) => ({
          header: c,
          key: c,
          width: Math.min(40, Math.max(12, c.length + 4)),
        }));
        for (const r of rows) {
          const flat: Record<string, unknown> = {};
          for (const c of cols) {
            const v = r[c];
            flat[c] = v != null && typeof v === "object" ? JSON.stringify(v) : v;
          }
          ws.addRow(flat);
        }
      } else {
        ws.addRow(["(vacío)"]);
      }
    }

    const meta = wb.addWorksheet("_meta");
    meta.addRow(["Generado", new Date().toISOString()]);
    meta.addRow(["Versión", "1.0"]);
    meta.addRow(["Tablas", tables.join(", ")]);

    return {
      filename: `gilipolla-backup-${nowStamp()}.xlsx`,
      base64: await workbookToBase64(wb),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  });

// ============== Public verification (no auth) ==============

export const verifyComprobante = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      code: z
        .string()
        .min(8)
        .max(64)
        .regex(/^[a-f0-9]+$/),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("get_comprobante_public", {
      _code: data.code,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { valid: false as const };
    return {
      valid: true as const,
      nombre: row.nombre as string,
      estado_pago: row.estado_pago as string,
      updated_at: row.updated_at as string,
      puntos_total: row.puntos_total as number,
      codigo: row.codigo as string,
    };
  });

// ============== ADMIN: backup a Storage (bucket "backups") ==============

export const uploadBackupToStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { wb } = await makeWorkbook();

    const tables = [
      "participants",
      "picks",
      "tournament_state",
      "user_roles",
      "admin_audit",
    ] as const;
    for (const t of tables) {
      const { data, error } = await supabaseAdmin.from(t).select("*");
      if (error) throw new Error(`${t}: ${error.message}`);
      const rows = (data ?? []) as Record<string, unknown>[];
      const ws = wb.addWorksheet(t);
      if (rows.length > 0) {
        const cols = Object.keys(rows[0]);
        ws.columns = cols.map((c) => ({
          header: c,
          key: c,
          width: Math.min(40, Math.max(12, c.length + 4)),
        }));
        for (const r of rows) {
          const flat: Record<string, unknown> = {};
          for (const c of cols) {
            const v = r[c];
            flat[c] = v != null && typeof v === "object" ? JSON.stringify(v) : v;
          }
          ws.addRow(flat);
        }
      } else {
        ws.addRow(["(vacío)"]);
      }
    }
    const meta = wb.addWorksheet("_meta");
    meta.addRow(["Generado", new Date().toISOString()]);
    meta.addRow(["Versión", "1.0"]);
    meta.addRow(["Tablas", tables.join(", ")]);

    const buf: ArrayBuffer = await wb.xlsx.writeBuffer();
    const filename = `gilipolla-backup-${nowStamp()}.xlsx`;
    const path = `auto/${filename}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("backups")
      .upload(path, new Uint8Array(buf), {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });
    if (upErr) throw new Error(upErr.message);
    return { ok: true as const, path, filename };
  });

export const listBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage
      .from("backups")
      .list("auto", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(error.message);
    return (data ?? []).map((f) => ({
      name: f.name,
      path: `auto/${f.name}`,
      size: f.metadata?.size ?? null,
      created_at: f.created_at ?? null,
    }));
  });

const BACKUP_PATH_RE = /^auto\/[A-Za-z0-9._-]+\.xlsx$/;
const backupPathSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(256)
      .refine((p) => BACKUP_PATH_RE.test(p) && !p.includes(".."), {
        message: "Ruta de backup inválida",
      }),
  })
  .strict();

export const getBackupSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => backupPathSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("backups")
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const deleteBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => backupPathSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from("backups").remove([data.path]);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
