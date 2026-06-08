
CREATE POLICY "comprobantes_upload_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprobantes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "comprobantes_read_own_or_admin" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin'))
  );

CREATE POLICY "comprobantes_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
