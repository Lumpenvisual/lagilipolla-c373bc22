# Base de datos — guía rápida (para Claude Code)

Toda la BD está versionada en el repo. No hay estado "oculto" en Lovable Cloud
que no esté reflejado aquí.

## Archivos clave

- `supabase/migrations/*.sql` — **fuente única de verdad**. Cada cambio de
  esquema (tablas, RLS, funciones, triggers, grants) es una migración
  inmutable con timestamp. No editar archivos existentes; crear uno nuevo.
- `supabase/schema.snapshot.sql` — snapshot autogenerado que concatena todas
  las migraciones en orden. Útil para leer el esquema completo de un tirón
  sin abrir 36 archivos. **No editar**: regenerar con
  `bash scripts/dump_schema.sh`.
- `src/integrations/supabase/types.ts` — tipos TS autogenerados a partir del
  esquema vivo. No editar a mano.
- `supabase/config.toml` — referencia del proyecto (autogen).

## Tablas (resumen)

| Tabla              | Propósito                                                   |
| ------------------ | ----------------------------------------------------------- |
| `participants`     | Inscripciones a la polla (1 por usuario) + estado de pago   |
| `picks`            | Predicciones del participante + puntos calculados           |
| `pick_history`     | Auditoría de cambios en marcadores                          |
| `tournament_state` | Estado oficial del torneo (1 sola fila, id=1)               |
| `user_roles`       | Roles por usuario (`user` / `admin`) — separado de profiles |
| `admin_audit`      | Log de acciones admin                                       |

RLS habilitado en todas las tablas `public`. Admin se verifica vía
`has_role(auth.uid(), 'admin')` (SECURITY DEFINER).

## Workflow en Claude Code

1. Clonar repo de GitHub (ya conectado vía Lovable).
2. Leer `supabase/schema.snapshot.sql` para entender el esquema actual.
3. Cambios de esquema → crear nueva migración en `supabase/migrations/` con
   nombre `YYYYMMDDHHMMSS_descripcion.sql` y aplicarla con tu CLI de Supabase
   preferido (`supabase db push` si usas la CLI oficial).
4. Regenerar snapshot: `bash scripts/dump_schema.sh`.
5. Regenerar tipos TS (si trabajas fuera de Lovable):
   `supabase gen types typescript --project-id fqcvxlkgmkoahknbwlqu > src/integrations/supabase/types.ts`

## Datos (no esquema)

Los datos de las tablas **no** viven en el repo. Para exportarlos:

- Dashboard de Supabase → Database → Tables → Export CSV, o
- `pg_dump --data-only` con `SUPABASE_DB_URL`.

Scripts útiles en `scripts/`:

- `apply_official_data.mjs` — aplica datos oficiales del torneo
- `clean_demo.mjs` — limpia datos demo
- `e2e_data_check.mjs` — verifica integridad
