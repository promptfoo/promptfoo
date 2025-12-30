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

export interface FourthwallProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  access: 'PUBLIC' | 'PRIVATE';
  images: FourthwallImage[];
  variants: FourthwallVariant[];
}

export interface FourthwallCollection {
  id: string;
  name: string;
  slug: string;
  description: string;
}

// Cart item structure per OpenAPI spec - variant is nested object, no top-level variantId
export interface FourthwallCartItem {
  variant: FourthwallCartVariant;
  quantity: number;
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

export interface PagingInfo {
  pageNumber: number;
  pageSize: number;
  elementsSize: number;
  elementsTotal: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface PaginatedResponse<T> {
  results: T[];
  paging: PagingInfo;
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
