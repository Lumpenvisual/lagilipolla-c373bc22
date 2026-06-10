import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { ClipboardList, FileSpreadsheet, ListPlus, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin · LA GILIPOLLA 2026" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

type AdminTab = {
  to:
    | "/admin"
    | "/admin/resultados"
    | "/admin/cronograma"
    | "/admin/especiales"
    | "/admin/reportes";
  label: string;
  icon: typeof Users;
  exact?: boolean;
};

const TABS: AdminTab[] = [
  { to: "/admin", label: "Pagos", icon: Users, exact: true },
  { to: "/admin/resultados", label: "Resultados", icon: ClipboardList },
  { to: "/admin/cronograma", label: "Cronograma", icon: ClipboardList },
  { to: "/admin/especiales", label: "Especiales", icon: ListPlus },
  { to: "/admin/reportes", label: "Reportes", icon: FileSpreadsheet },
];

function AdminLayout() {
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card className="border-destructive/40 bg-destructive/5 p-8 text-center card-shadow">
          <div className="text-4xl">🚫</div>
          <h1 className="mt-3 font-display text-3xl">403</h1>
          <p className="mt-2 text-sm text-muted-foreground">Solo el admin del bar.</p>
          <Button className="mt-6" onClick={() => router.navigate({ to: "/" })}>
            Volver al inicio
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <div className="bandera-stripe-h h-1 w-16 rounded-sm" aria-hidden />
      <h1 className="mt-3 font-display text-3xl sm:text-4xl">🛠️ Admin · LA GILIPOLLA</h1>

      <nav
        aria-label="Secciones del panel"
        className="mt-6 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4"
      >
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: t.exact ?? false }}
            activeProps={{
              className:
                "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors sm:px-4 border-gold bg-gold/15 text-gold",
            }}
            inactiveProps={{
              className:
                "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors sm:px-4 border-border bg-card text-muted-foreground hover:text-foreground",
            }}
          >
            <t.icon className="size-4" /> {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        <Outlet />
      </div>
    </main>
  );
}
