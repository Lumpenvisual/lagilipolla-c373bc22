# Auditoría integral de la puntuación en producción — 2026-07-20 (T7)

**Alcance:** solo lectura sobre producción (proyecto Supabase `tkemdabazwkvkwokdosd`).
Toda prueba que necesitó escribir se hizo dentro de una transacción con `RAISE EXCEPTION`
final garantizando `ROLLBACK` (patrón `scripts/e2e_*.mjs`), verificado con un post-check
de totales antes/después. **Cero UPDATE/INSERT/DELETE permanentes.**

**Commit auditado:** `7f75759` (rama `main`). **Fecha/hora de la auditoría:** 2026-07-20,
~12:00–13:00 UTC.

**Resultado en una frase:** la puntuación en sí (grupos, partidos, especiales, ranking) está
**correcta y verificada por cuatro ángulos independientes** (aritmética en BD, espejo TS↔SQL,
integridad de los pronósticos, comportamiento vivo del recálculo). Pero la auditoría encontró
**un riesgo operativo real que no es de puntuación** (sección 4) y dos gaps menores de UX
(secciones 5 y 6). Nada de esto se corrigió — quedan reportados para que decidas.

---

## 1. Integridad aritmética del leaderboard — ✅

| Verificación | Resultado |
|---|---|
| `puntos_total = puntos_grupos + puntos_partidos + puntos_especiales` | **Es columna `GENERATED ALWAYS AS`** (`(puntos_grupos + puntos_partidos) + puntos_especiales`) — Postgres lo garantiza, no puede divergir. Confirmado: 0/37 inconsistentes. |
| `puntos_especiales ∈ {0, 10, 20}` | 0/37 fuera de dominio. |
| `get_polla_leaderboard()` vs `picks` | 0/37 filas divergentes (`puntos_total`, `puntos_especiales`, `aciertos_5/3/2`). |
| `RANK()` respeta el desempate 5→3→2 | Recalculé la posición de las 37 filas de forma independiente en JS (sin usar `RANK()` de Postgres) y comparé: **0 posiciones incorrectas**. Hay exactamente 1 empate real (Edgar Arango / Jose Ricardo, puesto 30) y quedó resuelto igual en ambos lados. |
| Admin excluido del leaderboard | `get_polla_leaderboard()` filtra con `NOT EXISTS (... user_roles ur WHERE role='admin')`. 37 aprobados = 37 filas del leaderboard = 0 con rol admin. |

**Top 3 verificado:** Patricia Repo 147 · Nana Corpas 137 · Los Troncos 128 — coincide con el
podio público.

---

## 2. Espejo TS vs SQL de `especial_matches` — ✅

Script nuevo: **`scripts/audit_especial_matches_diff.mjs`** (solo lectura, `bun scripts/audit_especial_matches_diff.mjs`).
Importa `especialMatches` en vivo desde `src/lib/polla.ts` (no una copia pegada) y lo compara
contra `SELECT public.especial_matches(...)` en un solo batch SQL.

- **74 pares reales** (`picks.goleador_id`/`arquero_id` de los 37 aprobados vs los oficiales
  vigentes `"Kylian Mbappé (Francia)"` / `"Unai Simón (España)"`).
- **20 casos** de la tabla de tests (`src/lib/__tests__/polla-validation.test.ts`, describe
  `especialMatches`), incluidos todos los bordes: mayúsculas/acentos, typo pequeño con
  levenshtein, apellido solo, ambigüedad sin selección, alias Holanda≡Países Bajos, typo de
  selección, selecciones contradictorias, `null`/vacío/espacios.

**Resultado: 94/94 coinciden.** SQL y TS deciden exactamente lo mismo en cada caso, incluidos
los tres cambios de regla del 19–20 de julio. El badge del leaderboard nunca le dice a nadie
algo distinto de lo que la BD pagó.

---

## 3. Los pronósticos siguen intactos — ✅ (con una limitación que declaro)

**Prueba de código (exhaustiva):** revisé las 6 versiones históricas de `calc_pick_points`
(única función que hace `UPDATE public.picks`, en las 6 migraciones que la definen) — **todas**
sin excepción escriben únicamente `puntos_grupos, puntos_partidos, puntos_especiales, aciertos_5,
aciertos_3, aciertos_2`. Ninguna toca `groups`, `group_k_matches`, `extra_matches`, `goleador_id`
ni `arquero_id`. Es estructuralmente imposible que el trabajo de especiales/recálculo haya
modificado un pronóstico.

