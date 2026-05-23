import { describe, expect, it } from 'vitest';
import {
  formatPrice,
  getAttributeName,
  getAttributeSwatch,
  getCheckoutUrl,
  isInStock,
  isProductSoldOut,
  stripHtml,
} from './useFourthwall';

import type { FourthwallProduct } from './types';

describe('formatPrice', () => {
  it('formats USD prices correctly', () => {
    expect(formatPrice({ value: 29.99, currency: 'USD' })).toBe('$29.99');
  });

  it('formats whole dollar amounts', () => {
    expect(formatPrice({ value: 100, currency: 'USD' })).toBe('$100.00');
  });

  it('formats other currencies', () => {
    expect(formatPrice({ value: 50, currency: 'EUR' })).toMatch(/50/);
  });

  it('handles zero values', () => {
    expect(formatPrice({ value: 0, currency: 'USD' })).toBe('$0.00');
  });
});

describe('stripHtml', () => {
  it('returns empty string for falsy input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null as unknown as string)).toBe('');
  });

  it('strips basic HTML tags', () => {
    expect(stripHtml('<p>Hello World</p>')).toBe('Hello World');
  });

  it('handles nested tags', () => {
    expect(stripHtml('<div><p><strong>Bold</strong> text</p></div>')).toBe('Bold text');
  });

  it('removes script tags and content', () => {
    expect(stripHtml('<p>Safe</p><script>alert("xss")</script><p>Text</p>')).toBe('SafeText');
  });

  it('removes script tags with attributes', () => {
    expect(stripHtml('<script type="text/javascript">evil()</script>OK')).toBe('OK');
  });

  it('removes script tags with whitespace in closing tag', () => {
    // Edge case: </script > with trailing space
    expect(stripHtml('<script>bad()</script >Safe')).toBe('Safe');
  });

  it('removes style tags and content', () => {
    expect(stripHtml('<style>.red{color:red}</style><p>Text</p>')).toBe('Text');
  });

  it('removes style tags with whitespace in closing tag', () => {
    expect(stripHtml('<style>.x{}</style >OK')).toBe('OK');
  });

  it('decodes HTML entities', () => {
    expect(stripHtml('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(stripHtml('&lt;not a tag&gt;')).toBe('<not a tag>');
    expect(stripHtml('&quot;quoted&quot;')).toBe('"quoted"');
  });

  it('decodes numeric entities', () => {
    expect(stripHtml('&#65;BC')).toBe('ABC');
    expect(stripHtml('&#x41;BC')).toBe('ABC');
  });

  it('handles complex product descriptions', () => {
    const html = `
      <div class="description">
        <p>Premium quality <strong>T-Shirt</strong> made from 100% cotton.</p>
        <ul>
          <li>Comfortable fit</li>
          <li>Machine washable</li>
        </ul>
      </div>
    `;
    const result = stripHtml(html);
    expect(result).toContain('Premium quality');
    expect(result).toContain('T-Shirt');
    expect(result).toContain('100% cotton');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });
});

describe('isInStock', () => {
  it('returns true for unlimited stock', () => {
    expect(isInStock({ type: 'UNLIMITED' })).toBe(true);
  });

  it('returns true for limited stock with inventory remaining', () => {
    expect(isInStock({ type: 'LIMITED', inStock: 5 })).toBe(true);
  });

  it('returns false for limited stock with no inventory remaining', () => {
    expect(isInStock({ type: 'LIMITED', inStock: 0 })).toBe(false);
  });
});

describe('isProductSoldOut', () => {
  const makeVariant = (overrides: Partial<FourthwallProduct['variants'][number]> = {}) => ({
    id: 'var-1',
    name: 'Default',
    sku: 'SKU-1',
    unitPrice: { value: 10, currency: 'USD' },
    stock: { type: 'UNLIMITED' as const },
    images: [],
    attributes: {},
    ...overrides,
  });

  const makeProduct = (overrides: Partial<FourthwallProduct> = {}): FourthwallProduct => ({
    id: 'prod-1',
    slug: 'test-product',
    name: 'Test Product',
    description: '',
    state: { type: 'AVAILABLE' },
    access: { type: 'PUBLIC' },
    images: [],
    variants: [makeVariant()],
    ...overrides,
  });

  it('returns true when Fourthwall marks the product sold out', () => {
    expect(isProductSoldOut(makeProduct({ state: { type: 'SOLD_OUT' } }))).toBe(true);
  });

  it('returns true when all variants are out of stock', () => {
    expect(
      isProductSoldOut(
        makeProduct({
          variants: [
            makeVariant({ name: 'Small', stock: { type: 'LIMITED', inStock: 0 } }),
            makeVariant({
              id: 'var-2',
              name: 'Large',
              sku: 'SKU-2',
              stock: { type: 'LIMITED', inStock: 0 },
            }),
          ],
        }),
      ),
    ).toBe(true);
  });

  it('returns false when any variant is in stock', () => {
    expect(
      isProductSoldOut(
        makeProduct({
          variants: [
            makeVariant({ name: 'Small', stock: { type: 'LIMITED', inStock: 0 } }),
            makeVariant({
              id: 'var-2',
              name: 'Large',
              sku: 'SKU-2',
              stock: { type: 'LIMITED', inStock: 1 },
            }),
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe('getAttributeName', () => {
  it('returns string attributes directly', () => {
    expect(getAttributeName('Large')).toBe('Large');
    expect(getAttributeName('Red')).toBe('Red');
  });

  it('extracts name from object attributes', () => {
    expect(getAttributeName({ name: 'Blue', swatch: '#0000ff' })).toBe('Blue');
    expect(getAttributeName({ name: 'Medium' })).toBe('Medium');
  });
});

describe('getAttributeSwatch', () => {
  it('returns undefined for string attributes', () => {
    expect(getAttributeSwatch('Large')).toBeUndefined();
  });

  it('returns swatch color from object attributes', () => {
    expect(getAttributeSwatch({ name: 'Blue', swatch: '#0000ff' })).toBe('#0000ff');
  });

  it('returns undefined for object without swatch', () => {
    expect(getAttributeSwatch({ name: 'Medium' })).toBeUndefined();
  });
});

describe('getCheckoutUrl', () => {
  it('generates correct checkout URL', () => {
    const url = getCheckoutUrl('cart-123', 'USD');
    expect(url).toBe(
      'https://promptfoo-shop.fourthwall.com/checkout/?cartCurrency=USD&cartId=cart-123',
    );
  });

  it('defaults to USD currency', () => {
    const url = getCheckoutUrl('cart-456');
    expect(url).toContain('cartCurrency=USD');
  });

  it('handles different currencies', () => {
    const url = getCheckoutUrl('cart-789', 'EUR');
    expect(url).toContain('cartCurrency=EUR');
  });
});
