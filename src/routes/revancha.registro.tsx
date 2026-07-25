import { createFileRoute, Link } from "@tanstack/react-router";
import { RegistrationForm } from "@/components/RegistrationForm";
import { useT, tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/revancha/registro")({
  head: () => ({
    meta: [
      { title: tStatic("reg.revancha.title") },
      { name: "description", content: tStatic("reg.revancha.subtitle") },
      { property: "og:title", content: tStatic("reg.revancha.title") },
      { property: "og:description", content: tStatic("reg.revancha.subtitle") },
      { property: "og:url", content: `${import.meta.env.VITE_APP_URL}/revancha/registro` },
    ],
    links: [{ rel: "canonical", href: `${import.meta.env.VITE_APP_URL}/revancha/registro` }],
  }),
  component: RevanchaRegistroPage,
});

function RevanchaRegistroPage() {
  const t = useT();
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-6 text-center">
        <Link to="/" className="font-display text-3xl tracking-wide sm:text-4xl">
          <span aria-hidden>🔄 </span>
          <span className="gold-gradient-text">LA REVANCHA</span>
        </Link>
      </div>

      <RegistrationForm mode="revancha" />

      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t("selector.wrongForm")}{" "}
        <Link to="/registro" className="text-primary hover:underline">
          {t("selector.polla.title")}
        </Link>
      </p>

      <p className="mt-2 text-center text-sm text-muted-foreground">
        {t("login.haveAccount")}{" "}
        <Link to="/login" className="text-primary hover:underline">
          {t("nav.login")}
        </Link>
      </p>
    </main>
  );
}
