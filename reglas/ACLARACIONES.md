# Aclaraciones al Reglamento 2026

## Anexo técnico · 20 de julio de 2026

Este documento **complementa** a `Reglamento2026.pdf` — no lo reemplaza y no cambia ningún
puntaje. El reglamento oficial dice, sin más detalle:

> *"Goleador del mundial: 10 puntos. Mejor Arquero: 10 puntos. Goleador y Arquero, según los
> premios oficiales entregados en la final."*

Lo que el reglamento no especifica es **cómo se decide si lo que escribiste coincide con el
jugador oficial**. Esa regla vive en el código de la aplicación (no en un documento hasta
ahora) y es lo que este anexo documenta con precisión, para que sea consultable si alguien
reclama.

## Regla de coincidencia (vigente desde el 20-jul-2026)

Cada predicción de Goleador/Arquero se guarda como texto libre en formato `"Nombre (Equipo)"`.
Para decidir si acierta contra el jugador oficial, se compara **nombre y equipo por
separado**, tolerando mayúsculas, acentos y espacios en ambos:

1. **Nombre completo igual** (normalizado) → acierta, sin importar el equipo escrito.
2. **Typo pequeño en el nombre** (distancia de edición ≤ 2 caracteres) **+ equipo
   coincidente** → acierta.
3. **Apellido solo / parte del nombre** (todas las palabras que escribiste están contenidas
   en el nombre oficial, o viceversa) **+ equipo coincidente en ambos lados** → acierta.
4. Cualquier otro caso → **no acierta (0 puntos)**.

**El equipo manda:** si escribiste un equipo y no coincide con el oficial (ni con un error de
tipeo de 1 carácter), **no acierta aunque el nombre sea idéntico o muy parecido** — evita que
alguien reciba puntos por escribir el nombre correcto pero de un jugador homónimo de otra
selección.

**Si falta el equipo** en tu predicción o en el oficial, y el nombre por sí solo habría
calzado (por apellido o por typo), el caso queda **ambiguo**: no se otorgan los 10 puntos
automáticamente. En la práctica esto es rarísimo — 0 casos entre los 74 predicciones
existentes al 20-jul-2026 (ver tabla abajo) — porque el formulario siempre pide nombre y
equipo.

**Alias reconocido:** "Holanda" y "Países Bajos" se tratan como el mismo equipo (y también se
tolera 1 carácter de typo en el nombre del equipo, p. ej. "Brasill" ≡ "Brasil").

Fuente única de la regla: `especialMatches`/`especialMatchMotivo` en `src/lib/polla.ts` (TS,
espejo de presentación) y `public.especial_matches()` en
`supabase/migrations/20260720010000_especiales_typo_vale.sql` (SQL, la que paga los puntos
reales). Ambas implementaciones se auditaron el 20-jul-2026 contra los 74 pares reales de
producción y los casos de la suite de tests: **0 discrepancias**
(`scripts/audit_especial_matches_diff.mjs`).

## Tabla de casos

Oficiales vigentes al cierre del Mundial: **Goleador = Kylian Mbappé (Francia)** · **Arquero
= Unai Simón (España)**.

### Casos reales de producción (participante → oficial vigente)

| Lo que escribió el participante | ¿Acierta? | Por qué |
|---|---|---|
| `Kylian Mbappé (Francia)` | ✅ Sí | Nombre y equipo exactos. |
| `kylian mbappe (FRANCIA)` | ✅ Sí | Mayúsculas/acentos no importan. |
| `Kyllan Mbappé (Francia)` (Cuculeitodelbalon) | ✅ Sí | Typo de 1 letra en el nombre ("Kyllan" vs "Kylian"), equipo confirma. |
| `Mbappe (Francia)` (MiraLo) | ✅ Sí | Solo el apellido, sin acento, equipo confirma. |
| `Harry Edward Kane (Inglaterra)` | ❌ No | Nombre legal completo de OTRO jugador (Kane) — no calza con Mbappé por ningún camino; el equipo tampoco es el oficial. |
| `Harry Kane (Inglaterra)` | ❌ No | Jugador distinto; el equipo tampoco coincide. |
| `Michael Akpovie Olise (Francia)` | ❌ No | Mismo equipo (Francia), pero jugador distinto — el nombre no calza ni por typo ni por apellido. |
| `Verbruggen (Holanda)` (MiraLo, pick de arquero) | ❌ No | Equipo (Holanda→Países Bajos) no coincide con el oficial (España) — el equipo ya descarta el acierto, sin mirar el nombre. |

