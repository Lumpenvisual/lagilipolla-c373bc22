
-- 1) Admin user genérico + 6 usuarios demo
DO $$
DECLARE
  v_admin_id uuid;
  v_demo_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_names text[] := ARRAY['Sofía Restrepo','Mateo Gómez','Valentina Ruiz','Andrés Cárdenas','Camila Ortiz','Diego Marín'];
  v_email text;
  i int;
BEGIN
  -- ADMIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@gilipolla.co') THEN
    v_admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated',
      'admin@gilipolla.co', crypt('Guanabano2026!', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nombre":"Admin Guanábano"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_admin_id,
      jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@gilipolla.co'),
      'email', v_admin_id::text, now(), now(), now());
    INSERT INTO public.user_roles (user_id, role) VALUES (v_admin_id, 'admin')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.participants (user_id, nombre, email, estado_pago)
      VALUES (v_admin_id, 'Admin Guanábano', 'admin@gilipolla.co', 'aprobado')
      ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- 6 usuarios demo
  FOR i IN 1..6 LOOP
    v_email := 'demo' || i || '@gilipolla.co';
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      v_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        v_email, crypt('Demo2026!', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('nombre', v_names[i]),
        now(), now(), '', '', '', ''
      );
      INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      VALUES (gen_random_uuid(), v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_email),
        'email', v_id::text, now(), now(), now());
      INSERT INTO public.participants (user_id, nombre, email, estado_pago)
        VALUES (v_id, '[DEMO] ' || v_names[i], v_email, 'aprobado');
    END IF;
  END LOOP;
END $$;

-- 2) Función para sembrar picks demo (planillas inventadas para los [DEMO])
CREATE OR REPLACE FUNCTION public.seed_polla_demo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  p record;
  k text;
  gobj jsonb;
  team_ids text[];
  pick_groups jsonb;
  pick_matches jsonb;
  match_o jsonb;
  gols text[]; arqs text[];
  n int := 0;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  IF s IS NULL THEN RAISE EXCEPTION 'tournament_state vacío'; END IF;

  SELECT array_agg(id) INTO gols FROM jsonb_to_recordset(s.goleadores) AS x(id text);
  SELECT array_agg(id) INTO arqs FROM jsonb_to_recordset(s.arqueros)  AS x(id text);

  FOR p IN SELECT id FROM public.participants WHERE nombre LIKE '[DEMO]%' AND estado_pago = 'aprobado' LOOP
    pick_groups := '{}'::jsonb;
    FOR k IN SELECT jsonb_object_keys(s.groups) LOOP
      gobj := s.groups->k;
      SELECT array_agg(t->>'id') INTO team_ids FROM jsonb_array_elements(gobj->'teams') t;
      pick_groups := pick_groups || jsonb_build_object(k, jsonb_build_object(
        'pos1', team_ids[1 + floor(random()*array_length(team_ids,1))::int],
        'pos2', team_ids[1 + floor(random()*array_length(team_ids,1))::int]
      ));
    END LOOP;

    pick_matches := '{}'::jsonb;
    FOR match_o IN SELECT jsonb_array_elements(s.group_k_matches) LOOP
      pick_matches := pick_matches || jsonb_build_object(match_o->>'id', jsonb_build_object(
        'gh', floor(random()*4)::int, 'ga', floor(random()*4)::int
      ));
    END LOOP;

    INSERT INTO public.picks (participant_id, groups, group_k_matches, goleador_id, arquero_id)
    VALUES (
      p.id, pick_groups, pick_matches,
      CASE WHEN gols IS NOT NULL AND array_length(gols,1) > 0 THEN gols[1 + floor(random()*array_length(gols,1))::int] ELSE NULL END,
      CASE WHEN arqs IS NOT NULL AND array_length(arqs,1) > 0 THEN arqs[1 + floor(random()*array_length(arqs,1))::int] ELSE NULL END
    )
    ON CONFLICT (participant_id) DO UPDATE SET
      groups = EXCLUDED.groups,
      group_k_matches = EXCLUDED.group_k_matches,
      goleador_id = EXCLUDED.goleador_id,
      arquero_id = EXCLUDED.arquero_id;
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('picks_demo', n);
END $$;

-- 3) Función para borrar TODA la data demo (participants [DEMO] + sus picks + sus auth.users)
CREATE OR REPLACE FUNCTION public.reset_polla_demo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_users int := 0; v_parts int := 0;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  -- Borrar usuarios auth con email demoN@gilipolla.co cascade → elimina participants + picks
  WITH d AS (DELETE FROM auth.users WHERE email LIKE 'demo%@gilipolla.co' RETURNING 1)
  SELECT count(*) INTO v_users FROM d;
  -- Por si quedaron participants [DEMO] sin user_id
  WITH d AS (DELETE FROM public.participants WHERE nombre LIKE '[DEMO]%' RETURNING 1)
  SELECT count(*) INTO v_parts FROM d;
  RETURN jsonb_build_object('auth_users', v_users, 'participants_huérfanos', v_parts);
END $$;

GRANT EXECUTE ON FUNCTION public.seed_polla_demo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_polla_demo() TO authenticated;
