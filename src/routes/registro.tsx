import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RegistrationForm } from "@/components/RegistrationForm";
import { CompetitionSelector } from "@/components/CompetitionSelector";
import { useT, tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/registro")({
  head: () => ({
    meta: [
      { title: tStatic("selector.meta.title") },
      { name: "description", content: tStatic("selector.meta.desc") },
      { property: "og:title", content: tStatic("selector.meta.title") },
      { property: "og:description", content: tStatic("selector.meta.desc") },
      { property: "og:url", content: `${import.meta.env.VITE_APP_URL}/registro` },
    ],
    links: [{ rel: "canonical", href: `${import.meta.env.VITE_APP_URL}/registro` }],
  }),
  component: RegistroPage,
});

function RegistroPage() {
  const t = useT();
  // La elección entre las dos competencias es explícita y va primero — nadie llega al
  // formulario de la polla sin ver antes que existe La Revancha, ni al revés (ver tarea del
  // selector de inscripción). No es un paso ceremonial: es la corrección del hueco de
  // presentación que dejaban dos rutas separadas sin ningún punto de comparación.
  const [choseP, setChoseP] = useState(false);

  return (
    <main className={`mx-auto px-4 py-12 ${choseP ? "max-w-lg" : "max-w-3xl"}`}>
      <div className="mb-6 text-center">
        <Link to="/" className="font-display text-3xl tracking-wide sm:text-4xl">
          <span aria-hidden>⚽ </span>
          <span className="gold-gradient-text">POLLA 2026</span>
        </Link>
      </div>

      {choseP ? (
        <RegistrationForm />
      ) : (
        <>
          <h1 className="mb-6 text-center font-display text-2xl">{t("selector.heading")}</h1>
          <CompetitionSelector onChoosePolla={() => setChoseP(true)} />
        </>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("login.haveAccount")}{" "}
        <Link to="/login" className="text-primary hover:underline">
          {t("nav.login")}
        </Link>
      </p>
    </main>
  );
}
