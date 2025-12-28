import { cn } from '@app/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * PageContainer provides the base background layer for all pages.
 * Uses a subtle tinted background (zinc-50/950) instead of pure white/black.
 *
 * @example
 * ```tsx
 * <PageContainer>
 *   <PageHeader>...</PageHeader>
 *   <div className="container mx-auto">...</div>
 * </PageContainer>
 * ```
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn('min-h-screen bg-zinc-50 dark:bg-zinc-950', className)}>{children}</div>
  );
}
