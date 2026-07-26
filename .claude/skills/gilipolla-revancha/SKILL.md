---
name: gilipolla-revancha
description: >-
  Operar LA REVANCHA de LA GILIPOLLA 2026: competencia de segunda oportunidad
  (semis+final, 5/3/2/1/0), 100% separada de la polla principal — inscripción
  con la misma cuenta o de cero, aprobación de pago en su propia pestaña del
  admin, planilla reducida, tabla de posiciones propia, y las reglas de
  visibilidad por tipo de inscrito. Úsala al tocar cualquier archivo/tabla con
  "revancha" en el nombre, el selector de inscripción, o las dos pestañas de
  aprobación del admin. Para deploy/DB general usa `gilipolla-ops`; para el
  bracket KO de la polla principal usa `gilipolla-knockout`.
---

# gilipolla-revancha — playbook de La Revancha

Competencia de segunda oportunidad sobre **semis + final únicamente**, con **pozo propio**
y **tabla propia**, completamente separada de la polla principal — a propósito, en cada capa
(esquema, RLS, scoring, UI). Nadie debe poder confundir sus datos con los de la polla, ni
como participante ni como admin. Para deploy/Management API/reset de BD, ver `gilipolla-ops`.

## Modelo de datos

- **Tabla `revancha_picks`** — misma forma que `picks` pero solo `extra_matches` (semis+final):
  `participant_id` (PK/FK a `participants`), `extra_matches jsonb`, `puntos`, `aciertos_5/3/2`,
  `updated_at`. Sin `groups`/`group_k_matches`/`goleador_id`/`arquero_id` — esa competencia no
  los tiene.
