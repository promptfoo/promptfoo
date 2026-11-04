import { cn } from '@app/lib/utils';

interface PageContainerProps extends React.ComponentProps<'div'> {
  children: React.ReactNode;
  className?: string;
}

/**
 * PageContainer provides the base background layer for all pages.
 * Uses the shared background and foreground tokens in both themes.
 *
 * @example
 * ```tsx
 * <PageContainer>
 *   <PageHeader>...</PageHeader>
 *   <div className="container mx-auto">...</div>
 * </PageContainer>
 * ```
 */
export function PageContainer({ children, className, ...props }: PageContainerProps) {
  return (
    <div
      className={cn(
        'min-h-[calc(100dvh-var(--nav-height)-var(--update-banner-height,0px))] bg-background text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
