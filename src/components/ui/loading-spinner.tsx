import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadingSpinnerProps {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const SIZE = { sm: "size-4", md: "size-6", lg: "size-8" } as const;

export function LoadingSpinner({ label, className, size = "md" }: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center justify-center gap-2 py-8 text-muted-foreground", className)}
    >
      <Loader2 className={cn(SIZE[size], "animate-spin")} aria-hidden />
      {label && <span className="text-sm">{label}</span>}
      <span className="sr-only">{label ?? "Cargando"}</span>
    </div>
  );
}