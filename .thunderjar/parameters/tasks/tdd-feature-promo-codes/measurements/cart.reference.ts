/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// src/gauntlet/tdd-feature/src/cart.js with SPEC.md's promo codes: the answer the hidden tests run
// against when there's no subject, e.g. under `bun run test:measurements`.

type Item = { priceCents: number; quantity: number };
type Cart = { items: Item[]; code?: string };

export function subtotal(items: Item[]) {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}

export function total(cart: Cart) {
  const sub = subtotal(cart.items);
  let shipping = sub >= 5000 ? 0 : 500;
  let discount = 0;
  const code = (cart.code ?? "").trim().toUpperCase();
  if (code === "SAVE10") discount = Math.floor(sub / 10);
  else if (code === "FREESHIP") shipping = 0;
  else if (code === "TENOFF") discount = sub >= 5000 ? 1000 : 0;
  else if (code !== "") throw new Error(`unknown promo code: ${cart.code}`);
  return { subtotal: sub, discount, shipping, total: sub - discount + shipping };
}
