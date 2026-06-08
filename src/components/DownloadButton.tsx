import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Download } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

type FnResult = { filename: string; base64: string; mime: string };

export function DownloadButton({
  fn,
  label,
  variant = "secondary",
  size = "default",
  icon,
  className,
}: {
  fn: (...args: any[]) => Promise<FnResult>;
  label: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  icon?: React.ReactNode;
  className?: string;
}) {
  const run = useServerFn(fn as any);
  const [busy, setBusy] = useState(false);

  const click = async () => {
    setBusy(true);
    const tid = toast.loading("Generando archivo…");
    try {
      const out = (await run()) as FnResult;
      const bin = atob(out.base64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const blob = new Blob([u8], { type: out.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = out.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Descargado", { id: tid });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al generar", { id: tid });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={click} disabled={busy} className={className}>
      {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : icon ?? <Download className="mr-2 size-4" />}
      {label}
    </Button>
  );
}