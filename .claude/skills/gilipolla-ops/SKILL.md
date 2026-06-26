---
name: gilipolla-ops
description: Operar LA GILIPOLLA 2026 — deploy en Vercel, migraciones/SQL en Supabase, variables de entorno, modelo de auth (alias+PIN), reglas de puntuación, scripts y operaciones comunes (aplicar migración, backup, limpiar usuarios, resetear resultados). Úsalo al desplegar, tocar la base de datos, o hacer operaciones de admin/datos de este proyecto.
metadata:
  project: lagilipolla-c373bc22
  version: "1.0"
---

# gilipolla-ops — playbook operativo de LA GILIPOLLA 2026

Polla mundialista (Mundial FIFA 2026) del Bar El Guanábano. **No hay secretos en este
archivo** (el repo es público): las claves viven en `.env` (local) y en las env vars de
Vercel; el PAT de Supabase y la clave admin los provee el usuario en cada sesión.

## Stack y deploy

- **Stack:** TanStack Start (SSR) + React 19 + Supabase (Postgres) + Tailwind v4 + shadcn/ui + Bun + Vitest. La **puntuación vive en SQL** (`calc_pick_points`), no en TS.
- **Deploy: Vercel.** Proyecto `lagilipolla-c373bc22` → producción **https://lagilipolla-c373bc22.vercel.app**. **Auto-deploy al hacer `git push` a `main`** (integración GitHub). `vite.config.ts` usa `nitro: { preset: "vercel" }` (clave top-level). Verificar con `vercel ls` (status Ready, ~35s build). El repo es **público** → nunca commitear datos de usuarios/PII ni secretos.
- **Local:** `bun install` + `bun run dev` → Vite SSR en `http://localhost:8080`. Si un dev server viejo quedó en 8080 sirviendo data antigua, mátalo (`taskkill //PID <pid> //F`) y reinicia.

## Variables de entorno

