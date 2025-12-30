import * as React from 'react';

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

type PolymorphicProps<E extends React.ElementType> = {
  as?: E;
  variant?: TypographyVariant;
  weight?: TypographyWeight;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<E>, 'as' | 'variant' | 'weight' | 'className' | 'children'>;

type TypographyComponent = <E extends React.ElementType = 'p'>(
  props: PolymorphicProps<E> & { ref?: React.Ref<Element> },
) => React.ReactElement | null;

const Typography: TypographyComponent = React.forwardRef(function Typography<
  E extends React.ElementType = 'p',
>(
  { as, variant, weight, className, children, ...props }: PolymorphicProps<E>,
  ref: React.Ref<Element>,
): React.ReactElement {
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
}) as TypographyComponent;

export { Typography, typographyVariants };
export type { TypographyVariant, TypographyWeight };
