import React, { createContext, useCallback, useContext, useState } from 'react';

import { useCart } from './useFourthwall';

import type { FourthwallCart, FourthwallProduct } from './types';

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
