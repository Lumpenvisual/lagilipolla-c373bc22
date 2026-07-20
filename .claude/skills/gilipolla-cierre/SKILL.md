---
name: gilipolla-cierre
description: >-
  Playbook del CIERRE DEL CAMPEONATO de LA GILIPOLLA 2026: orden de operaciones
  del admin al terminar el Mundial (semis → tercero/final → especiales), las 3
  garantías (trigger de recálculo en BD, checklist de cierre en el admin, gate
  del podio en el home), el E2E transaccional y el troubleshooting del podio.
  Úsala al cargar los últimos resultados, subir goleador/arquero oficiales,
  publicar el podio final o diagnosticar por qué no aparece.
---

# gilipolla-cierre — playbook del cierre del campeonato

Objetivo: que al terminar el Mundial el **podio de LA GILIPOLLA** (1°, 2°, 3er
lugar) se publique **solo** en la pantalla de inicio, con los puntos correctos.
Para deploy/DB general ver `gilipolla-ops`; para el bracket KO ver `gilipolla-knockout`.

## Orden de operaciones del admin (todo en Admin → Resultados)

1. **Semifinales**: cargar marcadores → "Guardar y recalcular puntos" (auto-avanza
   ganador→final y perdedor→tercer puesto; empate en 90' = designar ganador manual).
2. **Tercer puesto (m103) y Final (m104)**: cargar marcadores → Guardar.
3. **Especiales**: escribir **goleador y arquero oficiales** en la Card "Especiales"
   (misma pestaña Resultados; la ruta /admin/especiales es solo lectura de picks)
   → Guardar. Desde jul-2026 la card tiene **dos campos separados: nombre y equipo**
   (`SpecialEdit` en tabs.tsx) que se persisten compuestos en el **formato canónico
   `"Nombre (Equipo)"`** que exige `especial_matches`, y son **siempre editables**:
   volver a guardar recalcula los puntos (trigger `ts_recalc_on_official_change`).
   Regla de acierto (migración `20260720010000`): 10 pts por nombre igual, typo
   pequeño (levenshtein ≤2) con equipo coincidente, o apellido/parte del nombre con
   equipo en ambos lados; quien no coincide tiene 0. Detalle en `gilipolla-ops`.
4. Nada más: el podio del home se publica automáticamente al quedar todo completo.

## Las 3 garantías

1. **Recálculo automático en BD** — trigger `ts_recalc_on_official_change` (AFTER
   UPDATE de `groups`, `group_k_matches`, `extra_matches`, `goleador_id`,
   `arquero_id` en `tournament_state`, migración `20260715170000`) →
   `recalc_all_picks_internal()`. Desde la migración `20260720120000` el recálculo
   es **POR CATEGORÍA** (ya no hay soft-guard global que abortara todo por un solo
   marcador a medias): `calc_pick_points` omite con CONTINUE cada partido oficial
   inválido y cada grupo con 1º=2º, y los **especiales se calculan siempre**.
   `recalc_all_picks_internal()` devuelve **jsonb** `{participantes,
   partidos_omitidos:[{id,motivo}], grupos_omitidos, aciertos_especiales}`.
   `recalc_all_picks()` conserva su contrato (integer + check admin + guard duro,
   ahora ENUMERANDO los datos inválidos en la excepción); el admin usa el RPC
   `recalc_all_picks_report()` (jsonb) y el toast muestra advertencia con lo
   omitido, éxito con el conteo, y nunca "recalculado" si fue 0
   (`src/lib/recalc-report.ts`). E2E transaccional de la separación:
   `node scripts/e2e_recalc_categorias.mjs` (ROLLBACK). Recalcular dos veces es
   inocuo. Verificar trigger:
   `select tgname from pg_trigger where tgrelid='public.tournament_state'::regclass;`
2. **Checklist "Cierre del campeonato" en el admin** — banner al tope de
   ResultadosTab (`src/components/admin/tabs.tsx`), aparece cuando las **semis ya
   tienen resultado**: lista ✅/❌ de `tournamentCompletion(ts)` (grupos, Grupo K,
   cada fase KO, goleador, arquero) con cuántos faltan, y **aviso rojo destacado
   para subir los especiales** si faltan. Con todo completo → card verde
   "Campeonato completo · podio publicado" con link al home.
3. **Gate del podio** — `isTournamentComplete(ts)` = `tournamentCompletion(ts).done`
   (`src/lib/polla.ts`): 1º/2º de los 12 grupos + Grupo K completo + **cada fase
   KO existente y con resultado (32 llaves, final incluida)** + especiales no
   vacíos. UI: `FinalPodium` (`src/components/FinalPodium.tsx`) en el home,
   agrupa por `posicion` del leaderboard (soporta empates); "Campeón del Mundial"
   solo si la final NO quedó empatada en 90' (el ganador por penales no se persiste).

## E2E del cierre (transaccional, cero riesgo)

`SUPABASE_PAT=sbp_... node scripts/e2e_final_flow.mjs` — un request al
Management API = una transacción: completa KO pendientes + especiales de prueba
(tomados del pick real de un participante, con mayúsculas/espacios cambiados para
probar `norm_especial`), el trigger recalcula, y hace asserts de: puntos_especiales
de TODOS los picks, coherencia del leaderboard, y condición de podio. Termina con
`RAISE EXCEPTION 'E2E_OK {payload}'` → **ROLLBACK garantizado**; el script valida
el post-check (prod intacta). `E2E_FAIL ...` = assert roto. Requiere el trigger
aplicado y el PAT (Supabase → Account → Access Tokens; caducan).

## Troubleshooting: "el podio no aparece"

- Revisar qué falta: `tournamentCompletion(ts).items` (o el banner del admin).
  Causas típicas: una llave KO sin marcador (deben ser las 32), goleador/arquero
  con solo espacios, bracket sin sembrar.
- Puntos raros → el trigger existe? (query de arriba). Botón "Recalcular puntos"
  del admin fuerza el recálculo.
- El podio usa `get_polla_leaderboard` (excluye admin, RANK con desempates
  aciertos 5/3/2). Empate real en un puesto → muestra todos los nombres.
- Los tests del gate/podio: `src/lib/__tests__/polla-validation.test.ts`
  (tournamentCompletion) y `src/components/__tests__/FinalPodium.test.tsx`.