### Casos de la suite de tests (demuestran una regla que hoy no tiene ejemplo real en producción)

| Comparación | ¿Acierta? | Por qué |
|---|---|---|
| `Bart Verbruggen (Países Bajos)` vs oficial `Verbruggen (Holanda)` | ✅ Sí | Apellido coincide + alias Holanda≡Países Bajos (en cualquier dirección). |
| `Alisson Becker (Brasill)` vs oficial `Alisson Becker (Brasil)` | ✅ Sí | Typo de 1 letra tolerado también en el nombre del equipo. |
| `Harry Edward Kane (Inglaterra)` vs oficial `Harry Kane (Inglaterra)` | ✅ Sí | Nombre legal completo — es superconjunto del oficial, equipo confirma. |
| `Damián Emiliano Martínez (Argentina)` vs oficial `Emiliano Martínez (Argentina)` | ✅ Sí | Mismo caso: nombre legal completo. |
| `Lautaro Martínez (Argentina)` vs oficial `Emiliano Martínez (Argentina)` | ❌ No | Mismo apellido y mismo equipo, pero es OTRO jugador — el nombre completo no calza ni por typo ni por subconjunto de palabras. |
| `Mbappe` (sin equipo) vs oficial `Kylian Mbappé (Francia)` | ⚠️ Ambiguo → 0 | El apellido calzaría, pero falta el equipo del lado del participante para confirmarlo. |
| `Mbappe (Francia)` vs oficial `Kylian Mbappé` (sin equipo) | ⚠️ Ambiguo → 0 | El apellido calzaría, pero falta el equipo del lado oficial para confirmarlo. |

## Historial de la regla (transparencia)

| Fecha | Qué pasó |
|---|---|
| Hasta 19-jul-2026 | La comparación era **texto exacto completo** (incluyendo formato). Por una incompatibilidad entre cómo se guardaba el oficial y cómo se guardaban las predicciones, **0 de 74 predicciones acertaban** — ni siquiera las que tenían el nombre perfecto. |
| 19-jul-2026, migración `20260719220000` | Se corrige el formato del oficial y se introduce la comparación por partes (nombre + equipo) con tolerancia a typo y apellido. |
| 20-jul-2026, migración `20260720000000` | Ajuste: se retira momentáneamente la tolerancia a typo de nombre (solo exacto o apellido). |
| 20-jul-2026, migración `20260720010000` (**vigente**) | Se restaura la tolerancia a typo de nombre — es la regla descrita arriba. |
| 20-jul-2026 | Auditoría integral (`docs/auditoria-puntuacion-2026-07-20.md`): verificada la integridad aritmética del leaderboard, el espejo TS↔SQL (94/94 casos) y que ningún pronóstico (`groups`, `group_k_matches`, `extra_matches`, `goleador_id`, `arquero_id`) fue modificado — solo las columnas de puntaje. |

**En ningún momento se restaron puntos a nadie.** Antes de la corrección, todos tenían 0 en
especiales; el ajuste solo reconoció los aciertos que el sistema no estaba viendo. 14
participantes sumaron puntos (+180 en total): ver el detalle en
`backups/pre-especiales-2026-07-20/` (línea base) y
`backups/post-especiales-2026-07-20/` (después del ajuste).

## A quién le sirve este documento

Al admin del bar, si alguien pregunta por qué su puntaje de especiales cambió, o por qué el
puntaje de otro participante subió sin que él tocara su planilla. La respuesta corta: "el
sistema tenía un error que no reconocía ningún acierto; se corrigió y nadie perdió puntos."
La tabla de arriba es la referencia si hace falta explicar un caso puntual.
