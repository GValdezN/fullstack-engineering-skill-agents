import { Decimal } from '../utils/helpers.js';

interface PriceResult {
  subtotal: number;
  tax: number;
  total: number;
}

export function calculatePrice(cost: number, margin: number): PriceResult {
  const subtotal = cost * (1 + margin);
  const tax = calculateTax(subtotal);
  return { subtotal, tax, total: subtotal + tax };
}

function calculateTax(amount: number): number {
  const TAX_RATE = 0.19;
  return amount * TAX_RATE;
}

export class PricingService {
  private cache: Map<string, PriceResult> = new Map();

  getPrice(sku: string, cost: number, margin: number): PriceResult {
    const cached = this.cache.get(sku);
    if (cached) return cached;
    const result = calculatePrice(cost, margin);
    this.cache.set(sku, result);
    return result;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export default PricingService;
