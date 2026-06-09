# Scripts de operación / verificación

Scripts en Bun para verificar y operar la BD de Supabase. Leen credenciales de `.env`
(URL + anon key). Las acciones de admin requieren la contraseña por variable de entorno
(no se guarda en el repo).

## Flujo con Lovable (recomendado)

Lovable Cloud aplica automáticamente las migraciones de `supabase/migrations/` al
sincronizar la rama conectada (`main`). Para que todo quede oficial y limpio en producción
basta con:

1. Asegurar que estas migraciones están en `main` (ya lo están):
   - `20260608220000_remove_demo_data.sql` → borra los 6 usuarios demo y quita las
     funciones `seed/reset_polla_demo`.
   - `20260608221000_official_data_resolved.sql` → datos oficiales del Mundial 2026
     (repechajes resueltos + partidos del Grupo K corregidos).
2. Configurar en Lovable los secrets de entorno (ver `.env.example`), en especial
   `SUPABASE_SERVICE_ROLE_KEY`.
3. Sincronizar / desplegar: Lovable corre las migraciones y queda todo aplicado.

## Scripts (uso manual, opcional)

Útiles para aplicar/verificar sin esperar al deploy de Lovable.

```bash
# Verificar el estado real de la BD (datos oficiales aplicados, demo presente, etc.)
bun scripts/e2e_data_check.mjs

# Aplicar los datos oficiales a tournament_state vía sesión admin (idempotente)
ADMIN_PASS='<clave-admin>' bun scripts/apply_official_data.mjs

# Limpiar los datos demo ahora (llama a reset_polla_demo mientras exista)
ADMIN_PASS='<clave-admin>' bun scripts/clean_demo.mjs
```

> Nota: `apply_official_data.mjs` hace lo mismo que la migración `221000` (idempotente),
> así que no hay conflicto si luego Lovable aplica la migración.
