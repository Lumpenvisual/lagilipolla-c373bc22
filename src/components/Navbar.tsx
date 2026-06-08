import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Menu, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { user, isAdmin, participant } = useAuth();
  const approved = participant?.estado_pago === "aprobado";
  const linkCls =
    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary";
  return (
    <>
      <Link to="/" className={linkCls} onClick={onNavigate}>
        Inicio
      </Link>
      {user && approved && (
        <Link to="/planilla" className={linkCls} onClick={onNavigate}>
          Planilla
        </Link>
      )}
      <Link to="/leaderboard" className={linkCls} onClick={onNavigate}>
        Tabla
      </Link>
      <Link to="/reglas" className={linkCls} onClick={onNavigate}>
        Reglas
      </Link>
      {user && (
        <Link to="/dashboard" className={linkCls} onClick={onNavigate}>
          Mi cuenta
        </Link>
      )}
      {isAdmin && (
        <Link to="/admin" className={linkCls} onClick={onNavigate}>
          Admin
        </Link>
      )}
    </>
  );
}

export function Navbar() {
  const { user, participant, isAdmin, signOut } = useAuth();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    setOpen(false);
    router.navigate({ to: "/" });
  };

  const name = participant?.nombre ?? (isAdmin ? t("nav.organizador") : (user?.email ?? ""));
  const initial = (name || "?").charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-display text-2xl tracking-wide">
          <span className="bandera-stripe-h h-3 w-6 rounded-sm" aria-hidden />
          <span className="gold-gradient-text">LA GILIPOLLA 2026</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <NavLinks />
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {initial}
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="max-w-[160px] truncate text-sm text-foreground">{name}</span>
                  {isAdmin && (
                    <span className="text-[10px] uppercase tracking-wide text-gold">
                      {t("nav.organizador")}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                aria-label={t("nav.logout")}
              >
                <LogOut className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link to="/login">{t("nav.login")}</Link>
              </Button>
              <Button asChild variant="hero">
                <Link to="/registro">{t("nav.register")}</Link>
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("nav.menu")}>
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-border bg-card">
              <SheetTitle className="font-display text-xl">
                <span className="gold-gradient-text">⚽ POLLA 2026</span>
              </SheetTitle>
              <div className="mt-6 flex flex-col gap-1">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
              <div className="mt-6 border-t border-border pt-6">
                {user ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{name}</p>
                    <Button variant="secondary" className="w-full" onClick={handleLogout}>
                      <LogOut className="mr-2 size-4" /> {t("nav.logout")}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Button
                      asChild
                      variant="hero"
                      className="w-full"
                      onClick={() => setOpen(false)}
                    >
                      <Link to="/registro">{t("nav.register")}</Link>
                    </Button>
                    <Button
                      asChild
                      variant="secondary"
                      className="w-full"
                      onClick={() => setOpen(false)}
                    >
                      <Link to="/login">{t("nav.login")}</Link>
                    </Button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
