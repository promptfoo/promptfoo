import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { useCart } from './useFourthwall';

import type { FourthwallCart, FourthwallProduct } from './types';

const COUPON_STORAGE_KEY = 'promptfoo_coupon_code';

interface CartContextValue {
  // Cart state
  cart: FourthwallCart | null;
  isLoading: boolean;
  error: string | null;
  itemCount: number;

  // Cart actions
  addToCart: (variantId: string, quantity?: number) => Promise<FourthwallCart | undefined>;
  removeFromCart: (itemId: string) => Promise<FourthwallCart | undefined>;
  updateQuantity: (itemId: string, quantity: number) => Promise<FourthwallCart | undefined>;
  clearCart: () => void;

  // Cart drawer state
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;

  // Product modal state
  selectedProduct: FourthwallProduct | null;
  openProductModal: (product: FourthwallProduct) => void;
  closeProductModal: () => void;

  // Coupon state
  couponCode: string | null;
  clearCoupon: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const {
    cart,
    isLoading,
    error,
    itemCount,
    addToCart: addToCartApi,
    removeFromCart: removeFromCartApi,
    updateQuantity: updateQuantityApi,
    clearCart: clearCartApi,
  } = useCart();

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<FourthwallProduct | null>(null);
  const [couponCode, setCouponCode] = useState<string | null>(null);

  const ingestCouponFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCoupon = params.get('coupon');
    if (urlCoupon) {
      const code = urlCoupon.trim().toUpperCase();
      setCouponCode(code);
      try {
        localStorage.setItem(COUPON_STORAGE_KEY, code);
      } catch {
        // Private browsing
      }
      // Clean the URL without triggering a navigation
      params.delete('coupon');
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState(window.history.state, '', newUrl);
      return true;
    }
    return false;
  }, []);

  // Read coupon from URL or localStorage on mount
  useEffect(() => {
    if (!ingestCouponFromUrl()) {
      // Fall back to localStorage
      try {
        const stored = localStorage.getItem(COUPON_STORAGE_KEY);
        if (stored) {
          setCouponCode(stored);
        }
      } catch {
        // Private browsing
      }
    }
  }, [ingestCouponFromUrl]);

  // Re-check URL on client-side navigations (Docusaurus SPA route changes)
  useEffect(() => {
    const handleRouteChange = () => ingestCouponFromUrl();

    // Docusaurus uses pushState/replaceState for navigation
    window.addEventListener('popstate', handleRouteChange);

    // Patch pushState/replaceState to detect Docusaurus client-side navigation
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleRouteChange();
    };
    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      handleRouteChange();
    };

    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, [ingestCouponFromUrl]);

  const clearCoupon = useCallback(() => {
    setCouponCode(null);
    try {
      localStorage.removeItem(COUPON_STORAGE_KEY);
    } catch {
      // Private browsing
    }
  }, []);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  const openProductModal = useCallback((product: FourthwallProduct) => {
    setSelectedProduct(product);
  }, []);

  const closeProductModal = useCallback(() => {
    setSelectedProduct(null);
  }, []);

  // Wrap addToCart to automatically open cart drawer on success
  const addToCart = useCallback(
    async (variantId: string, quantity: number = 1) => {
      const result = await addToCartApi(variantId, quantity);
      if (result) {
        setIsCartOpen(true);
      }
      return result;
    },
    [addToCartApi],
  );

  const value: CartContextValue = {
    cart,
    isLoading,
    error,
    itemCount,
    addToCart,
    removeFromCart: removeFromCartApi,
    updateQuantity: updateQuantityApi,
    clearCart: clearCartApi,
    isCartOpen,
    openCart,
    closeCart,
    selectedProduct,
    openProductModal,
    closeProductModal,
    couponCode,
    clearCoupon,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCartContext() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCartContext must be used within a CartProvider');
  }
  return context;
}
