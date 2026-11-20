/** Round fractional cents to whole cents, half up. See SPEC.md. */
export function roundCents(x) {
  return Math.floor(x + 0.5);
}

// TODO: discount(cents, percent) — see SPEC.md
