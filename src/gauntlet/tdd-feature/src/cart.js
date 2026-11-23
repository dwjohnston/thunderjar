// The cart's totals. All amounts are in whole cents. See SPEC.md.

const FREE_SHIPPING_FROM = 5000;
const SHIPPING = 500;

export function subtotal(items) {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}

export function total(cart) {
  const sub = subtotal(cart.items);
  const shipping = sub >= FREE_SHIPPING_FROM ? 0 : SHIPPING;
  return { subtotal: sub, shipping, total: sub + shipping };
}
