export function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export class Decimal {
  #value;
  constructor(value) {
    this.#value = Number(value);
  }
  add(other) {
    return new Decimal(this.#value + other.#value);
  }
  toString() {
    return this.#value.toFixed(2);
  }
}

function internalHelper() {
  return 42;
}
