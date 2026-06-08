
-- ============ 1) DROP LEGACY ============
DROP FUNCTION IF EXISTS public.get_concurso_matches(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.calc_points() CASCADE;
DROP FUNCTION IF EXISTS public.generate_concursos(boolean) CASCADE;
DROP FUNCTION IF EXISTS public.get_leaderboard() CASCADE;
DROP FUNCTION IF EXISTS public.get_concurso_leaderboard(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_concursos_overview() CASCADE;
DROP FUNCTION IF EXISTS public.get_participant_predictions(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.seed_demo_data(integer, integer, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.reset_demo_data() CASCADE;
DROP FUNCTION IF EXISTS public.selftest_concursos() CASCADE;

DROP TABLE IF EXISTS public.predictions CASCADE;
DROP TABLE IF EXISTS public.inscripciones CASCADE;
DROP TABLE IF EXISTS public.concursos CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.demo_seed CASCADE;

-- ============ 2) LOCK DE DEADLINE ============
ALTER TABLE public.tournament_state
  ADD COLUMN IF NOT EXISTS picks_locked_at TIMESTAMPTZ NOT NULL
  DEFAULT '2026-06-11T15:00:00Z';  -- 10:00 COT

CREATE OR REPLACE FUNCTION public.enforce_picks_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lock TIMESTAMPTZ;
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN
    RETURN NEW;
  END IF;
  SELECT picks_locked_at INTO v_lock FROM public.tournament_state WHERE id = 1;
  IF v_lock IS NOT NULL AND now() >= v_lock THEN
    RAISE EXCEPTION 'Las planillas están cerradas. Habla con el admin si necesitas un cambio.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS picks_deadline_trigger ON public.picks;
CREATE TRIGGER picks_deadline_trigger
BEFORE INSERT OR UPDATE ON public.picks
FOR EACH ROW EXECUTE FUNCTION public.enforce_picks_deadline();

-- ============ 3) AUDITORÍA ADMIN ============
CREATE TABLE IF NOT EXISTS public.admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID,
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit TO authenticated;
GRANT ALL ON public.admin_audit TO service_role;
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit" ON public.admin_audit;
CREATE POLICY "Admins read audit" ON public.admin_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ 4) VERIFICACIÓN PÚBLICA DE COMPROBANTES ============
-- Código del comprobante = primeros 12 chars de sha256(participant_id || updated_at)
CREATE OR REPLACE FUNCTION public.comprobante_code(_pid uuid, _updated_at timestamptz)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT substring(encode(digest(_pid::text || extract(epoch from _updated_at)::text, 'sha256'), 'hex') from 1 for 12);
$$;

CREATE OR REPLACE FUNCTION public.get_comprobante_public(_code text)
RETURNS TABLE(
  participant_id uuid,
  nombre text,
  estado_pago text,
  updated_at timestamptz,
  puntos_total integer,
  codigo text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pa.id, pa.nombre, pa.estado_pago, pk.updated_at,
    COALESCE(pk.puntos_total, 0),
    public.comprobante_code(pa.id, pk.updated_at)
  FROM public.participants pa
  JOIN public.picks pk ON pk.participant_id = pa.id
  WHERE public.comprobante_code(pa.id, pk.updated_at) = _code
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_comprobante_public(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comprobante_code(uuid, timestamptz) TO anon, authenticated, service_role;

-- ============ 5) Habilitar extensión pgcrypto si no existe (para digest) ============
CREATE EXTENSION IF NOT EXISTS pgcrypto;
