import { createFileRoute } from "@tanstack/react-router";
import { RevanchaTab } from "@/components/admin/tabs";

export const Route = createFileRoute("/admin/revancha")({
  head: () => ({
    meta: [
      { title: "La Revancha · Admin · LA GILIPOLLA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RevanchaTab,
});
