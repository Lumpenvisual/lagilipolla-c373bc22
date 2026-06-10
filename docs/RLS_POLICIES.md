# Políticas RLS — La Gilipolla 2026

Modelo de seguridad: **todo el acceso pasa por RLS**. No se usa el
`service_role` desde el cliente, y los roles viven en una tabla aparte
(`public.user_roles`) consultada mediante la función `SECURITY DEFINER`
`public.has_role(uuid, app_role)` para evitar recursión.

## Roles

- `app_role` enum: `'admin' | 'user'`.
- Cada nuevo usuario recibe `'user'` automáticamente vía el trigger
  `handle_new_user_role()` sobre `auth.users`.
- Para promover a alguien a admin:

  ```sql
  INSERT INTO public.user_roles (user_id, role)
  VALUES ('<uuid>', 'admin');
  ```

- Helper canónico (NUNCA leer `user_roles` directamente desde una policy):

  ```sql
  CREATE POLICY "..." ON public.x
    FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  ```

## Tablas y políticas

### `participants`

| Política                  | Op     | Rol           | Regla                                                |
| ------------------------- | ------ | ------------- | ---------------------------------------------------- |
| `participants_own_read`   | SELECT | authenticated | `user_id = auth.uid()`                               |
| `participants_own_insert` | INSERT | authenticated | `user_id = auth.uid() AND estado_pago = 'pendiente'` |
| `participants_admin_all`  | ALL    | authenticated | `has_role(auth.uid(), 'admin')`                      |

Notas:

- Un usuario solo puede inscribirse como **pendiente**. Aprobar pagos es
  responsabilidad del admin (`estado_pago = 'aprobado'`).
- No hay política para `anon`; la inscripción requiere sesión.

### `picks`

| Política           | Op     | Rol           | Regla                                                                                                   |
| ------------------ | ------ | ------------- | ------------------------------------------------------------------------------------------------------- |
| `picks_own_read`   | SELECT | authenticated | admin OR `participant_id` pertenece a un `participants` cuyo `user_id = auth.uid()`                     |
| `picks_own_write`  | INSERT | authenticated | `participant_id` pertenece al usuario **y** `estado_pago = 'aprobado'`                                  |
| `picks_own_update` | UPDATE | authenticated | mismas condiciones **y** `tournament_state.deadline > now()` (la planilla cierra al iniciar el mundial) |
| `picks_admin_all`  | ALL    | authenticated | `has_role(auth.uid(), 'admin')`                                                                         |

Cierre adicional a nivel de **trigger** (`enforce_picks_deadline`):

- Bloquea cualquier escritura no-admin cuando `tournament_state.picks_locked_at <= now()`.
- Bloquea actualizaciones de partidos individuales cuando faltan menos de
  **24 horas** para su `fecha` (función `is_match_locked`).

### `tournament_state`

| Política         | Op     | Rol            | Regla                           |
| ---------------- | ------ | -------------- | ------------------------------- |
| `ts_public_read` | SELECT | public (anon+) | `true` (lectura abierta)        |
| `ts_admin_write` | ALL    | authenticated  | `has_role(auth.uid(), 'admin')` |

`tournament_state` es **público de lectura** intencionalmente: el cronograma,
resultados oficiales y posiciones de grupo se muestran en `/cronograma` sin
requerir login.

### `pick_history`

| Política                        | Op     | Rol           | Regla                                                                        |
| ------------------------------- | ------ | ------------- | ---------------------------------------------------------------------------- |
| `Participant reads own history` | SELECT | authenticated | el `participant_id` pertenece al usuario, OR `has_role(auth.uid(), 'admin')` |

Solo escrito por el trigger `log_pick_history` (`SECURITY DEFINER`); no hay
políticas de INSERT/UPDATE/DELETE → escritura imposible desde el cliente.

### `user_roles`

| Política                | Op     | Rol           | Regla                           |
| ----------------------- | ------ | ------------- | ------------------------------- |
| `user_roles_own_read`   | SELECT | authenticated | `user_id = auth.uid()`          |
| `user_roles_admin_read` | SELECT | authenticated | `has_role(auth.uid(), 'admin')` |

Sin políticas de escritura → los roles solo se modifican por el trigger
`handle_new_user_role` o por un admin con `service_role` desde la consola.

### `admin_audit`

| Política            | Op     | Rol           | Regla                           |
| ------------------- | ------ | ------------- | ------------------------------- |
| `Admins read audit` | SELECT | authenticated | `has_role(auth.uid(), 'admin')` |

## Funciones `SECURITY DEFINER`

| Función                        | Acceso             | Para qué sirve                                                            |
| ------------------------------ | ------------------ | ------------------------------------------------------------------------- |
| `has_role(uuid, app_role)`     | EXECUTE público    | Chequeo de rol sin recursión RLS.                                         |
| `get_polla_leaderboard()`      | EXECUTE público    | Tabla de posiciones con `RANK()` (no expone `user_id`).                   |
| `get_comprobante_public(text)` | EXECUTE público    | Verificación de pago vía código corto (12 chars SHA-256).                 |
| `comprobante_code(uuid, ts)`   | IMMUTABLE          | Hash determinístico para el código de comprobante.                        |
| `is_match_locked(text)`        | EXECUTE público    | Bloqueo de partido 24h antes del kickoff (usado por trigger y por la UI). |
| `calc_pick_points(uuid)`       | Solo admin/trigger | Recalcula los puntos de una planilla.                                     |
| `recalc_all_picks()`           | Solo admin         | Recalcula todas las planillas (verifica `has_role` adentro).              |

Los `EXECUTE público` están auditados — todas filtran o anonimizan los datos
antes de devolverlos (ver `security://memory`).

## Reglas de oro

1. **Nunca** leer `user_roles` desde una política — usar `has_role()`.
2. **Nunca** importar `client.server.ts` (service role) en código cliente.
3. Toda tabla nueva en `public` debe:
   - Tener `GRANT` explícito en la misma migración.
   - Activar `ENABLE ROW LEVEL SECURITY`.
   - Definir al menos una política (sin políticas = tabla bloqueada).
4. Las escrituras del usuario sobre `picks` deben sobrevivir tres capas:
   policy RLS + trigger de deadline + UI deshabilitada.
5. Cambios en políticas → crear nueva migración con timestamp; **no editar**
   archivos existentes en `supabase/migrations/`.
