import * as React from 'react';

import { cn } from '@app/lib/utils';
import * as TabsPrimitive from '@radix-ui/react-tabs';

type TabsListVariant = 'pill' | 'line';

interface TabsProps extends React.ComponentProps<typeof TabsPrimitive.Root> {
  /**
   * Orientation of the tabs
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical';
}

function Tabs({ className, orientation = 'horizontal', ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      orientation={orientation}
      data-orientation={orientation}
      className={cn('group/tabs', className)}
      {...props}
    />
  );
}

interface TabsListProps extends React.ComponentProps<typeof TabsPrimitive.List> {
  /**
   * Visual style variant for the tabs
   * - `pill`: Rounded pill-style tabs with muted background (default)
   * - `line`: Underline-style tabs with border indicator
   */
  variant?: TabsListVariant;
  /**
   * When true, tabs will stretch to fill the full width/height of the container
   */
  fullWidth?: boolean;
}

function TabsList({
  className,
  ref,
  variant = 'pill',
  fullWidth = false,
  ...props
}: TabsListProps) {
  return (
    <TabsPrimitive.List
      ref={ref}
      data-variant={variant}
      className={cn(
        // Base styles
        'group/list inline-flex items-center text-muted-foreground',
        // Horizontal orientation (default)
        'group-data-[orientation=horizontal]/tabs:flex-row',
        // Vertical orientation
        'group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:items-stretch',
        // Pill variant
        variant === 'pill' && [
          'justify-center rounded-md bg-muted p-1',
          'group-data-[orientation=horizontal]/tabs:h-10',
          'group-data-[orientation=vertical]/tabs:h-auto group-data-[orientation=vertical]/tabs:w-full',
          fullWidth && 'w-full',
        ],
        // Line variant - horizontal
        variant === 'line' && [
          'h-auto gap-0 bg-transparent p-0',
          'group-data-[orientation=horizontal]/tabs:w-full group-data-[orientation=horizontal]/tabs:justify-start group-data-[orientation=horizontal]/tabs:border-b group-data-[orientation=horizontal]/tabs:border-border',
          // Line variant - vertical
          'group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:border-r group-data-[orientation=vertical]/tabs:border-border',
        ],
        className,
      )}
      {...props}
    />
  );
}

interface TabsTriggerProps extends React.ComponentProps<typeof TabsPrimitive.Trigger> {
  /**
   * Optional icon to display alongside the tab label
   */
  icon?: React.ReactNode;
  /**
   * Position of the icon relative to the label
   * @default 'start'
   */
  iconPosition?: 'start' | 'end';
}

function TabsTrigger({
  className,
  ref,
  children,
  icon,
  iconPosition = 'start',
  ...props
}: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        // Base styles
        'inline-flex cursor-pointer items-center whitespace-nowrap text-sm font-medium transition-all',
        'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        // Default padding (pill variant) - explicit fallback for Tailwind v4 compatibility
        'rounded-sm px-3 py-1.5',
        'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        // Horizontal alignment
        'group-data-[orientation=horizontal]/tabs:justify-center',
        // Vertical alignment
        'group-data-[orientation=vertical]/tabs:justify-start group-data-[orientation=vertical]/tabs:w-full',
        // Line variant styles - override default pill styles
        'group-data-[variant=line]/list:relative group-data-[variant=line]/list:rounded-none group-data-[variant=line]/list:bg-transparent group-data-[variant=line]/list:px-4 group-data-[variant=line]/list:py-3',
        'group-data-[variant=line]/list:shadow-none group-data-[variant=line]/list:hover:text-foreground',
        // Line variant - horizontal specific (bottom border indicator)
        'group-data-[orientation=horizontal]/tabs:group-data-[variant=line]/list:flex-1 group-data-[orientation=horizontal]/tabs:group-data-[variant=line]/list:border-b-2 group-data-[orientation=horizontal]/tabs:group-data-[variant=line]/list:border-transparent',
        'group-data-[orientation=horizontal]/tabs:group-data-[variant=line]/list:data-[state=active]:border-primary group-data-[orientation=horizontal]/tabs:group-data-[variant=line]/list:data-[state=active]:text-foreground',
        // Line variant - vertical specific (right border indicator)
        'group-data-[orientation=vertical]/tabs:group-data-[variant=line]/list:border-r-2 group-data-[orientation=vertical]/tabs:group-data-[variant=line]/list:border-transparent',
        'group-data-[orientation=vertical]/tabs:group-data-[variant=line]/list:data-[state=active]:border-primary group-data-[orientation=vertical]/tabs:group-data-[variant=line]/list:data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    >
      {icon && iconPosition === 'start' && <span className="mr-2 size-4 shrink-0">{icon}</span>}
      {children}
      {icon && iconPosition === 'end' && <span className="ml-2 size-4 shrink-0">{icon}</span>}
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        // Horizontal - content below tabs
        'group-data-[orientation=horizontal]/tabs:mt-2',
        // Vertical - content beside tabs
        'group-data-[orientation=vertical]/tabs:ml-0 group-data-[orientation=vertical]/tabs:flex-1',
        // Animation
        'data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150',
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
export type { TabsProps, TabsListVariant, TabsListProps, TabsTriggerProps };
