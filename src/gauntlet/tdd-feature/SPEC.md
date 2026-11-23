# Cart spec

All amounts are in whole **cents** (integers). These rules apply to `src/cart.js`.

## `total(cart)`

`cart` is `{ items, code? }`. Each item is `{ priceCents, quantity }`.

It returns `{ subtotal, discount, shipping, total }`, where `total` is `subtotal - discount + shipping`.

### Shipping

Shipping is 500, or 0 when the subtotal is 5000 or more. The threshold is checked against the subtotal **before** any discount.

### Promo codes

`cart.code` is an optional promo code. With no code, `discount` is 0.

| Code | Effect |
|---|---|
| `SAVE10` | 10% off the subtotal, **rounded down** to whole cents |
| `FREESHIP` | Shipping is 0 |
| `TENOFF` | 1000 off, only when the subtotal is 5000 or more. Below that it has no effect |

- Codes are case-insensitive, and spaces around them are ignored: `" save10 "` is `SAVE10`.
- An empty or all-space code is the same as no code.
- Any other code throws an `Error` whose message is `unknown promo code: <code>`, with the code as given, e.g. `unknown promo code: SAVE99`.

| call | result |
|---|---|
| `total({ items: [{ priceCents: 1999, quantity: 1 }], code: "SAVE10" })` | `{ subtotal: 1999, discount: 199, shipping: 500, total: 2300 }` |
| `total({ items: [{ priceCents: 1999, quantity: 1 }], code: "freeship" })` | `{ subtotal: 1999, discount: 0, shipping: 0, total: 1999 }` |
| `total({ items: [{ priceCents: 6000, quantity: 1 }], code: "TENOFF" })` | `{ subtotal: 6000, discount: 1000, shipping: 0, total: 5000 }` |
| `total({ items: [{ priceCents: 4000, quantity: 1 }], code: "TENOFF" })` | `{ subtotal: 4000, discount: 0, shipping: 500, total: 4500 }` |
