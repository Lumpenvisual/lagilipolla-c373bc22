import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider, tStatic } from "@/lib/i18n";
import { Navbar } from "@/components/Navbar";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{tStatic("err.404.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{tStatic("err.404.body")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {tStatic("err.404.home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {tStatic("err.boundary.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{tStatic("err.boundary.body")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {tStatic("err.boundary.retry")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {tStatic("err.boundary.home")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Polla Mundial FIFA 2026 ⚽" },
      {
        name: "description",
        content:
          "Polla de pronósticos del Mundial 2026: 72 partidos de fase de grupos, $20 CAD. Pronostica, suma puntos y gana hasta el 60% del pozo.",
      },
      { name: "author", content: "Polla Mundial 2026" },
      { property: "og:title", content: "Polla Mundial FIFA 2026 ⚽" },
      {
        property: "og:description",
        content: "72 partidos · Fase de grupos · $20 CAD. Pronostica y compite en tiempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Polla Mundial FIFA 2026 ⚽" },
      { name: "description", content: "A simple application for managing event participants and their payment status." },
      { property: "og:description", content: "A simple application for managing event participants and their payment status." },
      { name: "twitter:description", content: "A simple application for managing event participants and their payment status." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e502d88b-828b-465b-9844-de2f5ec4373a/id-preview-a8e26722--4ac79b16-27fc-4e44-9750-cb3605b93675.lovable.app-1780590874485.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e502d88b-828b-465b-9844-de2f5ec4373a/id-preview-a8e26722--4ac79b16-27fc-4e44-9750-cb3605b93675.lovable.app-1780590874485.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Bebas+Neue&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <Navbar />
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
