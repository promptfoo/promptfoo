import React from 'react';

import { Checkbox } from '@app/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { Info } from 'lucide-react';

interface CompactToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tooltipText?: string;
  disabled?: boolean;
}

const CompactToggle = ({
  label,
  checked,
  onChange,
  tooltipText,
  disabled = false,
}: CompactToggleProps) => {
  const labelId = `compact-toggle-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div
      className={cn(
        'flex items-center min-h-8 py-1 px-1 -mx-1 rounded transition-colors',
        disabled ? 'opacity-50 cursor-default' : 'cursor-pointer hover:bg-muted/50',
      )}
      role="listitem"
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => !disabled && onChange(value === true)}
        disabled={disabled}
        className="mr-2"
        aria-labelledby={labelId}
      />
      <span
        id={labelId}
        className={cn(
          'flex-1 text-[0.8125rem] leading-normal select-none whitespace-nowrap',
          disabled ? 'text-muted-foreground' : '',
        )}
      >
        {label}
      </span>
      {tooltipText && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              className="p-0.5 ml-1 text-muted-foreground/40 hover:text-muted-foreground"
              aria-label={`Information about ${label}`}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{tooltipText}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

export default React.memo(CompactToggle);