`.env` (local) y env vars de Vercel (Production + Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (anon), `SUPABASE_SERVICE_ROLE_KEY` (secreto, salta RLS), `SUPABASE_URL`, `VITE_APP_URL`.

- **`VITE_APP_URL`** = base pública (ej. `https://lagilipolla-c373bc22.vercel.app`, **sin barra final** o el QR genera `//verificar` → 308). Se inyecta en build (`import.meta.env`). En Vercel las vars de Producción son **sensibles** (no legibles con `vercel env pull`); para verlas/recrearlas usa `vercel env add NAME prod --value "..." --no-sensitive --yes --non-interactive`.
- **`.env` NO se trackea** en git (gitignored). `.env.example` trae los valores públicos como plantilla.

## Aplicar SQL / migraciones a Supabase

Las migraciones viven en `supabase/migrations/*.sql`. Dos formas de aplicarlas:

1. **Lovable** (legacy) aplica las migraciones al sincronizar `main` — ya no es el objetivo de deploy pero puede seguir corriendo migraciones.
2. **Management API (recomendado, inmediato):** `POST https://api.supabase.com/v1/projects/<ref>/database/query` con `Authorization: Bearer <PAT>` y body `{"query": "<sql>"}`. El PAT (formato `sbp_...`) lo genera el usuario en Supabase → Account → Access Tokens (caducan/se revocan; si da 401 pide uno nuevo). Esto corre como rol postgres (puede DDL, tocar `auth.*`, `storage.*`).
   - `digest()`/pgcrypto viven en el schema `extensions` → funciones que lo usen necesitan `SET search_path = public, extensions`.

Tras editar migraciones, regenerar el snapshot: `bash scripts/dump_schema.sh` (escribe `supabase/schema.snapshot.sql`, referencia de solo lectura).

## Modelo de auth

- **Participantes:** alias + **PIN de 4 dígitos**. Mapeo determinista a Supabase auth: `aliasToEmail(alias)` → `<slug>@polla.local`, `pinToPassword(pin)` → password (`src/lib/auth.ts`). Cambiar PIN = `supabase.auth.updateUser({ password: pinToPassword(nuevoPin) })` (UI en el menú del navbar → `ChangePinDialog`).
- **Admin (organizador):** `admin@gilipolla.co` con email+password (no PIN). Login organizador en `/login`. El admin **no compite** (`get_polla_leaderboard` excluye a quien tenga rol admin en `user_roles`).

## Reglas de puntuación (fuente: `reglas/`, implementadas en SQL `calc_pick_points`)

- **Grupos (1º/2º):** 5 exacto · 3 invertido · 1 uno acertado · 0.
- **Marcadores:** 5 exacto · 3 ganador + goles de un equipo · 2 solo ganador · 1 empate o goles de un equipo · 0.
- **Especiales:** goleador 10, arquero 10 (comparación **normalizada**: `norm_especial` SQL / `normEspecial` TS — tolera mayúsculas/acentos/espacios).
- **Desempates:** más aciertos de 5, luego de 3, luego de 2.
- Marcadores: **un solo dígito (0–9)** y completos (gh y ga); validado en cliente (`lastGol`, `scoreState`) y en BD (trigger `picks_validate`). Edición abierta salvo lo ya guardado (inmutable) y cierre **24 h antes de cada partido** (`is_match_locked`). Cierre global solo si el admin fija `picks_locked_at`.
- Solo el **Grupo K (Colombia)** se pronostica por marcador en grupos; el resto por 1º/2º. `groups.K` define los equipos del K; `groupKMatches(ts)` filtra esos partidos. `group_k_matches` contiene los **72 partidos** de fase de grupos (calendario FIFA completo).

## Comprobante / verificación (QR)

- PDF descargable en el Panel (`generateComprobantePDF`, server fn) con QR a `${VITE_APP_URL}/verificar/<código>`. El código = `comprobante_code(pid, updated_at)` (SHA-256, **epoch en segundos enteros** — debe coincidir TS y SQL). `/verificar/<código>` usa `get_comprobante_public` (anon-callable) y muestra "Comprobante válido".
- `picks.updated_at` solo cambia con las **predicciones** (trigger `picks_updated_at BEFORE UPDATE OF groups, group_k_matches, extra_matches, goleador_id, arquero_id`), no con recálculos de puntos → el QR de un comprobante no se invalida al recalcular.

## Scripts (`scripts/`)

| Script | Qué hace |
|---|---|
| `bun scripts/e2e_data_check.mjs` | Verifica estado de la BD (datos oficiales, partido 6 = fixture FIFA, sin marcadores en partidos futuros, leaderboard, sin demo). |
| `bash scripts/dump_schema.sh` | Regenera `supabase/schema.snapshot.sql`. |
| `bun scripts/export_db.mjs` | Export por tabla a `supabase/db-export/<fecha>/` (gitignored — datos solo local). |
| `bun scripts/dump_data.mjs` | Dump completo a `exports/` (gitignored). |
| `ADMIN_PASS=… bun scripts/apply_official_data.mjs` | Aplica datos oficiales a `tournament_state` vía sesión admin. |

Backup de producción seguro: Admin → Reportes → **Cloud Backups** (`uploadBackupToStorage`) sube `.xlsx` al bucket privado `backups` de Supabase.

## Operaciones comunes (vía Management API + service_role)

- **Limpiar usuarios (empezar de cero):** borrar `picks`, `pick_history`, `participants`; `user_roles` y `auth.users` **excepto el admin** (`auth.admin.deleteUser` para los auth). Conservar `tournament_state`.
- **Resetear resultados oficiales:** en `tournament_state` poner `gh/ga=null` en `group_k_matches` y `extra_matches`, `pos1/pos2=null` por grupo, `goleador_id/arquero_id=null` — **preservando** equipos, fechas, sedes, deadline, fases y visibilidad.
- **Reabrir edición:** `picks_locked_at` es NOT NULL → ponerlo a fecha futura (post-final) para no bloquear; el cierre real lo dan los locks por-partido 24 h.

### Bracket de eliminatorias (KO)
La estructura del KO (32 partidos M73–M104) vive en `tournament_state.extra_matches` (JSONB) y se puntúa por marcador 5/3/2/1 igual que grupos (no hay tablas nuevas ni scoring aparte). Fuente única en TS: `src/lib/knockout-bracket.ts`.
- **Sembrar el bracket:** migración `…_seed_knockout_bracket.sql` (idempotente: solo siembra si `extra_matches` está vacío). Crea los 32 partidos (ids `m73`…`m104`) con etiquetas placeholder (`Segundo A`, `Ganador E`, `Mejor 3° (A/B/C/D/F)`, `Ganador Partido 74`, `Perdedor Partido 101`), con sedes y fechas oficiales (el admin puede ajustar en **Cronograma**). Es la copia versionada del bracket ya cargado en prod.
- **Generar dieciseisavos:** Admin → **Cronograma** → "Generar cruces": rellena 1°/2° desde `groups.pos1/pos2` oficiales (cargados en Resultados) + asignación manual de los 8 mejores terceros (la app **no** guarda los 72 marcadores de grupos, así que los terceros no se auto-rankean). Revisar y **Guardar cronograma**.
- **Activar la fase:** en Cronograma, el switch de cada fase la muestra al usuario y habilita la carga de marcadores (sincroniza `phases`+`visibility`).
- **Avanzar ganadores:** Admin → **Resultados** → "Avanzar ganadores": tras cargar marcadores KO, rellena local/visitante de la ronda siguiente; en empates el admin designa el ganador por penales. Revisar y guardar.
- **Regenerar a cero:** vaciar primero (`UPDATE tournament_state SET extra_matches='[]' WHERE id=1`) y volver a aplicar la migración / botón.

## Verificación antes de pushear

`bunx tsc --noEmit` · `bun run lint` (0 errores; warnings react-refresh son preexistentes) · `bun run test` · `bun run build`. eslint ignora `dist/.output/.vinxi/.vercel/.nitro/.tanstack`.
