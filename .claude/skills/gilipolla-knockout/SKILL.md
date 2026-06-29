---
name: gilipolla-knockout
description: >-
  Operar la FASE DE ELIMINATORIAS de LA GILIPOLLA 2026 (Mundial FIFA 2026):
  bracket en JSONB (extra_matches m73–m104), generar cruces desde clasificados,
  avanzar ganadores, candado por-ronda (1h antes del primer partido),
  visibilidad por fase, nombres completos de equipos, comprobante PDF con
  histórico, continuidad de puntos. Úsala al tocar el bracket KO, el panel de
  Resultados/Cronograma del admin, el candado de eliminatorias o el display de
  equipos. Para deploy/DB general usa la skill gilipolla-ops.
---

# gilipolla-knockout — playbook de la fase de eliminatorias

La fase KO está construida sobre el **sistema JSONB existente** (NO hay tablas
relacionales nuevas). Para deploy en Vercel, aplicar SQL vía Management API + PAT,
env vars y auth, ver la skill **`gilipolla-ops`**.

## Modelo de datos

- **Almacenamiento:** `tournament_state.extra_matches` (array JSONB de 32 partidos KO) y `picks.extra_matches` (marcadores `gh/ga` del usuario). El usuario predice **marcador** (no solo ganador).
- **Scoring:** `calc_pick_points` (SQL) ya suma `extra_matches` con **5/3/2/1** igual que grupos. NO tocar scoring. Espejo TS: `matchPts` en `src/lib/polla.ts`.
- **Fuente única del bracket (TS):** `src/lib/knockout-bracket.ts` → `KNOCKOUT_BRACKET` (32 partidos `m73…m104`, fase, sede, fecha, cruces) + helpers puros `buildExtraMatchesFromBracket()`, `applyRound32()`, `applyAdvance()`. Cruces verificados contra el bracket oficial FIFA 2026.
- **Ids `m73…m104`** = numeración FIFA. Sembrado versionado en `supabase/migrations/20260625120000_seed_knockout_bracket.sql` (idempotente: solo siembra si `extra_matches` está vacío).

## Convención CÓDIGOS vs NOMBRES (clave)

- `extra_matches.local/visitante` guardan **CÓDIGOS** ISO3 (`RSA`, `CAN`…), igual que `group_k_matches`. **El scoring y los helpers de bracket dependen de los códigos → NO guardar nombres en los datos.**
- La UI resuelve código→**nombre completo + bandera** con `teamNameByCode(groups, code)` (`src/lib/polla.ts`): busca en los 12 grupos; placeholders (`"Ganador Partido 74"`, `"Mejor 3° (…)"`) quedan igual.
- Aplicado en: planilla (`PlanillaEditor`), leaderboard (detalle), panel **Resultados** admin (`ResultadosTab`) y panel público (`OfficialResultsPanel`), **reportes Excel** y **comprobante PDF** (`reports.functions.ts`).
- En "Avanzar ganadores" el `<select>` de penales muestra el **nombre** como label pero el **value sigue siendo el código** (lo que se guarda).

## Operaciones del admin

1. **Generar dieciseisavos** — Admin → **Cronograma** → "Generar cruces": rellena 1°/2° desde `groups.pos1/pos2` oficiales (cargados en Resultados) + asignación **manual** de los 8 mejores terceros (cada slot restringe a sus grupos candidatos; la app **no** guarda los 72 marcadores de grupos, así que no se auto-rankean los terceros). Revisar y **Guardar cronograma**.
2. **Activar/mostrar una ronda** — Cronograma: el switch de la fase la hace **visible** al participante y habilita la carga de marcadores (sincroniza `phases`+`visibility`). El candado solo **deshabilita inputs**, no oculta.
3. **Cargar resultados** — Admin → **Resultados**: cada fase es un **Collapsible** (chip "N/total con resultado"; abre por defecto la primera fase con partidos sin resultado). Muestra **nombres completos**. Al guardar llama `recalc_all_picks` → puntos al día.
4. **Avanzar ganadores** — Admin → **Resultados** → "Avanzar ganadores": tras cargar marcadores KO rellena `local/visitante` de la ronda siguiente; en **empate** el admin designa el ganador por penales. Revisar y guardar.

## Candado POR-RONDA (eliminatorias)

- Regla (desde jun-2026): la ronda KO se cierra para **participantes 1 hora antes del PRIMER partido de la fase** (toda la fase cierra junta, aunque haya partidos días después). **Admin con bypass total.** Grupo K sigue **24 h por partido**.
- **SQL (aplicado en prod):** `supabase/migrations/20260625130000_knockout_phase_lock.sql` → `is_extra_phase_locked(_match_id)` (`now() >= MIN(fecha de la fase) - 1h`; si la fase no tiene fechas, **no bloquea**) + `enforce_picks_deadline` (trigger `picks_enforce_deadline`; bucle `extra_matches` usa la nueva función, `group_k_matches` sigue `is_match_locked`).
- **Espejo TS:** `isExtraPhaseLocked(extra, fase, nowMs?)` en `src/lib/polla.ts`; `PlanillaEditor` deshabilita inputs por fase (badge "ronda cerrada").
- Verificar en prod (read-only): `select public.is_extra_phase_locked('m73');` → `false` = abierto.

## Comprobante / histórico

- **PDF de usuario** (`generateComprobantePDF`, self-only): incluye sección "ELIMINATORIAS — HISTÓRICO DE MARCADORES" (cada partido KO con nombre completo, marcador propio, oficial y puntos) con **paginación automática**.
- **Decisión UI:** el histórico de marcadores va **solo en el PDF descargable**, NO en la pantalla del dashboard (se quitó `PickHistoryCard` del perfil de usuario para evitar confusión). El admin sí ve el historial de cambios en `PickHistoryCard scope="all"`.
- **Continuidad de puntos:** `get_polla_leaderboard` combina grupos+K+KO (`puntos_total`); `recalc_all_picks` se dispara al guardar resultados.

## Pendiente MANUAL (fuera de alcance, por decisión del dueño)

- Actualización por-partido de equipos/fechas cuando FIFA publique (sorteos/resultados): a mano en **Cronograma** (fechas/sedes/equipos) + **"Avanzar ganadores"** tras cada ronda.
- Los 8 mejores terceros: asignación **manual asistida** (no se codificó la tabla FIFA de 495 combinaciones).

## Verificación

- Local: `bunx tsc --noEmit` · `bun run lint` · `bun run test` · `bun run build`.
- Read-only prod (vía service_role o Management API): que los partidos KO resuelven a nombre con `teamNameByCode` (0 códigos) y que `is_extra_phase_locked` da los valores esperados por fase.
- Estado actual (jun-2026): grupos terminados, 1°/2° cargados, **16 dieciseisavos resueltos con equipos reales**; octavos→final con placeholders hasta avanzar.
