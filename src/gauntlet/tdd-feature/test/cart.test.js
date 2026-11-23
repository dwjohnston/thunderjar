import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subtotal, total } from '../src/cart.js';

const mug = { priceCents: 1200, quantity: 2 };
const lamp = { priceCents: 4500, quantity: 1 };

test('subtotal adds up price times quantity', () => {
  assert.equal(subtotal([mug, lamp]), 6900);
});

test('subtotal of an empty cart is 0', () => {
  assert.equal(subtotal([]), 0);
});

test('shipping is charged below the free shipping threshold', () => {
  const result = total({ items: [mug] });
  assert.equal(result.shipping, 500);
  assert.equal(result.total, 2900);
});

test('shipping is free from the threshold up', () => {
  const result = total({ items: [mug, lamp] });
  assert.equal(result.shipping, 0);
  assert.equal(result.total, 6900);
});
