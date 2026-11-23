// Shipping quotes. All amounts are in whole cents.

function totalWeight(order) {
  let grams = 0;
  for (const item of order.items) {
    grams = grams + item.weightGrams * item.quantity;
  }
  return grams;
}

function baseRate(order, grams) {
  let cents;
  if (order.carrier === 'post') {
    if (order.zone === 'domestic') {
      if (grams <= 500) {
        cents = 495;
      } else if (grams <= 2000) {
        cents = 895;
      } else {
        cents = 895 + Math.ceil((grams - 2000) / 1000) * 250;
      }
    } else if (order.zone === 'international') {
      if (grams <= 500) {
        cents = 1495;
      } else if (grams <= 2000) {
        cents = 2495;
      } else {
        cents = 2495 + Math.ceil((grams - 2000) / 1000) * 800;
      }
    } else {
      throw new Error('unknown zone: ' + order.zone);
    }
  } else if (order.carrier === 'courier') {
    if (order.zone === 'domestic') {
      if (grams <= 500) {
        cents = 995;
      } else if (grams <= 2000) {
        cents = 1295;
      } else {
        cents = 1295 + Math.ceil((grams - 2000) / 1000) * 300;
      }
    } else if (order.zone === 'international') {
      if (grams <= 500) {
        cents = 2995;
      } else if (grams <= 2000) {
        cents = 3995;
      } else {
        cents = 3995 + Math.ceil((grams - 2000) / 1000) * 1000;
      }
    } else {
      throw new Error('unknown zone: ' + order.zone);
    }
  } else {
    throw new Error('unknown carrier: ' + order.carrier);
  }
  return cents;
}

export function quote(order) {
  const grams = totalWeight(order);
  let cents = baseRate(order, grams);

  if (order.express) {
    if (order.carrier === 'post') {
      cents = Math.round(cents * 1.5);
    } else if (order.carrier === 'courier') {
      cents = Math.round(cents * 1.25);
    }
  }

  if (order.insured) {
    let value = 0;
    for (const item of order.items) {
      value = value + item.priceCents * item.quantity;
    }
    let premium = Math.round(value * 0.02);
    if (premium < 150) {
      premium = 150;
    }
    cents = cents + premium;
  }

  return { cents: cents, label: '$' + (cents / 100).toFixed(2) };
}

export function describe(order) {
  const q = quote(order);
  let text = order.carrier + ' to ' + order.zone;
  if (order.express) {
    text = text + ', express';
  }
  if (order.insured) {
    text = text + ', insured';
  }
  return text + ': $' + (q.cents / 100).toFixed(2);
}

export function receiptLine(order, paidCents) {
  const q = quote(order);
  const owed = q.cents - paidCents;
  if (owed > 0) {
    return 'Shipping $' + (q.cents / 100).toFixed(2) + ', $' + (owed / 100).toFixed(2) + ' due';
  } else if (owed < 0) {
    return 'Shipping $' + (q.cents / 100).toFixed(2) + ', $' + (-owed / 100).toFixed(2) + ' refunded';
  } else {
    return 'Shipping $' + (q.cents / 100).toFixed(2) + ', paid';
  }
}
