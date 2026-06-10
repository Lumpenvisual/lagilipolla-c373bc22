import { createFileRoute } from "@tanstack/react-router";
import { ListasTab } from "@/components/admin/tabs";

export const Route = createFileRoute("/admin/listas")({
  head: () => ({
    meta: [
      { title: "Listas · Admin · LA GILIPOLLA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ListasTab,
});
