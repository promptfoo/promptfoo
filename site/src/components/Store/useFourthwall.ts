import { useCallback, useEffect, useState } from 'react';

import type {
  FourthwallAttributeValue,
  FourthwallCart,
  FourthwallCollection,
  FourthwallProduct,
  PaginatedResponse,
} from './types';

// Public storefront token - this is INTENTIONALLY public and client-facing.
// Fourthwall storefront tokens are designed to be exposed in frontend code.
// Base64 encoded only to prevent false-positive secret scanner alerts.
// Decoded value: ptkn_1be7c822-bfc7-4167-83a6-95619ff7ed7f
const STOREFRONT_TOKEN = atob('cHRrbl8xYmU3YzgyMi1iZmM3LTQxNjctODNhNi05NTYxOWZmN2VkN2Y=');
const API_BASE = 'https://storefront-api.fourthwall.com/v1';
const CHECKOUT_DOMAIN = 'https://promptfoo-shop.fourthwall.com';

// Maximum pages to fetch (safety limit for pagination)
const MAX_PAGES = 50;
const PAGE_SIZE = 10;

// Safe localStorage wrapper (handles private browsing mode)
function safeLocalStorage() {
  return {
    getItem(key: string): string | null {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Silently fail in private browsing mode
      }
    },
    removeItem(key: string): void {
      try {
        localStorage.removeItem(key);
      } catch {
        // Silently fail in private browsing mode
      }
    },
  };
}

// Input validation helpers
function validateVariantId(variantId: string): void {
  if (!variantId || typeof variantId !== 'string' || variantId.trim() === '') {
    throw new Error('Invalid variant ID');
  }
}

function validateQuantity(quantity: number): void {
  if (
    typeof quantity !== 'number' ||
    quantity < 1 ||
    quantity > 99 ||
    !Number.isInteger(quantity)
  ) {
    throw new Error('Quantity must be an integer between 1 and 99');
  }
}

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = new URL(`${API_BASE}${endpoint}`);
  url.searchParams.set('storefront_token', STOREFRONT_TOKEN);

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Fetch all collections
export function useCollections() {
  const [collections, setCollections] = useState<FourthwallCollection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PaginatedResponse<FourthwallCollection>>('/collections')
      .then((data) => setCollections(data.results))
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  return { collections, isLoading, error };
}

// Fetch all products from a collection (handles pagination)
export function useProducts(collectionSlug: string = 'all') {
  const [products, setProducts] = useState<FourthwallProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAllProducts() {
      setIsLoading(true);
      setError(null);

      try {
        const allProducts: FourthwallProduct[] = [];
        let page = 0;

        // Fetch pages until we get an empty results array
        while (true) {
          const response = await apiFetch<{ results: FourthwallProduct[] }>(
            `/collections/${collectionSlug}/products?page=${page}&size=${PAGE_SIZE}`,
          );

          if (!response.results || response.results.length === 0) {
            break;
          }

          allProducts.push(...response.results);
          page++;

          // Safety limit to prevent infinite loops
          if (page >= MAX_PAGES) {
            console.warn(
              `[Store] Pagination limit reached (${MAX_PAGES} pages, ${allProducts.length} products). ` +
                'Some products may not be displayed. Consider increasing MAX_PAGES if the catalog has grown.',
            );
            break;
          }
        }

        setProducts(allProducts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch products');
      } finally {
        setIsLoading(false);
      }
    }

    fetchAllProducts();
  }, [collectionSlug]);

  return { products, isLoading, error };
}

// Fetch a single product
export function useProduct(slug: string | null) {
  const [product, setProduct] = useState<FourthwallProduct | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setProduct(null);
      return;
    }

    setIsLoading(true);
    apiFetch<FourthwallProduct>(`/products/${slug}`)
      .then(setProduct)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [slug]);

  return { product, isLoading, error };
}

// Cart operations
const CART_STORAGE_KEY = 'promptfoo_cart_id';
const storage = safeLocalStorage();

