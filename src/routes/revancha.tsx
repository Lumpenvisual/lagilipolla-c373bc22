import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout pathless para /revancha y /revancha/registro (mismo patrón que admin.tsx +
 * admin.index.tsx): TanStack Router trata "revancha.tsx" como el padre de cualquier
 * "revancha.*" — sin este Outlet, /revancha/registro nunca se renderizaría. Sin chrome
 * propio (a diferencia de AdminLayout, que sí agrega nav de pestañas) porque las dos
 * páginas hijas ya tienen su propio <main>.
 */
export const Route = createFileRoute("/revancha")({
  component: () => <Outlet />,
});
