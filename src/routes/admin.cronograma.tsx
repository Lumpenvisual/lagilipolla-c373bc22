import { createFileRoute } from "@tanstack/react-router";
import { CronogramaTab } from "@/components/admin/tabs";

export const Route = createFileRoute("/admin/cronograma")({
  head: () => ({
    meta: [
      { title: "Cronograma · Admin · LA GILIPOLLA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CronogramaTab,
});
