-- Bucket privado para los respaldos .xlsx que genera el admin (uploadBackupToStorage).
-- Las funciones de backup usan service_role (saltan RLS), así que no requieren políticas.
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;
