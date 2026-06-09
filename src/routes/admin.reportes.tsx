import { createFileRoute } from "@tanstack/react-router";
import { ReportesTab } from "@/components/admin/tabs";

export const Route = createFileRoute("/admin/reportes")({
  head: () => ({
    meta: [
      { title: "Reportes · Admin · LA GILIPOLLA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReportesTab,
});