- **`participants.en_polla_original`** (`boolean NOT NULL`, **sin DEFAULT** — cualquier INSERT
  debe nombrarlo explícito, a propósito: una columna con peso de seguridad no puede heredar un
  valor en silencio) + **`participants.estado_pago_revancha`** (`text` nullable, mismos 3
  valores que `estado_pago`: `pendiente`/`aprobado`/`rechazado`; `NULL` = "nunca aplicó a
  Revancha", distinto de `'pendiente'` = "aplicó, en espera").
- **`participants.estado_pago`** también es nullable (`NULL` = solo-revancha, nunca aplicó a
  la polla principal — no es "pendiente" de nada).
- **`tournament_state.revancha_abierta`** (bool, candado manual) + **`revancha_locked_at`**
  (timestamptz, fecha límite única — sin candado por-partido ni por-fase, cubre semis+final
  juntas) + **`revancha_cuota_cop`** (integer, configurable por el admin con un `UPDATE`
  normal — NO hardcodeada en TS).
- **Origen de nombres:** el esquema se aplicó como `repechaje_*` (`20260725000000`) y se
  renombró a `revancha_*` al día siguiente (`20260726000000`, sin reescribir la migración
  vieja — así queda el historial real). "Repechaje" ya significaba otra cosa en el reglamento
  oficial (resolución de cupos FIFA / alargue-penales en `ScoringRulesPanel`) — coincidencia de
  nombre, no de concepto, no resuelta a propósito en el reglamento.

## Scoring — funciones propias, nunca tocan las de la polla principal

- **`_match_pts(oficial, pick)`** — la regla 5/3/2/1/0 extraída como función nueva e
  independiente (verificada contra `matchPts()` TS en 16 900 combinaciones, 100% coincidencia).
  `calc_pick_points` (polla) **no se tocó** para reusarla — refactorizar la función más
  auditada del proyecto por una ganancia cosmética de DRY no valía el riesgo.
- **`calc_revancha_points(participant_id)`** — usa `_match_pts`, escribe `revancha_picks`.
- **`get_revancha_leaderboard()`** — mismo desempate 5→3→2 que `get_polla_leaderboard`, pero
  `puntos` (no 3 categorías), `LEFT JOIN revancha_picks`, `WHERE estado_pago_revancha='aprobado'`,
  excluye admin.
- **`get_public_revancha_pick(uuid)`** — la contraparte de `get_public_pick` para el detalle
  ajeno en la tabla: mismo patrón de **redacción por kickoff** (`GROUP BY fase HAVING
  now() >= MIN(fecha)`, semis y final reveladas por separado, sin fecha válida nunca se
  revela) copiado literal. La redacción es SOLO del RPC público — el dueño (RLS ownership) y
  el admin (RLS admin_all) siempre ven la fila cruda de `revancha_picks` sin candado de fecha.
- **Recálculo automático:** trigger *hermano* `ts_recalc_revancha_on_official_change` (`AFTER
  UPDATE OF extra_matches` en `tournament_state`) — NO extiende `ts_recalc_on_official_change`
  de la polla. Envuelto en su propio `BEGIN/EXCEPTION`: un fallo ahí jamás aborta el recálculo
  de la polla principal (probado con fault injection). Orden alfabético de triggers hace que
  el de la polla corra primero, pero eso es solo defensivo — la protección real es el
  `BEGIN/EXCEPTION`.

## RLS — el candado del flujo de dinero (NO tocar sin E2E transaccional)

- **`participants_own_insert`** (reforzada, `20260728000000`): el `WITH CHECK` solo admite
  **dos formas exactas** de alta propia:
  - Polla: `en_polla_original=true, estado_pago='pendiente', estado_pago_revancha IS NULL`.
  - Solo-revancha: `en_polla_original=false, estado_pago IS NULL, estado_pago_revancha='pendiente'`.

  Ninguna otra combinación pasa — en particular, nadie puede insertarse ya con
  `estado_pago_revancha='aprobado'`. **Esto es innegociable**: si una tarea futura "necesita"
  tocar esta policy para permitir un tercer camino de alta, es una señal de que el alcance se
  entendió mal — parar y preguntar antes de tocarla.
- **`participants_own_update`** (nueva, no existía ninguna antes) + trigger
  **`participants_own_update_guard`** (mismo patrón que `picks_validate`: RLS solo exige
  ownership, la restricción real vive en el trigger comparando NEW vs OLD): un participante
  YA existente puede pedir entrar a Revancha (`estado_pago_revancha` `NULL`→`'pendiente'`, una
  sola vez) sin poder auto-aprobarse, sin poder re-pedir tras un rechazo, y sin poder tocar su
  propio `estado_pago` de la polla. Admin bypassea todo (`has_role`).
- **Verificado end-to-end con la MISMA cuenta** (mismo `user_id` de principio a fin,
  transaccional): alta polla → aprobada → pide Revancha → aprobada → en AMBAS con puntuaciones
  independientes → rechazo → el usuario NO puede re-pedir → el admin SÍ puede reaprobar directo
  (`rechazado→aprobado`, sin pasar por `pendiente`). Ver `scripts/e2e_doble_registro_misma_cuenta.mjs`.

## UI — inscripción, selector y "la otra después"

- **Selector de inscripción** (`CompetitionSelector.tsx`, en `/registro`): dos tarjetas, cuotas
  leídas de `tournament_state` (nunca hardcodeadas). La tarjeta de Revancha manda al **hub**
  `/revancha` (NO directo a `/revancha/registro`) — el hub ya bifurca "ya tengo cuenta →
  login" / "soy nuevo → registro", así quien ya tiene cuenta nunca choca con "alias ya en uso"
  al intentar crear una segunda cuenta solo para sumarse.
- **`RegistrationForm`** con `mode="polla" | "revancha"` — mismo componente, dos formas de
  INSERT (ver RLS arriba). Mensaje de alias-ya-tomado **honesto**: no asume que la cuenta
  existente es de quien la ve, no muestra ningún dato de ella, ofrece un enlace a login.
- **`/revancha` (hub)** — estado según `estado_pago_revancha`: `NULL` → botón "Entrar a La
  Revancha" (self-UPDATE); `pendiente` → esperando aprobación; `rechazado` → explica que no
  puede re-pedir, hable con el admin; `aprobado` → planilla reducida.
- **Dashboard principal** (`dashboard.tsx`) — participantes solo-revancha (`en_polla_original
  =false`) van por una rama aparte (`SoloRevanchaDashboard`, nunca ven el mensaje de pago de
  la polla). Participantes de la polla ven `RevanchaPromoCard`: CTA para unirse si nunca
  aplicó, "llenar planilla" si aprobado, y — el gap real que se encontró y corrigió — un
  mensaje explícito si fue **rechazado** (antes la tarjeta desaparecía sin explicación, dejando
  a la persona sin saber que el trigger le bloquea re-pedir).
- **Planilla reducida** — `RevanchaPlanillaEditor` (solo semis+final), reutiliza
  `MatchScoreRow` (extraído de `PlanillaEditor`, no duplicado). Hooks `useRevanchaPick`/
  `useSaveRevanchaPick` (mismo patrón select-then-insert-or-update que `useSavePick`, para no
  disparar el candado de deadline en un UPDATE de solo puntaje — **nunca** tocan `picks`).
- **Tabla de posiciones** — `useRevanchaLeaderboard` (espejo de `usePollaLeaderboard`).
  `LeaderboardTable`/`ParticipantPickDetail` (extraídos de `leaderboard.tsx`) son compartidos
  entre las dos tablas: el detalle recibe `phases`/`showGrupos`/`showEspeciales` como props
  (Revancha pasa solo `["semis","final"]`) en vez de asumirlos. `/revancha/leaderboard` con
  acento **azul** (`info`) + badge "Competencia aparte" — a propósito distinto del dorado de
  la polla, para que nadie la confunda con la principal. Misma tabla embebida en
  `/admin/revancha`.
- **Admin: dos pestañas separadas, físicamente** — `PagosTab` (`/admin`) filtra
  `en_polla_original=true` y solo toca `estado_pago`; `RevanchaTab` (`/admin/revancha`) lista
  a cualquiera con `estado_pago_revancha` no-nulo (badge de solo lectura "en la polla: sí/no")
  y solo toca `estado_pago_revancha`. Diseño explícito para que ningún botón pueda aprobar el
  pago equivocado — **no unificar estas pestañas**.
- **Reglas de visibilidad en la navegación** (`puedeVerTablaPolla`/`puedeVerTablaRevancha` en
  `src/lib/polla.ts`) — regla de **experiencia, no de seguridad**: oculta el link a cada tabla
  según `en_polla_original`/`estado_pago_revancha`, pero `/leaderboard` y
  `/revancha/leaderboard` **siguen siendo públicas por URL**, sin guard ni `beforeLoad`. Está
  documentado así en el propio código a propósito — no asumir que ocultar el link protege algo.
- **`RealtimeSync.tsx`** tiene una suscripción SEPARADA a `revancha_picks` con el mismo
  debounce que `picks`, invalidando `revancha-leaderboard`/`public-revancha-pick`/
  `revancha-pick` — nunca las keys de la polla principal (cubierto con tests unitarios en
  `RealtimeSync.test.tsx`, no solo E2E vivo).

## Reglamento (`/reglas`)

La Revancha tiene su propia sección en `src/routes/reglas.tsx` (`RULES_ES.revanchaTitle` /
`RULES_EN.revanchaTitle` y las claves `revancha*` del mismo objeto `Rules`) — cuota leída de
`tournament_state.revancha_cuota_cop`, mismas reglas de marcador 5/3/2/1/0, y el mismo
disclaimer de "no afecta ni suma a la tabla principal, y viceversa".

## Verificación — E2E transaccionales (ROLLBACK garantizado)

Todos siguen el mismo patrón: la migración/lógica bajo prueba viaja en el MISMO request que
un `DO` final que fuerza `RAISE EXCEPTION 'E2E_OK ...'` → rollback automático. Como Management
API corre como `postgres` (bypassea RLS), los casos que dependen de que una policy RECHACE
algo usan `SET ROLE authenticated` + `set_config('request.jwt.claim.sub', ...)` antes del
intento — sin eso, cualquier operación "ilegal" pasaría igual y el E2E daría un falso verde.

| Script | Qué prueba |
|---|---|
| `scripts/e2e_revancha_inscripcion.mjs` | RLS de inscripción: las dos formas de alta, auto-aprobación rechazada, alta mezclada rechazada, pedir-entrar sin mover la polla, trigger de inmutabilidad. |
| `scripts/e2e_revancha_recalc.mjs` | Recálculo automático aislado de la polla principal (fault injection). |
| `scripts/e2e_revancha_leaderboard.mjs` | `get_public_revancha_pick`: orden/desempate, redacción por kickoff, independencia de fases (semis revelada + final oculta simultáneamente), dueño/admin ven la fila cruda. |
| `scripts/e2e_doble_registro_misma_cuenta.mjs` | La MISMA cuenta en ambas competencias de principio a fin: aprobación separada, puntuaciones independientes, rechazo→bloqueo→re-aprobación del admin. |
| `scripts/verify_revancha_flow.mjs` / `verify_revancha_visibilidad.ts` | Funcional (no rollback, con limpieza real al final): signup real con alias+PIN, RLS real de punta a punta, visibilidad de tablas contra filas reales. Usar cuando hace falta probar contra el cliente `anon` real (no solo Management API). |

**Sumas de control invariantes** (nada de esto debe escribir en `picks` ni cambiar la
puntuación de la polla): `grupos=1285 partidos=2381 especiales=180 total=3846`, 37 filas en
`get_polla_leaderboard()`. Cualquier E2E de Revancha que las mueva tiene un bug.

## Errores ya encontrados (para no repetirlos)

- **`RegistrationForm` no seteaba `en_polla_original` explícito** — se apoyaba en el DEFAULT
  `false` de la columna. Desde que se aplicó el esquema (25-jul-2026) hasta que se corrigió
  (28-jul-2026), CUALQUIER alta nueva a la polla principal nacía invisible en
  `get_polla_leaderboard()` aunque el admin aprobara el pago. Corregido seteando
  `en_polla_original: true` explícito + quitando el DEFAULT de la columna (para que el error
  no pueda repetirse en silencio).
- **El alias es una identidad GLOBAL, no por competencia** — `aliasToEmail(alias)` es
  determinístico sin importar el modo. Alguien que ya se inscribió a la polla con un alias NO
  puede crear una segunda cuenta con el mismo alias para Revancha; tiene que sumarse desde su
  cuenta existente (`/revancha` → "Entrar a La Revancha"). Este malentendido motivó el
  selector-que-bifurca-al-hub y el mensaje de alias-tomado honesto (ver UI arriba).
