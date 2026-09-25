import type { ComponentPropsWithRef, ElementType, ReactElement, ReactNode } from 'react';

import { cn } from '@app/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const typographyVariants = cva('', {
  variants: {
    variant: {
      pageTitle: 'text-2xl tracking-tight',
      title: 'text-xl tracking-tight',
      subtitle: 'text-lg',
      label: 'text-base',
      body: 'text-sm',
      bodyMedium: 'text-sm',
      small: 'text-xs',
      muted: 'text-sm text-muted-foreground',
      code: 'font-mono text-sm',
    },
    weight: {
      light: 'font-light',
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
  },
  compoundVariants: [
    // Default weights for heading variants
    { variant: 'pageTitle', weight: undefined, className: 'font-semibold' },
    { variant: 'title', weight: undefined, className: 'font-semibold' },
    { variant: 'subtitle', weight: undefined, className: 'font-semibold' },
    { variant: 'label', weight: undefined, className: 'font-semibold' },
    // Default weights for body variants
    { variant: 'body', weight: undefined, className: '' },
    { variant: 'bodyMedium', weight: undefined, className: 'font-medium' },
    { variant: 'small', weight: undefined, className: '' },
    { variant: 'muted', weight: undefined, className: '' },
    { variant: 'code', weight: undefined, className: '' },
  ],
  defaultVariants: {
    variant: 'body',
  },
});

type TypographyVariant = NonNullable<VariantProps<typeof typographyVariants>['variant']>;
type TypographyWeight = VariantProps<typeof typographyVariants>['weight'];

type PolymorphicProps<E extends ElementType> = {
  as?: E;
  variant?: TypographyVariant;
  weight?: TypographyWeight;
  className?: string;
  children?: ReactNode;
  ref?: ComponentPropsWithRef<E>['ref'];
} & Omit<ComponentPropsWithRef<E>, 'as' | 'variant' | 'weight' | 'className' | 'children' | 'ref'>;

function Typography<E extends ElementType = 'p'>({
  as,
  variant,
  weight,
  className,
  children,
  ref,
  ...props
}: PolymorphicProps<E>): ReactElement {
  const Component = as || 'p';
  return (
    <Component
      ref={ref}
      className={cn(typographyVariants({ variant, weight }), className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export type { TypographyVariant, TypographyWeight };
export { Typography, typographyVariants };
