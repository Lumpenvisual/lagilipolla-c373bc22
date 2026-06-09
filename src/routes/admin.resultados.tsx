import { createFileRoute } from "@tanstack/react-router";
import { ResultadosTab } from "@/components/admin/tabs";

export const Route = createFileRoute("/admin/resultados")({
  head: () => ({
    meta: [
      { title: "Resultados · Admin · LA GILIPOLLA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResultadosTab,
});