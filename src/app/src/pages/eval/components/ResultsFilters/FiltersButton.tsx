import { forwardRef } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { SlidersHorizontal } from 'lucide-react';

interface FiltersButtonProps {
  appliedFiltersCount: number;
  onClick: () => void;
}

const FiltersButton = forwardRef<HTMLButtonElement, FiltersButtonProps>(
  ({ appliedFiltersCount, onClick }, ref) => {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            ref={ref}
            className="relative p-2 rounded hover:bg-muted transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {appliedFiltersCount > 0 && (
              <span
                className={cn(
                  'absolute -top-1 -right-1 min-w-[16px] h-4 px-1',
                  'flex items-center justify-center',
                  'bg-primary text-primary-foreground text-[0.75rem] font-medium',
                  'rounded-full',
                )}
              >
                {appliedFiltersCount}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Filters</TooltipContent>
      </Tooltip>
    );
  },
);

FiltersButton.displayName = 'FiltersButton';

export default FiltersButton;