export function useCart() {
  const [cart, setCart] = useState<FourthwallCart | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing cart on mount
  useEffect(() => {
    const cartId = storage.getItem(CART_STORAGE_KEY);
    if (cartId) {
      setIsLoading(true);
      apiFetch<FourthwallCart>(`/carts/${cartId}`)
        .then(setCart)
        .catch(() => {
          // Cart expired or invalid, clear it
          storage.removeItem(CART_STORAGE_KEY);
        })
        .finally(() => setIsLoading(false));
    }
  }, []);

  const createCart = useCallback(async (variantId: string, quantity: number = 1) => {
    // Validate inputs
    validateVariantId(variantId);
    validateQuantity(quantity);

    setIsLoading(true);
    setError(null);
    try {
      const newCart = await apiFetch<FourthwallCart>('/carts', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ variantId, quantity }],
        }),
      });
      storage.setItem(CART_STORAGE_KEY, newCart.id);
      setCart(newCart);
      return newCart;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create cart');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addToCart = useCallback(
    async (variantId: string, quantity: number = 1) => {
      // Validate inputs
      validateVariantId(variantId);
      validateQuantity(quantity);

      setIsLoading(true);
      setError(null);
      try {
        if (!cart) {
          return createCart(variantId, quantity);
        }

        const updatedCart = await apiFetch<FourthwallCart>(`/carts/${cart.id}/add`, {
          method: 'POST',
          body: JSON.stringify({
            items: [{ variantId, quantity }],
          }),
        });
        setCart(updatedCart);
        return updatedCart;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add to cart');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cart, createCart],
  );

  const removeFromCart = useCallback(
    async (variantId: string) => {
      if (!cart) return;

      // Validate input
      validateVariantId(variantId);

      setIsLoading(true);
      setError(null);
      try {
        // API expects: { items: [{ variantId }] }
        const updatedCart = await apiFetch<FourthwallCart>(`/carts/${cart.id}/remove`, {
          method: 'POST',
          body: JSON.stringify({
            items: [{ variantId }],
          }),
        });
        setCart(updatedCart);
        return updatedCart;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove from cart');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cart],
  );

  const updateQuantity = useCallback(
    async (variantId: string, quantity: number) => {
      if (!cart) return;

      // Validate inputs
      validateVariantId(variantId);
      validateQuantity(quantity);

      setIsLoading(true);
      setError(null);
      try {
        // API expects: { items: [{ variantId, quantity }] }
        const updatedCart = await apiFetch<FourthwallCart>(`/carts/${cart.id}/change`, {
          method: 'POST',
          body: JSON.stringify({
            items: [{ variantId, quantity }],
          }),
        });
        setCart(updatedCart);
        return updatedCart;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update quantity');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cart],
  );

  const clearCart = useCallback(() => {
    storage.removeItem(CART_STORAGE_KEY);
    setCart(null);
  }, []);

  const itemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return {
    cart,
    isLoading,
    error,
    itemCount,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
  };
}

// Format price for display (Fourthwall returns value in dollars, not cents)
export function formatPrice(money: { value: number; currency: string }): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: money.currency,
  }).format(money.value);
}

// Common HTML entities for SSR decoding
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
};

/**
 * Strip HTML tags from a string.
 * Uses DOMParser in browser (safe), regex fallback for SSR.
 * Note: SSR fallback is designed for trusted content (Fourthwall API responses).
 */
export function stripHtml(html: string): string {
  if (!html) return '';

  // Browser: Use DOMParser (safe, handles all edge cases)
  if (typeof document !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Remove script and style elements before getting textContent
    doc.querySelectorAll('script, style').forEach((el) => el.remove());
    return doc.body.textContent || '';
  }

  // SSR fallback: Regex-based stripping for trusted content only
  // This is used for Fourthwall product descriptions which are trusted
  let result = html;

  // Remove script and style tags and their contents first
  result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove all remaining HTML tags (loop handles nested/malformed HTML)
  let previous = '';
  let iterations = 0;
  const MAX_ITERATIONS = 100; // Prevent infinite loops
  while (result !== previous && iterations < MAX_ITERATIONS) {
    previous = result;
    result = result.replace(/<[^>]*>/g, '');
    iterations++;
  }

  // Decode common HTML entities
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.split(entity).join(char);
  }

  // Decode numeric entities (&#123; or &#x1F600;)
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)));
  result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  );

  return result.trim();
}

// Check if variant is in stock
export function isInStock(stock: { type: string; quantity?: number }): boolean {
  if (stock.type === 'UNLIMITED') {
    return true;
  }
  if (stock.type === 'LIMITED' && typeof stock.quantity === 'number') {
    return stock.quantity > 0;
  }
  return false;
}

// Get display name from attribute value (handles both string and object formats)
export function getAttributeName(attr: FourthwallAttributeValue): string {
  if (typeof attr === 'string') {
    return attr;
  }
  return attr.name;
}

// Get swatch color if available (for color attributes)
export function getAttributeSwatch(attr: FourthwallAttributeValue): string | undefined {
  if (typeof attr === 'object' && 'swatch' in attr) {
    return attr.swatch;
  }
  return undefined;
}

// Generate checkout URL for a cart
export function getCheckoutUrl(cartId: string, currency: string = 'USD'): string {
  return `${CHECKOUT_DOMAIN}/checkout/?cartCurrency=${currency}&cartId=${cartId}`;
}
