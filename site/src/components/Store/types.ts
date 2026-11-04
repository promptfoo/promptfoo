// Fourthwall Storefront API Types

export interface FourthwallImage {
  url: string;
  width: number;
  height: number;
}

export interface FourthwallMoney {
  value: number;
  currency: string;
}

// Attribute can be a string, or an object with name (and optionally swatch for colors)
export interface FourthwallAttribute {
  name: string;
  swatch?: string;
}

export type FourthwallAttributeValue = string | FourthwallAttribute;

export interface FourthwallVariant {
  id: string;
  name: string;
  sku: string;
  unitPrice: FourthwallMoney;
  compareAtPrice?: FourthwallMoney;
  attributes: Record<string, FourthwallAttributeValue>;
  stock: {
    type: 'LIMITED' | 'UNLIMITED';
    quantity?: number;
    inStock?: number;
  };
  images: FourthwallImage[];
  weight?: {
    value: number;
    unit: string;
  };
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: string;
  };
}

interface FourthwallCatalogItemBase {
  id: string;
  name: string;
  slug: string;
  description: string;
  state: { type: 'AVAILABLE' | 'SOLD_OUT' };
  access: { type: 'PUBLIC' | 'HIDDEN' | 'PRIVATE' | 'ARCHIVED' };
  images: FourthwallImage[];
}

export interface FourthwallProduct extends FourthwallCatalogItemBase {
  type: 'PRODUCT';
  variants: FourthwallVariant[];
}

// Bundles have their own price and constituent offers, not product variants.
export interface FourthwallBundle extends FourthwallCatalogItemBase {
  type: 'BUNDLE';
  price: FourthwallMoney;
  offers: FourthwallProduct[];
  pricingStrategy: { type: 'FIXED_PRICE' | 'DISCOUNT_BASED' | 'SAME_AS_INDIVIDUAL' };
}

export type FourthwallCatalogItem = FourthwallProduct | FourthwallBundle;

// Cart item structure per OpenAPI spec - variant is nested object, no top-level variantId
export interface FourthwallCartItem {
  variant: FourthwallCartVariant;
  quantity: number;
  groupedBy?: { type: 'BUNDLE'; bundleId: string; groupedId: string };
}

export interface FourthwallCartRequestItem {
  variantId: string;
  quantity: number;
  bundleId?: string;
}

// Variant info returned in cart responses (subset of full variant)
export interface FourthwallCartVariant {
  id: string;
  name: string;
  sku?: string;
  unitPrice: FourthwallMoney;
  compareAtPrice?: FourthwallMoney;
  attributes?: Record<string, FourthwallAttributeValue>;
  stock?: {
    type: 'LIMITED' | 'UNLIMITED';
    quantity?: number;
    inStock?: number;
  };
  images?: FourthwallImage[];
  product?: {
    id?: string;
    name?: string;
    slug?: string;
    images?: FourthwallImage[];
  };
}

export interface FourthwallCart {
  id: string;
  items: FourthwallCartItem[];
  checkoutUrl?: string;
  subtotal?: FourthwallMoney;
}

// Store UI State Types
export interface CartState {
  cart: FourthwallCart | null;
  isLoading: boolean;
  isOpen: boolean;
  error: string | null;
}

export interface ProductModalState {
  product: FourthwallProduct | null;
  selectedVariantId: string | null;
}
