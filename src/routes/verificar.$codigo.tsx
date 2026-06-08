import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verifyComprobante } from "@/lib/reports.functions";

export const Route = createFileRoute("/verificar/$codigo")({
  head: () => ({ meta: [{ title: "Verificar comprobante · LA GILIPOLLA 2026" }] }),
  component: VerifyPage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-sm text-destructive">{error.message}</p>
    </main>
  ),
  notFoundComponent: () => <main className="p-16 text-center">No encontrado</main>,
});

function VerifyPage() {
  const { codigo } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["verificar", codigo],
    queryFn: () => verifyComprobante({ data: { code: codigo } }),
  });

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="bandera-stripe-h h-1 w-16 rounded-sm mx-auto" aria-hidden />
      <h1 className="mt-4 text-center font-display text-3xl">Verificación de comprobante</h1>
      <p className="mt-1 text-center text-xs text-muted-foreground">Código: {codigo}</p>

      {isLoading && <Loader2 className="mx-auto mt-8 size-6 animate-spin text-muted-foreground" />}

      {data && data.valid && (
        <Card className="mt-8 border-success/40 bg-success/5 p-8 text-center card-shadow">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <h2 className="mt-3 font-display text-2xl text-success">Comprobante válido</h2>
          <p className="mt-3 text-sm">Participante: <strong>{data.nombre}</strong></p>
          <p className="mt-1 text-xs text-muted-foreground">Estado de pago: {data.estado_pago}</p>
          <p className="mt-1 text-xs text-muted-foreground">Última actualización: {new Date(data.updated_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })} COT</p>
          <p className="mt-3 text-sm">Puntos: <span className="font-display text-xl text-gold">{data.puntos_total}</span></p>
        </Card>
      )}

      {data && !data.valid && (
        <Card className="mt-8 border-destructive/40 bg-destructive/5 p-8 text-center card-shadow">
          <XCircle className="mx-auto size-12 text-destructive" />
          <h2 className="mt-3 font-display text-2xl text-destructive">No válido</h2>
          <p className="mt-2 text-sm text-muted-foreground">El código no coincide con ningún comprobante actual. Esto puede ocurrir si la planilla fue modificada después de generar el PDF.</p>
        </Card>
      )}

      <div className="mt-6 text-center">
        <Button asChild variant="secondary"><Link to="/">Volver al inicio</Link></Button>
      </div>
    </main>
  );
}