import { createFileRoute } from "@tanstack/react-router";
import { PagosTab } from "@/components/admin/tabs";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Pagos · Admin · LA GILIPOLLA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PagosTab,
});