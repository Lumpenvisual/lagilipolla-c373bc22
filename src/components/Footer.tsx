import { useT } from "@/lib/i18n";

/* Pie global con los créditos del desarrollador. Se monta una vez en __root. */
export function Footer() {
  const t = useT();
  return (
    <footer className="mt-16 border-t border-border py-6 text-center text-xs text-muted-foreground">
      <div className="bandera-stripe-h mx-auto mb-3 h-1 w-12 rounded-sm" aria-hidden />
      <p>
        {t("footer.devBy")} <span className="font-semibold text-foreground">Hackidevs</span>
        {" · "}
        <a href="tel:+573234374200" className="hover:text-gold">
          +57 323 437 42 00
        </a>
      </p>
    </footer>
  );
}
