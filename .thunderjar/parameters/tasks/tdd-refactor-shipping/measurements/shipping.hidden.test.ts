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

// The agent's shipping.js, or the reference when run on its own.
const { quote, describe, receiptLine }: typeof import("./shipping.reference.ts") = await import(
  Bun.env.THUNDERJAR_SUBJECT ?? "./shipping.reference.ts"
);

const item = (weightGrams: number, priceCents = 1000, quantity = 1) => ({ weightGrams, priceCents, quantity });
const order = (carrier: string, zone: string, grams: number, extra: { express?: boolean; insured?: boolean } = {}) => ({
  carrier,
  zone,
  items: [item(grams)],
  ...extra,
});

// Each carrier and zone, at each weight boundary: [carrier, zone, grams, cents].
const cases: [string, string, number, number][] = [
  ["post", "domestic", 0, 495],
  ["post", "domestic", 500, 495],
  ["post", "domestic", 501, 895],
  ["post", "domestic", 2000, 895],
  ["post", "domestic", 2001, 1145],
  ["post", "domestic", 5500, 1895],
  ["post", "international", 500, 1495],
  ["post", "international", 2000, 2495],
  ["post", "international", 3001, 4095],
  ["courier", "domestic", 500, 995],
  ["courier", "domestic", 1999, 1295],
  ["courier", "domestic", 4000, 1895],
  ["courier", "international", 1, 2995],
  ["courier", "international", 2000, 3995],
  ["courier", "international", 2500, 4995],
];
for (const [carrier, zone, grams, cents] of cases) {
  test(`${carrier} ${zone} ${grams} g is ${cents}`, () => expect(quote(order(carrier, zone, grams)).cents).toBe(cents));
}

test("weight sums each item times its quantity", () => {
  expect(quote({ carrier: "post", zone: "domestic", items: [item(300, 0, 2), item(100, 0, 3)] }).cents).toBe(895);
});

test("express courier is a quarter as much again, rounded", () => {
  expect(quote(order("courier", "international", 2500, { express: true })).cents).toBe(6244);
});

test("express post rounds half up", () => {
  expect(quote(order("post", "international", 100, { express: true })).cents).toBe(2243);
});

test("insurance has a minimum premium of 150", () => {
  expect(quote(order("post", "domestic", 100, { insured: true })).cents).toBe(645);
});

test("insurance is added after express", () => {
  const o = { carrier: "courier", zone: "domestic", express: true, insured: true, items: [item(100, 10000, 1)] };
  expect(quote(o).cents).toBe(1244 + 200);
});

test("an unknown zone is an error", () => {
  expect(() => quote(order("post", "moon", 100))).toThrow("unknown zone: moon");
});

test("an unknown courier zone is an error", () => {
  expect(() => quote(order("courier", "moon", 100))).toThrow("unknown zone: moon");
});

test("an unknown carrier is an error", () => {
  expect(() => quote(order("drone", "domestic", 100))).toThrow("unknown carrier: drone");
});

test("the label has two decimal places", () => {
  expect(quote(order("courier", "international", 2500)).label).toBe("$49.95");
});

test("describe with no options", () => {
  expect(describe(order("post", "international", 100))).toBe("post to international: $14.95");
});

test("describe with both options", () => {
  expect(describe(order("post", "domestic", 100, { express: true, insured: true }))).toBe("post to domestic, express, insured: $8.93");
});

test("receiptLine when paid exactly", () => {
  expect(receiptLine(order("post", "domestic", 100), 495)).toBe("Shipping $4.95, paid");
});

test("receiptLine with a large amount due", () => {
  expect(receiptLine(order("courier", "international", 2500), 0)).toBe("Shipping $49.95, $49.95 due");
});
