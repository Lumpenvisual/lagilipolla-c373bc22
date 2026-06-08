-- Limpieza de datos de prueba (demo) para dejar la polla lista para producción.
--
-- Qué hace:
--   1) Borra los 6 usuarios demoN@gilipolla.co. El FK participants.user_id ->
--      auth.users (ON DELETE CASCADE) elimina sus participants y, a su vez, sus picks.
--   2) Elimina cualquier participant [DEMO] huérfano que hubiera quedado sin user_id.
--   3) Quita las funciones seed_polla_demo() / reset_polla_demo(): ya no se usan en
--      la app (se retiró el tab "Demo" del admin) y así no se puede re-sembrar.
--
-- Qué NO toca:
--   - El admin sembrado admin@gilipolla.co (no es demo).
--   - Ningún participante ni planilla reales.
--
-- Idempotente: si ya no existen datos demo, no borra nada.

BEGIN;

-- 1) Usuarios demo (cascade → participants + picks)
DELETE FROM auth.users
WHERE email LIKE 'demo%@gilipolla.co';

-- 2) Participants [DEMO] huérfanos (por si quedaron sin user_id)
DELETE FROM public.participants
WHERE nombre LIKE '[DEMO]%';

-- 3) Retirar funciones de datos de prueba
DROP FUNCTION IF EXISTS public.seed_polla_demo();
DROP FUNCTION IF EXISTS public.reset_polla_demo();

COMMIT;
