import { useEffect, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SIDEBAR_WIDTH } from '../constants';

interface PageWrapperProps {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  backDisabled?: boolean;
  warningMessage?: string;
}

export default function PageWrapper({
  title,
  description,
  children,
  onNext,
  onBack,
  nextLabel = 'Next',
  backLabel = 'Back',
  nextDisabled = false,
  backDisabled = false,
  warningMessage,
}: PageWrapperProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastToggleTimeRef = useRef<number>(0);

  // Scroll behavior configuration
  // Minimize when user has scrolled down a bit; expand only when at the very top
  const MINIMIZE_SCROLLTOP = 24;
  const EXPAND_AT_TOP_SCROLLTOP = 1; // treat 0–1px as top
  const TOGGLE_COOLDOWN_MS = 250; // brief cooldown to absorb layout changes and transitions

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    const applyStateFromMetrics = () => {
      const scrollTop = contentElement.scrollTop;
      const now = performance.now();

      // Cooldown to avoid immediate re-toggling due to layout shift
      if (now - lastToggleTimeRef.current < TOGGLE_COOLDOWN_MS) {
        return;
      }

      setIsMinimized((prev) => {
        // Expand only at top
        if (scrollTop <= EXPAND_AT_TOP_SCROLLTOP) {
          if (prev) {
            lastToggleTimeRef.current = now;
          }
          return false;
        }
        // Minimize when user has scrolled away from top a bit
        if (!prev && scrollTop >= MINIMIZE_SCROLLTOP) {
          lastToggleTimeRef.current = now;
          return true;
        }
        return prev;
      });
    };

    // Initial evaluation in case the container is already scrolled
    applyStateFromMetrics();

    const onScroll = () => applyStateFromMetrics();
    const onResize = () => applyStateFromMetrics();

    contentElement.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      contentElement.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const nextButton = (
    <Button onClick={onNext} disabled={nextDisabled} className="mr-[72px] px-6 py-2">
      {nextLabel}
      <ChevronRight className="ml-1 size-4" />
    </Button>
  );

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          'sticky top-0 z-10 border-b border-border backdrop-blur-sm',
          'bg-background/90 dark:bg-background/90',
          'transition-[padding] duration-200 ease-in-out',
          isMinimized ? 'px-6 py-3' : 'p-6',
        )}
      >
        <h1
          className={cn(
            'font-semibold text-foreground transition-[font-size] duration-200 ease-in-out',
            isMinimized ? 'mb-0 text-xl' : 'mb-2 text-3xl',
          )}
        >
          {title}
        </h1>
        {description && (
          <div
            className={cn(
              'text-base text-muted-foreground transition-all duration-200 ease-in-out',
              isMinimized ? 'max-h-0 overflow-hidden opacity-0' : 'max-h-[100px] opacity-100',
            )}
          >
            {description}
          </div>
        )}
      </div>

      {/* Content */}
      <div ref={contentRef} className="relative h-0 flex-1 overflow-auto">
        <div className="p-6 pb-48">{children}</div>
      </div>

      {/* Navigation */}
      {(onBack || onNext) && (
        <div
          className="fixed bottom-0 z-[15] flex items-center justify-between border-t border-border bg-card/95 px-6 py-4 backdrop-blur-sm"
          style={{ left: SIDEBAR_WIDTH, right: 0 }}
        >
          <div>
            {onBack && (
              <Button variant="outline" onClick={onBack} disabled={backDisabled} className="px-6">
                <ChevronLeft className="mr-1 size-4" />
                {backLabel}
              </Button>
            )}
          </div>
          <div>
            {onNext &&
              (warningMessage ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        'inline-block',
                        nextDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
                      )}
                    >
                      {nextButton}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">{warningMessage}</TooltipContent>
                </Tooltip>
              ) : (
                nextButton
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
