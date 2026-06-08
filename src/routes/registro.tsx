import { createFileRoute, Link } from "@tanstack/react-router";
import { RegistrationForm } from "@/components/RegistrationForm";
import { useT, tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/registro")({
  head: () => ({
    meta: [
      { title: tStatic("reg.title") },
      { name: "description", content: tStatic("reg.subtitle") },
    ],
  }),
  component: RegistroPage,
});

function RegistroPage() {
  const t = useT();
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-6 text-center">
        <Link to="/" className="font-display text-3xl tracking-wide sm:text-4xl">
          <span aria-hidden>⚽ </span>
          <span className="gold-gradient-text">POLLA 2026</span>
        </Link>
      </div>

      <RegistrationForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("login.haveAccount")}{" "}
        <Link to="/login" className="text-primary hover:underline">
          {t("nav.login")}
        </Link>
      </p>
    </main>
  );
}
