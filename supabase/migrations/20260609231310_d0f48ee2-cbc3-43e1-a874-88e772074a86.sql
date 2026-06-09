UPDATE public.tournament_state
SET extra_matches = (
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              extra_matches::text,
              'Winner Match ([0-9]+)', 'Ganador Partido \1', 'g'
            ),
            'Loser Match ([0-9]+)', 'Perdedor Partido \1', 'g'
          ),
          'Runner-up ', 'Segundo ', 'g'
        ),
        'Best 3rd', 'Mejor 3°', 'g'
      ),
      'Winner ', 'Ganador ', 'g'
    ),
    'Play-?off', 'Repechaje', 'g'
  )
)::jsonb;