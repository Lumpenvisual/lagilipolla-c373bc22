# Reportes, Backup y Comprobante PDF Profesional

Extiende el plan anterior con un comprobante PDF estilo "boleta oficial" para usuarios, hardening de seguridad, eliminación de deuda técnica y validación end-to-end.

## 1. Comprobante PDF profesional para usuarios (`/dashboard`)

Inspirado en boletas de pollas serias (Polla Gol, FIFA Fantasy, Yahoo Pick'em, ESPN Tournament Challenge) y comprobantes de apuestas regulados (Sportium, Codere):

**Estructura del PDF (1–2 páginas A4):**
- **Membrete superior** con tricolor colombiano (banda amarilla / azul / roja), logo "LA GILIPOLLA 2026", subtítulo "Bar El Guanábano · Mundial FIFA 2026".
- **Bloque del participante**: nombre, email, fecha y hora de emisión (zona COT), número de planilla, **código de comprobante** (hash corto SHA-256 truncado de `participant_id + updated_at`), **QR** que enlaza a una URL pública de verificación `/verificar/{codigo}` (read-only).
- **Bloque "Pronósticos"**:
  - Tabla de 12 grupos (A–L): clasificados 1° y 2° con banderas (emoji unicode, sin assets externos).
  - Tabla de 6 partidos del Grupo K (Colombia destacada).
  - Selecciones especiales: goleador y arquero.
- **Bloque "Estado del torneo" (si ya hay resultados)**: comparación pick vs oficial + puntos.
- **Pie de página** con: monto pagado ($100.000 COP), reglas resumidas, disclaimer ("Este documento es un comprobante informativo. La planilla oficial es la registrada en el sistema con marca de tiempo {updated_at}."), número de página.

**Botón en `/dashboard`:** "📄 Descargar comprobante (PDF)" — un solo clic, descarga directa, sin pasos intermedios.

**Generación:**
- Librería: **`pdfkit`** (pure-JS, edge-compatible) + **`qrcode`** para el QR. Descartado `puppeteer`/`playwright` (incompatibles con Workers) y `pdfmake` (más pesado).
- Server function `generateComprobantePDF` con `requireSupabaseAuth`, devuelve `{ filename, base64 }`. Cliente convierte a Blob y dispara descarga.
- Fuentes: Helvetica embebida en pdfkit (sin dependencia de red).

**Ruta pública de verificación** (`src/routes/verificar.$codigo.tsx`):
- Server route lee `participants + picks` por código (sin exponer email), muestra: nombre, fecha de emisión, hash, "✓ Comprobante válido" o "✗ Modificado posteriormente".
- Permite a otros usuarios validar la autenticidad del comprobante.

## 2. Reportes Excel (admin + usuario) — del plan anterior

Mismos botones que el plan previo:
- Usuario: planilla en Excel (complementa al PDF).
- Admin pestaña "Reportes": leaderboard, participantes/pagos, todas las planillas, estado del torneo.
- Librería: `exceljs`.

## 3. Backup y restauración (admin)

- Botón "Descargar backup completo" → `.xlsx` con una hoja por tabla.
- Botón "Restaurar desde backup" → upload + doble confirmación + auto-backup previo antes de aplicar.
- Transacción SQL con rollback ante cualquier error.

## 4. Hardening de seguridad

**A. Lock server-side del deadline** (riesgo identificado en la revisión técnica)
- Nueva columna `tournament_state.picks_locked_at TIMESTAMPTZ` (default `2026-06-11 15:00:00+00`, equivalente a 10:00 COT).
- Trigger `BEFORE INSERT OR UPDATE ON public.picks` que rechaza si `now() >= picks_locked_at` y el usuario no es admin.
- Botón admin "Cerrar/Reabrir planillas" en pestaña Resultados.

**B. Rate-limiting básico de generación**
- Tabla `report_audit (user_id, kind, created_at)` con índice por `(user_id, created_at)`.
- ServerFn de PDF/Excel rechaza si hay >10 descargas del mismo usuario en los últimos 60 s. Previene abuso (los PDFs consumen CPU del Worker).

**C. Auditoría de cambios admin**
- Tabla `admin_audit (admin_id, action, payload JSONB, created_at)`.
- Trigger en `tournament_state`, `picks` (cuando lo modifica admin), `participants.estado_pago` que registra el cambio.
- Vista en `/admin` → pestaña "Auditoría" para ver historial.

**D. RLS de la nueva tabla `report_audit`**
- Solo `service_role` puede leer/escribir. Usuario nunca la ve.

**E. CAPTCHA en signup**
- Activar **Cloudflare Turnstile** en `src/routes/registro.tsx`. Componente oficial, gratis, sin tracking. Validación server-side antes de crear el participante.

**F. Validación reforzada de inputs**
- Zod schemas en todos los serverFn que reciben datos del cliente (picks, admin updates, restore).
- Length limits, regex de email, validación de UUIDs.

## 5. Limpieza de deuda técnica

Detectada en el árbol del proyecto (vestigios del modelo previo "concursos"):
- **Eliminar** componentes huérfanos: `src/components/ConcursoGrid.tsx`, `ModalidadCard.tsx`, `ModalidadRules.tsx`, `PredictionCard.tsx`, `ScoringExample.tsx`, `LanguageSwitcher.tsx`.
- **Eliminar** hooks/libs: `src/hooks/useConcursos.ts`, `src/hooks/useData.ts`, `src/lib/concursos.ts`, `src/lib/autopredict.functions.ts`, `src/lib/matchStatus.ts`, `src/lib/prizes.ts`, `src/lib/flags.ts` (reemplazado por emoji).
- **Eliminar** tests obsoletos: `__tests__/concursos.test.ts`, `prizes.test.ts`, `matchStatus.test.ts`.
- **Eliminar** funciones SQL obsoletas vía migración: `seed_demo_data`, `reset_demo_data`, `selftest_concursos`, `generate_concursos`, `get_concursos_overview`, `get_concurso_leaderboard`, `get_concurso_matches`, `get_participant_predictions`, `get_leaderboard`, `calc_points`.
- **Eliminar** tablas obsoletas: `concursos`, `inscripciones`, `matches`, `predictions`, `demo_seed` (después de confirmación; backup previo automático).
- **Limpiar** metadata SEO en `__root.tsx`: textos repetidos ("Polla Mundialista" duplicado) y referencias a "$20 CAD" que ya no aplican.
- **Eliminar** `LanguageProvider` de `__root.tsx` si no se usa (la app es solo español).

## 6. Validación end-to-end y usabilidad

**Pruebas E2E manuales (vía session replay + invoke-server-function):**
1. Registro nuevo → login → completar planilla → guardar → descargar PDF → descargar Excel.
2. Verificar QR del PDF abriendo `/verificar/{codigo}`.
3. Admin: aprobar pago → ver participante en leaderboard → descargar todos los reportes → generar backup → simular restore.
4. Intentar guardar pick después del deadline → debe fallar con mensaje claro.
5. Intentar descargar 15 PDFs seguidos → debe rate-limitar a partir del #11.
6. Logout → intentar acceder a `/verificar/{codigo}` sin auth → debe funcionar (público).
7. Logout → intentar acceder a `/dashboard` → debe redirigir a `/login`.

**Mejoras de usabilidad:**
- Skeleton loaders mientras carga el PDF (puede tardar 1–2 s).
- Toast con progreso: "Generando comprobante…" → "✓ Listo, descargando…".
- Botón de PDF prominente, con icono, en la parte superior del dashboard.
- En móvil: PDF se abre en nueva pestaña (no descarga directa, mejor UX iOS).
- Mensaje claro si el participante no tiene pago aprobado: "Completa tu pago para descargar el comprobante".
- Vista previa del PDF en modal antes de descargar (opcional, con `<iframe>` y blob URL).

## Detalles técnicos

**Archivos nuevos**
- `src/lib/reports.functions.ts` — serverFns Excel + PDF + backup + restore.
- `src/lib/reports.server.ts` — builders pdfkit + exceljs.
- `src/lib/audit.functions.ts` — lectura de auditoría admin.
- `src/components/DownloadButton.tsx` — botón reutilizable.
- `src/components/PdfPreviewModal.tsx` — preview opcional.
- `src/routes/verificar.$codigo.tsx` — página pública de verificación.
- Edición `src/routes/dashboard.tsx`, `src/routes/admin.tsx`, `src/routes/registro.tsx`, `src/routes/__root.tsx`.

**Dependencias a instalar**
- `exceljs`, `pdfkit`, `qrcode` (y `@types/pdfkit`, `@types/qrcode`).
- `@marsidev/react-turnstile` para CAPTCHA.

**Migraciones SQL**
1. `add_picks_lock` — columna + trigger de deadline.
2. `audit_tables` — `report_audit`, `admin_audit` + triggers + RLS.
3. `cleanup_legacy` — drop funciones/tablas obsoletas (DESTRUCTIVA, requiere confirmación del usuario; precedida de backup automático).

**Naming y formato**
- PDF: `gilipolla-comprobante-{nombre-slug}-{YYYYMMDD-HHmm}.pdf`
- Tamaño objetivo del PDF: <300 KB.
- Tiempo objetivo de generación: <2 s en P95.

## Orden de implementación (fases)

1. **Fase A — Limpieza de deuda técnica** (drops SQL + delete archivos). Reduce superficie de bugs antes de añadir features.
2. **Fase B — Reportes Excel** (usuario + admin).
3. **Fase C — Comprobante PDF + ruta de verificación**.
4. **Fase D — Hardening de seguridad** (lock deadline, rate-limit, auditoría, Turnstile).
5. **Fase E — Backup y restore** (con auto-backup previo al restore).
6. **Fase F — Validación E2E** y ajustes finales de usabilidad.

## Fuera de alcance
- Backup automático programado (requiere pg_cron + bucket dedicado, lo agrego después si se necesita).
- Firma digital criptográfica del PDF (PAdES) — el hash + QR + página de verificación cubren el caso de uso real.
- Multi-idioma (la app es solo español).