**Prueba empírica:** comparé `picks.updated_at` actual contra el capturado en
`backups/pre-especiales-2026-07-20/puntajes.csv` (tomado antes de mi primera migración de
especiales). El trigger `picks_updated_at` dispara con **cualquier** `UPDATE OF groups,
group_k_matches, extra_matches, goleador_id, arquero_id` — incluso si el valor nuevo es
idéntico al viejo (así funciona la granularidad `UPDATE OF` en Postgres). Por eso, un
`updated_at` bit-a-bit idéntico (hasta el microsegundo) es prueba directa de **cero
escrituras** a esas 5 columnas, no solo "mismo valor".

- **37/37 picks con `updated_at` idéntico** al backup.
- **0 picks con `updated_at ≥ 2026-07-19T22:00:00Z`** (inicio de la primera migración de especiales).
- **0 divergencias** en `goleador_id`/`arquero_id` (cruce explícito contra el backup).
- 0 participantes nuevos desde el backup, 0 discrepancias de conteo.

**Limitación que declaro explícitamente (pediste esto si aplicaba):** el backup
`backups/pre-especiales-2026-07-20/puntajes.csv` **no incluye** las columnas JSONB
`groups`, `group_k_matches` ni `extra_matches` en bruto — solo trae `goleador_id`,
`arquero_id` y las columnas de puntaje. No pude hacer un diff byte-a-byte de esas 3 columnas
directamente. Los otros backups del repo (`supabase/db-export/20260611-2200/`,
`exports/dump-20260610/`) son de antes de que hubiera participantes reales (1 solo pick de
prueba) — inútiles para este cruce. Me apoyo en la garantía del trigger de `updated_at` como
evidencia indirecta pero rigurosa de que esas 3 columnas tampoco cambiaron; no es un
"asumo que está bien", pero tampoco es un diff directo de esos JSONB.

---

## 4. Recálculo por categoría — ⚠️ lógica ✅, pero hallazgo operativo ❌

Reutilicé el patrón de `scripts/e2e_recalc_categorias.mjs` contra el estado **actual** de
producción. La primera corrida **falló**, y ese fallo es el hallazgo más importante de esta
auditoría.

### Hallazgo: el candado global de planillas ahora bloquea cualquier escritura vía Management API/PAT a `tournament_state`

- `tournament_state.picks_locked_at = 2026-07-20 05:00:00 UTC` — **ya pasó** (`now()` al
  momento de la auditoría: `2026-07-20 12:31 UTC`). El candado global está **activo**.
- El trigger `enforce_picks_deadline()` (`BEFORE INSERT OR UPDATE ON picks`, sin restricción
  de columnas) revisa `has_role(auth.uid(),'admin')` **en cada UPDATE a `picks`**, incluido el
  `UPDATE ... SET puntos_grupos=..., puntos_partidos=..., puntos_especiales=...` que hace
  `calc_pick_points` — una sentencia que **no toca ningún pronóstico**.
- Cuando el candado global está activo y `auth.uid()` es `NULL` (que es lo que pasa siempre
  en una conexión vía Management API/PAT — no hay JWT, no hay sesión), `has_role(NULL,'admin')`
  = `false` → el trigger lanza `'Las planillas están cerradas...'` **dentro** del recálculo
  de puntaje de cualquier participante → la excepción aborta **toda la transacción**,
  incluido el `UPDATE tournament_state` que la disparó.
- **Reproducido en vivo** (dentro de una transacción con `ROLLBACK`, sección A del test):
  intenté el mismo `UPDATE tournament_state` que usa `e2e_recalc_categorias.mjs` y recibí
  exactamente `E2E_CONFIRMED Las planillas están cerradas. Habla con el admin si necesitas un
  cambio.`

**Impacto práctico:** con el candado en el pasado (como está ahora), **cualquier futura
migración o script vía Management API que actualice `tournament_state`** — que es el flujo
que la skill `gilipolla-ops` documenta como "recomendado, inmediato" y el que usaron
literalmente todas las migraciones de especiales de esta semana — **fallará y hará rollback
completo**, aunque el cambio en sí no tenga nada que ver con picks ni con marcadores (p. ej.
corregir el nombre de un equipo).

