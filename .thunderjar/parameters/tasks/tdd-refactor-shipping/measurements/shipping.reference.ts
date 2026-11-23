/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// What src/gauntlet/tdd-refactor/src/shipping.js does at the start, refactored: the answer the
// hidden tests run against when there's no subject, e.g. under `bun run test:measurements`.

type Item = { weightGrams: number; priceCents: number; quantity: number };
type Order = { carrier: string; zone: string; express?: boolean; insured?: boolean; items: Item[] };

// Up to 500 g, up to 2000 g, then per started kilo over 2000 g.
const RATES: Record<string, Record<string, [number, number, number]>> = {
  post: { domestic: [495, 895, 250], international: [1495, 2495, 800] },
  courier: { domestic: [995, 1295, 300], international: [2995, 3995, 1000] },
};
const EXPRESS: Record<string, number> = { post: 1.5, courier: 1.25 };

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const sum = (items: Item[], of: (item: Item) => number) => items.reduce((total, item) => total + of(item) * item.quantity, 0);

export function quote(order: Order) {
  const carrier = RATES[order.carrier];
  if (!carrier) throw new Error(`unknown carrier: ${order.carrier}`);
  const rate = carrier[order.zone];
  if (!rate) throw new Error(`unknown zone: ${order.zone}`);
  const grams = sum(order.items, (item) => item.weightGrams);
  const [light, medium, perKilo] = rate;
  let cents = grams <= 500 ? light : grams <= 2000 ? medium : medium + Math.ceil((grams - 2000) / 1000) * perKilo;
  if (order.express) cents = Math.round(cents * EXPRESS[order.carrier]!);
  if (order.insured) cents += Math.max(150, Math.round(sum(order.items, (item) => item.priceCents) * 0.02));
  return { cents, label: dollars(cents) };
}

export function describe(order: Order) {
  const options = [order.express && "express", order.insured && "insured"].filter(Boolean);
  return [`${order.carrier} to ${order.zone}`, ...options].join(", ") + `: ${dollars(quote(order).cents)}`;
}

export function receiptLine(order: Order, paidCents: number) {
  const { cents } = quote(order);
  const owed = cents - paidCents;
  const rest = owed > 0 ? `${dollars(owed)} due` : owed < 0 ? `${dollars(-owed)} refunded` : "paid";
  return `Shipping ${dollars(cents)}, ${rest}`;
}
