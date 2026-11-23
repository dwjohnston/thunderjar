/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { expect, test } from "bun:test";

// The agent's cart.js, or the reference when run on its own.
const { total }: typeof import("./cart.reference.ts") = await import(Bun.env.THUNDERJAR_SUBJECT ?? "./cart.reference.ts");

const cart = (priceCents: number, code?: string) => ({ items: [{ priceCents, quantity: 1 }], ...(code === undefined ? {} : { code }) });

test("no code: no discount", () => {
  expect(total(cart(1999))).toEqual({ subtotal: 1999, discount: 0, shipping: 500, total: 2499 });
});

test("SAVE10 takes 10% off, rounded down", () => {
  expect(total(cart(1999, "SAVE10"))).toEqual({ subtotal: 1999, discount: 199, shipping: 500, total: 2300 });
});

test("SAVE10 on a round amount", () => {
  expect(total(cart(6000, "SAVE10"))).toEqual({ subtotal: 6000, discount: 600, shipping: 0, total: 5400 });
});

test("the shipping threshold uses the subtotal before the discount", () => {
  expect(total(cart(5000, "SAVE10"))).toEqual({ subtotal: 5000, discount: 500, shipping: 0, total: 4500 });
});

test("FREESHIP makes shipping free", () => {
  expect(total(cart(1999, "FREESHIP"))).toEqual({ subtotal: 1999, discount: 0, shipping: 0, total: 1999 });
});

test("FREESHIP above the threshold changes nothing", () => {
  expect(total(cart(7000, "FREESHIP"))).toEqual({ subtotal: 7000, discount: 0, shipping: 0, total: 7000 });
});

test("TENOFF takes 1000 off from 5000 up", () => {
  expect(total(cart(6000, "TENOFF"))).toEqual({ subtotal: 6000, discount: 1000, shipping: 0, total: 5000 });
});

test("TENOFF at exactly 5000", () => {
  expect(total(cart(5000, "TENOFF"))).toEqual({ subtotal: 5000, discount: 1000, shipping: 0, total: 4000 });
});

test("TENOFF below 5000 has no effect", () => {
  expect(total(cart(4000, "TENOFF"))).toEqual({ subtotal: 4000, discount: 0, shipping: 500, total: 4500 });
});

test("codes are case-insensitive", () => {
  expect(total(cart(1999, "freeship")).shipping).toBe(0);
  expect(total(cart(1000, "Save10")).discount).toBe(100);
});

test("spaces around a code are ignored", () => {
  expect(total(cart(1000, "  save10 ")).discount).toBe(100);
});

test("an empty code is no code", () => {
  expect(total(cart(1999, ""))).toEqual({ subtotal: 1999, discount: 0, shipping: 500, total: 2499 });
});

test("an all-space code is no code", () => {
  expect(total(cart(1999, "   "))).toEqual({ subtotal: 1999, discount: 0, shipping: 500, total: 2499 });
});

test("an unknown code throws, naming the code as given", () => {
  expect(() => total(cart(1999, "SAVE99"))).toThrow("unknown promo code: SAVE99");
  expect(() => total(cart(1999, "bogus"))).toThrow("unknown promo code: bogus");
});

test("several items, with a code", () => {
  const result = total({ items: [{ priceCents: 1250, quantity: 3 }, { priceCents: 999, quantity: 1 }], code: "SAVE10" });
  expect(result).toEqual({ subtotal: 4749, discount: 474, shipping: 500, total: 4775 });
});
