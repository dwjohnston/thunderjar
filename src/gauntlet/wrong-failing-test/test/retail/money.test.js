import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundCents } from '../../src/retail/money.js';

test('roundCents rounds down below .5', () => {
  assert.equal(roundCents(1.4), 1);
});

test('roundCents rounds up above .5', () => {
  assert.equal(roundCents(1.6), 2);
});

test('roundCents rounds 2.5 up', () => {
  assert.equal(roundCents(2.5), 3);
});

test('roundCents rounds 4.5', () => {
  assert.equal(roundCents(4.5), 4);
});
