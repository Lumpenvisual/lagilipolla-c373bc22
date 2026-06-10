import { createFileRoute } from "@tanstack/react-router";
import { EspecialesTab } from "@/components/admin/tabs";

export const Route = createFileRoute("/admin/especiales")({
  head: () => ({
    meta: [
      { title: "Especiales · Admin · LA GILIPOLLA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EspecialesTab,
});