**Lo que NO parece estar roto (pero no pude probarlo con credenciales reales):** `auth.uid()`
lee `current_setting('request.jwt.claim.sub', true)` — un GUC de **sesión/transacción**, no
afectado por los saltos de rol de `SECURITY DEFINER`. Esto implica que cuando el admin
**autenticado real** guarda desde la UI (o pulsa "Recalcular"), `auth.uid()` debería seguir
resolviendo a su ID durante toda la cascada de triggers, `has_role` = `true`, y el candado
se saltaría con normalidad — igual que ya lo hace para los candados por-partido/por-ronda.
Para verificarlo **sin tus credenciales**, repetí la prueba dentro de la misma transacción
con `ROLLBACK` pero con `SET LOCAL request.jwt.claim.sub = '<uuid del admin>'` (el UUID de
`admin@gilipolla.co` es metadato público en `user_roles`, no una credencial) — esto reproduce
exactamente el contexto que ve el trigger cuando el admin real opera desde la UI:

| Con sesión admin simulada (`auth.uid()` = admin) | Resultado |
|---|---|
| Grupo A corrupto (1º=2º) → solo grupos baja (1285→1248); partidos y especiales intactos | ✅ |
| Final (m104) a medias → solo partidos baja (2381→2369); grupos y especiales intactos | ✅ |
| Especiales siempre calculados, pase lo que pase con los marcadores | ✅ (180 pts intactos en ambos pasos) |
| `recalc_all_picks_internal()` reporta exactamente `m104: marcador incompleto` y `grupo A: 1º y 2º repetidos`, nada más | ✅ |
| `_official_data_issues()` (fuente del guard duro) coincide con el reporte | ✅ |
| `recalc_all_picks()` (guard duro, botón "Recalcular") rechaza por **datos inválidos**, con mensaje legible — no por el candado | ✅ |
| **Post-check:** totales reales en prod tras ambas pruebas (con y sin admin simulado) | **Idénticos** al estado inicial: grupos=1285, partidos=2381, especiales=180, total=3846 — ambas transacciones hicieron `ROLLBACK` correctamente. |

**Conclusión de la sección 4:** la lógica de recálculo por categoría (T4) funciona
exactamente como se diseñó. El hallazgo real es que **el candado global ya pasó y bloquea
el canal operativo de Management API** — no lo toqué; ver la prioridad #1 más abajo y el
punto 1 del checklist manual, que es la forma de confirmar con certeza si esto afecta
también al admin real.

---

## 5. Salidas que ve la gente

### Probado en vivo (navegador real, sin credenciales — todo público) — ✅

- **`/verificar/<código>`**: calculé el código real de un comprobante (John Jaramillo, SHA-256
  de `participant_id + updated_at` en segundos, primeros 12 hex — fórmula idéntica en cliente
  y SQL) y abrí la página en un navegador de verdad. Muestra **"COMPROBANTE VÁLIDO"**,
  participante correcto, estado de pago, última actualización y **124 puntos** (coincide con
  el leaderboard). *Nota: un primer intento con `curl` dio negativo — era un falso negativo
  (la verificación es client-side vía React Query; el HTML crudo SSR solo trae el spinner de
  carga). Lo confirmé con un navegador real antes de concluir nada.*
- **`FinalPodium` (home)**: "🥇 Patricia Repo · 147 puntos", "Goleador: Kylian Mbappé · Francia",
  "Arquero: Unai Simón · España" — formato "Nombre · Equipo" (T6-A3) correcto en producción.
- **`OfficialResultsPanel` (`/leaderboard`, sección "Resultados oficiales")**: mismo formato
  "Kylian Mbappé · Francia" / "Unai Simón · España", correcto.
- **Vista expandida de un participante en `/leaderboard`**: al abrir la fila de John Jaramillo
  se ve "Goleador: Kylian Mbappé (Francia) `+10 pts`" y "Arquero: Unai Simón (España) `+10 pts`"
  — coincide con la BD. (Aquí el formato es el texto crudo del propio pick con paréntesis, no
  el "· " del oficial — son dos componentes distintos a propósito, no es inconsistencia.)

