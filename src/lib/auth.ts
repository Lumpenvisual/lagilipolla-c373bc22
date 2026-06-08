// Internal mapping for the alias + PIN access model.
// The alias is the user-facing identity; the PIN is a short secret.
// We map them deterministically onto the underlying email/password account
// system so registration only ever asks for an alias and a PIN.

export const ALIAS_RE = /^[a-zA-Z0-9 _.-]{2,24}$/;
export const PIN_RE = /^\d{4}$/;

/** Turn a display alias into a stable synthetic email address. */
export function aliasToEmail(alias: string): string {
  const slug = alias
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/(^\.|\.$)/g, "");
  return `${slug}@polla.local`;
}

/** Derive the underlying password from the PIN (meets min length rules). */
export function pinToPassword(pin: string): string {
  return `polla-pin-${pin}`;
}
