import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatPrice,
  getAttributeName,
  getAttributeSwatch,
  getCheckoutUrl,
  isInStock,
  stripHtml,
  useCart,
} from './useFourthwall';

describe('cart storage failures', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['getItem', 'setItem', 'removeItem'] as const)(
    'keeps cart state usable when private browsing rejects %s',
    async (method) => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(
        method === 'removeItem' ? 'expired' : null,
      );
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
      const storage = vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error('Storage unavailable');
      });
      const cart = {
        id: 'new-cart',
        items: [
          {
            variant: { id: 'shirt', name: 'Shirt', unitPrice: { value: 20, currency: 'USD' } },
            quantity: 2,
          },
        ],
      };
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(cart), { status: 200 }));
      if (method === 'removeItem') {
        fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
      }
      const { result } = renderHook(useCart);
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.cart).toBeNull();
      await act(async () => {
        expect(await result.current.addToCart('shirt', 2)).toEqual(cart);
      });
      expect(storage).toHaveBeenCalledWith(
        'promptfoo_cart_id',
        ...(method === 'setItem' ? ['new-cart'] : []),
      );
      expect(result.current.cart).toEqual(cart);
      expect(result.current.itemCount).toBe(2);
      expect(result.current.isLoading).toBe(false);
      const [url, options] = fetchMock.mock.calls.at(-1)!;
      expect(new URL(String(url)).pathname).toBe('/v1/carts');
      expect(options?.method).toBe('POST');
      expect(JSON.parse(String(options?.body))).toEqual({
        items: [{ variantId: 'shirt', quantity: 2 }],
      });
    },
  );
});

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

  it('returns true for limited stock with quantity > 0', () => {
    expect(isInStock({ type: 'LIMITED', quantity: 5 })).toBe(true);
    expect(isInStock({ type: 'LIMITED', quantity: 1 })).toBe(true);
  });

  it('returns false for limited stock with quantity 0', () => {
    expect(isInStock({ type: 'LIMITED', quantity: 0 })).toBe(false);
  });

  it('returns false for limited stock without quantity', () => {
    expect(isInStock({ type: 'LIMITED' })).toBe(false);
  });

  it('returns false for unknown stock type', () => {
    expect(isInStock({ type: 'UNKNOWN' })).toBe(false);
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
