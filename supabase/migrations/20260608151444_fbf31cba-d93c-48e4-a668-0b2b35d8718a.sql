DELETE FROM public.predictions WHERE participant_id IN (SELECT id FROM public.participants WHERE nombre = 'qa_e2e_check');
DELETE FROM public.inscripciones WHERE participant_id IN (SELECT id FROM public.participants WHERE nombre = 'qa_e2e_check');
DELETE FROM public.participants WHERE nombre = 'qa_e2e_check';
DELETE FROM auth.users WHERE email = 'qa.e2e.check@polla.local';