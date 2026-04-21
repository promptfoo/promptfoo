import { cn } from '@app/lib/utils';

export type PageHeaderVariant = 'default' | 'success' | 'warning' | 'error';

interface PageHeaderProps {
  children: React.ReactNode;
  /**
   * Visual variant of the header:
   * - `default`: Semi-transparent white background
   * - `success`: Green gradient (for clean/success states)
   * - `warning`: Amber gradient (for warning states)
   * - `error`: Red gradient (for error/critical states)
   */
  variant?: PageHeaderVariant;
  className?: string;
}

/**
 * PageHeader provides an elevated header section with backdrop blur.
 * Supports status-aware gradient backgrounds for conveying page state.
 *
 * @example
 * ```tsx
 * // Default header
 * <PageHeader>
 *   <div className="container max-w-7xl mx-auto px-4 py-10">
 *     <h1>Page Title</h1>
 *   </div>
 * </PageHeader>
 *
 * // Status-aware header
 * <PageHeader variant={hasErrors ? 'error' : 'success'}>
 *   ...
 * </PageHeader>
 * ```
 */
export function PageHeader({ children, variant = 'default', className }: PageHeaderProps) {
  const bgClass = {
    default: 'bg-white/80 dark:bg-zinc-900/80',
    success:
      'bg-gradient-to-r from-emerald-50/80 to-green-50/80 dark:from-emerald-950/30 dark:to-green-950/30',
    warning:
      'bg-gradient-to-r from-amber-50/80 to-yellow-50/80 dark:from-amber-950/30 dark:to-yellow-950/30',
    error:
      'bg-gradient-to-r from-red-50/80 to-orange-50/80 dark:from-red-950/30 dark:to-orange-950/30',
  }[variant];

  return (
    <div className={cn('border-b border-border backdrop-blur-sm', bgClass, className)}>
      {children}
    </div>
  );
}
