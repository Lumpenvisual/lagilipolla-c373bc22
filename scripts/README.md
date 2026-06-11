# Scripts de operación / verificación

Scripts en **Bun** para verificar y operar la BD de Supabase. Leen credenciales de `.env`
(URL + keys). Las acciones de admin requieren la contraseña o la `service_role` por variable de
entorno; nada sensible se guarda en el repo.

## Flujo con Lovable (recomendado)

Lovable Cloud aplica automáticamente las migraciones de `supabase/migrations/` al sincronizar la
rama conectada (`main`). Para producción basta con dejar las migraciones en `main`, configurar los
secrets de entorno (ver `.env.example`, en especial `SUPABASE_SERVICE_ROLE_KEY` y `VITE_APP_URL`) y
sincronizar/desplegar.

> Para aplicar SQL al proyecto sin esperar a Lovable se usa la **Management API**
> (`POST /v1/projects/{ref}/database/query`) con un Personal Access Token válido.

## Scripts disponibles

| Script                    | Qué hace                                                                                                                                                              | Uso                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `e2e_data_check.mjs`      | Verifica el estado real de la BD (datos oficiales, Grupo K, partido 6 = fixture FIFA, sin marcadores fantasma en partidos futuros, cuota, RPC leaderboard, sin demo). | `bun scripts/e2e_data_check.mjs`                           |
| `dump_schema.sh`          | Concatena todas las migraciones en `supabase/schema.snapshot.sql` (inspección rápida; no editar el snapshot).                                                         | `bash scripts/dump_schema.sh`                              |
| `dump_data.mjs`           | Export COMPLETO de la BD vía `service_role` (salta RLS): un JSON por tabla + `auth.users` en `exports/dump-<fecha>/`.                                                 | `bun scripts/dump_data.mjs`                                |
| `migrate_to_new.mjs`      | Migra esquema + `tournament_state` a un proyecto Supabase nuevo vía Bun SQL nativo. NO migra participants/picks/auth.                                                 | `PGURL="postgresql://…" bun scripts/migrate_to_new.mjs`    |
| `apply_official_data.mjs` | Aplica datos oficiales a `tournament_state` vía sesión admin (idempotente, = migración `221000`).                                                                     | `ADMIN_PASS='<clave>' bun scripts/apply_official_data.mjs` |
| `clean_demo.mjs`          | Borra datos demo (llama a `reset_polla_demo` mientras exista).                                                                                                        | `ADMIN_PASS='<clave>' bun scripts/clean_demo.mjs`          |

## Notas

- `exports/` está en `.gitignore` (los dumps contienen datos de usuarios reales — no subir a git).
- El **backup de producción** se hace desde la app: Admin → Reportes → _Cloud Backups_ sube un
  `.xlsx` con todas las tablas al bucket privado `backups` del propio Supabase (`uploadBackupToStorage`).
- `apply_official_data.mjs` es idempotente; no choca si luego Lovable aplica la migración equivalente.