### ⚠️ No pude generar/descargar (requieren sesión autenticada; no pedí credenciales)

`generateComprobantePDF` exige `requireSupabaseAuth` + que el `userId` sea el propio
participante; `generateLeaderboardXlsx`, `generateUserPlanillaXlsx` y `generateAllPlanillasXlsx`
exigen `requireAdmin`. No pude invocar ninguno de los cuatro. Lo que sigue es **revisión de
código únicamente**, no un archivo generado e inspeccionado:

- **Excel** (`reports.functions.ts` líneas 163-168 y 658-664): usa `parseSpecial()`
  correctamente — separa nombre y selección en columnas. La columna `pe` (`generateLeaderboardXlsx`
  línea ~701 y `generateAllPlanillasXlsx` línea ~832) lee directo de `picks.puntos_especiales`,
  ya verificado correcto en la sección 1.
- **PDF comprobante — hallazgo nuevo:** la sección "SELECCIONES ESPECIALES"
  (`reports.functions.ts` líneas 486-510) imprime **solo el texto crudo** de la respuesta del
  participante (`Goleador del Mundial: Kylian Mbappé (Francia)`) — a diferencia de **cada
  otra sección del mismo PDF** (grupos, partidos del Grupo K, eliminatorias), que sí dibujan
  `+N pts` junto a cada fila (líneas 415, 471). El PDF **nunca muestra si el especial contó
  como acierto** — ni `+10 pts` ni `0 pts`, ni el total de `puntos_especiales`. No es un bug
  de cálculo (los puntos en BD son correctos, verificado en secciones 1-2), es un hueco de
  presentación: alguien que acertó su goleador no tiene forma de verlo en su propio
  comprobante descargado.

---

## 6. Propagación en vivo (Realtime) — revisado por código, no ejecutado en vivo

No pude probar esto en vivo sin escribir en producción con una sesión admin real (necesitaría
dos pestañas simultáneas + un cambio real de `tournament_state`), así que lo digo por código,
como permite la tarea.

`src/components/RealtimeSync.tsx` (estado actual, incluye mi propio fix T6-A1):

| Query invalidada | ¿Cuándo? |
|---|---|
| `["tournament-state"]` | Directo, en cualquier cambio a `tournament_state`. ✅ |
| `["polla-leaderboard"]` | Debounced 1.5s, en cambios a `tournament_state`, `picks` o `participants`. ✅ |
| `["admin-specials-picks"]` | En cambios a `picks` — **indirecto** para cambios de `tournament_state`: solo se invalida porque `ts_recalc_on_official_change` reescribe las 37 filas de `picks`, lo que emite eventos Realtime de `picks` que sí la invalidan. Si el recálculo no corriera (p. ej. por el hallazgo de la sección 4), esta invalidación tampoco llegaría. ⚠️ |
| `["public-pick", participantId]` | **Nunca.** Ni el handler de `tournament_state` ni el de `picks` la invalidan, para ningún participante. |

**Consecuencia:** si alguien tiene la fila de un participante ya expandida en `/leaderboard`
(como la que probé en la sección 5) y el admin corrige un resultado oficial, esa vista **no
se refresca sola** — `staleTime: 30_000` en `leaderboard.tsx:184` no es un push, solo evita
refetch en un remount/refocus dentro de esos 30s; sin Realtime que la invalide, puede quedar
desactualizada indefinidamente si la pestaña no pierde el foco. No afecta el dato en BD, solo
lo que ya está pintado en pantalla.

---

## 7. Checklist manual (para ti, en el navegador — ~10 minutos)

Empieza por el punto 1: es la confirmación más urgente de esta auditoría.

1. **[URGENTE] Confirma que el candado no te bloquea a ti.** Entra como admin → Resultados →
   pulsa "Recalcular puntos" **sin cambiar nada**. Debe salir un toast **verde** tipo "Puntos
   recalculados para 37 participantes".
   - **Si ves eso:** perfecto, el hallazgo de la sección 4 solo afecta a scripts/Management
     API, no a tu uso normal. No hay nada que hacer hoy.
   - **Si ves "Las planillas están cerradas" o cualquier error:** es una emergencia — significa
     que ni tú puedes recalcular puntos ahora mismo, y hay que arreglarlo antes de cargar
     cualquier resultado nuevo (semis/final/especiales si faltara algo). Avísame de inmediato.

