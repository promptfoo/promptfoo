import type React from 'react';

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
  const nextButton = (
    <Button onClick={onNext} disabled={nextDisabled} className="mr-[72px] px-6 py-2">
      {nextLabel}
      <ChevronRight className="ml-1 h-4 w-4" />
    </Button>
  );

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* Header - compact, stable, no scroll behavior */}
      <header className="shrink-0 border-b border-border bg-background px-6 py-4">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </header>

      {/* Content */}
      <div className="relative h-0 flex-1 overflow-auto">
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
                <ChevronLeft className="mr-1 h-4 w-4" />
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
