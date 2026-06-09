## Alcance

Cuatro frentes en este orden. Todos son cambios frontend/SEO — no toco la base de datos ni reglas de negocio.

### 1. Partir `admin.tsx` en sub-rutas
Hoy es un monolito de 974 líneas. Lo convierto en layout + 4 hijos:

```text
src/routes/
  admin.tsx                  -> layout con tabs + <Outlet/> (guard de rol admin)
  admin.index.tsx            -> resumen (KPIs: participantes, aprobados, ingresos, recálculo)
  admin.participantes.tsx    -> aprobar/rechazar pagos, ver comprobantes
  admin.resultados.tsx       -> ingreso de resultados por grupo y partido
  admin.cronograma.tsx       -> generar/editar fixture, goleador/arquero
  admin.demo.tsx             -> seeding y herramientas de demo
```

Cada hijo importa solo lo que necesita → bundle del admin se parte automáticamente. La lógica actual se mueve **tal cual** a cada archivo, sin cambiar queries ni mutations.

### 2. SEO + `<html lang>` dinámico
- `head()` único por ruta pública (`index`, `reglas`, `cronograma`, `leaderboard`, `dashboard`, `planilla`, `registro`, `login`, `verificar.$codigo`) con `title`, `description`, `og:title`, `og:description`, `og:url` y `canonical` por hoja. Sin `og:image` salvo que existan imágenes reales.
- Rutas privadas (`admin*`, `dashboard`) reciben `robots: noindex`.
- `__root.tsx`: el `<html>` toma `lang` del A11yProvider (`lang === 'en' ? 'en' : 'es'`). Lo expongo vía `document.documentElement.lang` en un `useEffect` dentro del provider (compatible con SSR — el initial es `es`, hidrata al idioma elegido).
- JSON-LD `Organization` en `__root.tsx`, `FAQPage` en `reglas`.

### 3. Completar i18n
- Auditoría con `rg` para detectar strings literales en JSX/JSX-attrs (`>texto<`, `title=`, `aria-label=`, `placeholder=`) en `admin*`, `reglas.tsx`, `planilla.tsx`, `cronograma.tsx`, `leaderboard.tsx`, `dashboard.tsx`.
- Agrego claves faltantes a `translations.ts` (ES + EN) y reemplazo con `t()`.
- Toasts (`sonner`) también pasan por `t()`.

### 4. UX admin: tablas legibles + empty/loading states
- Componente compartido `<DataTable>` en `src/components/admin/DataTable.tsx` con: zebra (`odd:bg-muted/30`), `sticky top-0` en `thead`, `max-h` + scroll, hover row.
- `<EmptyState icon title description action?>` reutilizable.
- `<LoadingState>` con skeleton (shadcn `Skeleton`).
- Aplico estos tres en participantes, resultados y cronograma.
- Toast variants: éxito verde, error rojo, info azul (via `sonner` `richColors`).

## Detalles técnicos

- **Layout admin**: `admin.tsx` queda como `() => { useAuth + role check; return <AdminShell><Outlet/></AdminShell> }`. `AdminShell` renderiza nav lateral o tabs con `<Link activeProps>`.
- **Migración del código actual**: copio bloques completos de `admin.tsx` a cada hijo verbatim, sólo cambian imports. No reescribo lógica.
- **i18n lang attr**: en `A11yProvider`, `useEffect(() => { document.documentElement.lang = lang }, [lang])`. Para SSR-safe metadata futura, también lo expongo en root head() leyendo de localStorage no es posible en server → quedo con default `es` en SSR y actualización en cliente (aceptable, es lo estándar).
- **Bundling**: cada `admin.*.tsx` es route-split por TanStack Router automáticamente → admin pasa de ~974 líneas a ~150 por chunk.

## Fuera de alcance (lo dejo para después)

- Refactor de `reglas.tsx` a contenido data-driven.
- Lazy load de imágenes (no hay imágenes pesadas hoy).
- Debounce del trigger `picks_recalc_trigger` (DB, requiere migración).
- Mejorar `recalc_all_picks` O(n).

## Verificación

Al terminar: build limpio, navegación admin entre tabs funciona, toggle ES/EN actualiza `<html lang>`, ver source de `/reglas` muestra título único.