2. **Especiales editables.** En la misma pantalla, card "Especiales": agrega y quita un espacio
   al final del campo "Equipo" del arquero (sin cambiar nada real) → Guardar. Debe verse el
   toast de éxito, sin errores, y el podio en `/leaderboard` debe seguir mostrando los mismos
   puntos de siempre (Patricia Repo 147 primero).

3. **Toast de advertencia con un marcador a medias** (esto quedó pendiente de confirmar desde
   T4). Elige un partido de eliminatorias que ya tenga marcador y **borra solo uno de los dos
   goles** (deja el otro campo lleno) → Guarda. Debe salir un toast **amarillo/naranja** de
   advertencia mencionando ese partido y "marcador incompleto" — **no** el mensaje verde
   genérico. Después completa el marcador que dejaste a medias y guarda de nuevo: ahora sí debe
   salir el toast verde normal.

4. **Los demás no se ven afectados por el paso 3.** Mientras el marcador quedó a medias (antes
   de completarlo en el paso 3), abre `/leaderboard` en una pestaña nueva (o incógnito) y
   confirma que el resto de participantes mantiene sus puntos normales — nadie debe quedar en
   0 ni congelado.

5. **Cruce rápido admin vs público.** Abre `/admin/especiales` (tabla de respuestas) y compara
   2-3 participantes contra lo que ves al expandir su fila en `/leaderboard` — el nombre del
   jugador y el `+10`/`0 pts` deben coincidir en ambos lados.

---

## Lo que esta auditoría NO cubre (para no dar falsa sensación de "todo verificado")

- **#18** — el umbral `levenshtein ≤ 2` para el nombre no está auditado contra el plantel real
  del Mundial (más allá de los 74 pares que sí existen hoy en producción). Es el riesgo abierto
  de falso positivo si aparece un jugador nuevo con nombre parecido a otro.
- **#19** — no hay aviso persistente en el admin de que quedan marcadores oficiales
  incompletos (solo el toast puntual al guardar/recalcular).
- **#16** — la regla de tolerancia (apellido solo, typo, alias de país) no está documentada
  para los participantes.
- **#12** — no hay chips de auditoría en la tabla de especiales del admin.
- **#17** — la vista de marcadores por partido (quién predijo qué contra el oficial, agregado)
  no existe todavía.

---

## Lista priorizada de hallazgos

| # | Hallazgo | Severidad | Sección |
|---|---|---|---|
| 1 | Candado global (`picks_locked_at`, pasado desde hoy 05:00 UTC) bloquea y hace `ROLLBACK` de cualquier `UPDATE tournament_state` hecho vía Management API/PAT, aunque no toque pronósticos — rompe el flujo operativo recomendado por `gilipolla-ops` para futuras correcciones. **No confirmado si afecta también al admin autenticado real** (el checklist #1 lo resuelve). | 🔴 Alta (riesgo operativo, torneo en curso) | 4 |
| 2 | `RealtimeSync` no invalida `["public-pick", participantId]` — una fila ya expandida en `/leaderboard` puede quedar con puntos viejos sin refresco automático. | 🟡 Media (solo UX/staleness, no afecta el dato real) | 6 |
| 3 | El PDF comprobante no muestra si el especial contó como acierto (`+10`/`0 pts`), a diferencia de cada otra sección del mismo documento. | 🟡 Media (UX, no afecta cálculo) | 5 |
| 4 | Backup `pre-especiales-2026-07-20` no incluye `groups`/`group_k_matches`/`extra_matches` en bruto — cualquier auditoría futura de "¿cambió algún pronóstico?" tendrá que depender de la garantía del trigger `updated_at`, no de un diff directo. | 🟢 Baja (limitación de tooling, no un bug) | 3 |
| 5 | Excel de leaderboard/planillas no se inspeccionaron como archivo real (solo código) por falta de sesión admin. | 🟢 Baja (código ya verificado correcto en otra vía) | 5 |

**No se aplicó ningún fix.** Quedo a la espera de tu decisión sobre el hallazgo #1 en particular.
