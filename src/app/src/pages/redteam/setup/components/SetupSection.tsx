import React from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { cn } from '@app/lib/utils';
import { ChevronDown } from 'lucide-react';

interface SetupSectionProps {
  title: string | React.ReactNode;
  description?: string;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: React.ReactNode;
  className?: string;
  /**
   * Optional content to render after the title (e.g., icons, badges, tooltips)
   */
  headerAction?: React.ReactNode;
}

/**
 * Reusable collapsible section component for the redteam setup UI.
 * Provides consistent styling and behavior across all setup pages.
 */
export function SetupSection({
  title,
  description,
  isExpanded,
  onExpandedChange,
  children,
  className,
  headerAction,
}: SetupSectionProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onExpandedChange} className={className}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50">
        <div className="flex items-center gap-2 text-left">
          {typeof title === 'string' ? (
            <div>
              <h3 className="font-semibold">{title}</h3>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          ) : (
            title
          )}
          {headerAction}
        </div>
        <ChevronDown
          className={cn('size-5 shrink-0 transition-transform', isExpanded && 'rotate-180')}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
