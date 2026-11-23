import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote, describe, receiptLine } from '../src/shipping.js';

const book = { weightGrams: 400, priceCents: 2000, quantity: 1 };
const kettle = { weightGrams: 1500, priceCents: 4500, quantity: 1 };
const bricks = { weightGrams: 1000, priceCents: 100, quantity: 4 };

test('post, domestic, light parcel', () => {
  assert.equal(quote({ carrier: 'post', zone: 'domestic', items: [book] }).cents, 495);
});

test('post, domestic, medium parcel', () => {
  assert.equal(quote({ carrier: 'post', zone: 'domestic', items: [kettle] }).cents, 895);
});

test('post, domestic, heavy parcel is charged per extra kilo', () => {
  assert.equal(quote({ carrier: 'post', zone: 'domestic', items: [bricks] }).cents, 1395);
});

test('post, international, heavy parcel', () => {
  assert.equal(quote({ carrier: 'post', zone: 'international', items: [bricks] }).cents, 4095);
});

test('courier, domestic, light parcel', () => {
  assert.equal(quote({ carrier: 'courier', zone: 'domestic', items: [book] }).cents, 995);
});

test('courier, international, medium parcel', () => {
  assert.equal(quote({ carrier: 'courier', zone: 'international', items: [kettle] }).cents, 3995);
});

test('express post costs half as much again', () => {
  assert.equal(quote({ carrier: 'post', zone: 'domestic', express: true, items: [book] }).cents, 743);
});

test('insurance is 2% of the value', () => {
  const order = { carrier: 'post', zone: 'domestic', insured: true, items: [{ ...kettle, quantity: 2 }] };
  assert.equal(quote(order).cents, 1145 + 180);
});

test('the label is in dollars', () => {
  assert.equal(quote({ carrier: 'post', zone: 'domestic', items: [book] }).label, '$4.95');
});

test('an unknown carrier is an error', () => {
  assert.throws(() => quote({ carrier: 'pigeon', zone: 'domestic', items: [book] }), /unknown carrier: pigeon/);
});

test('describe names the options', () => {
  const order = { carrier: 'courier', zone: 'domestic', express: true, items: [book] };
  assert.equal(describe(order), 'courier to domestic, express: $12.44');
});

test('receiptLine shows what is still due', () => {
  assert.equal(receiptLine({ carrier: 'post', zone: 'domestic', items: [book] }, 100), 'Shipping $4.95, $3.95 due');
});

test('receiptLine shows a refund', () => {
  assert.equal(receiptLine({ carrier: 'post', zone: 'domestic', items: [book] }, 500), 'Shipping $4.95, $0.05 refunded');
});
