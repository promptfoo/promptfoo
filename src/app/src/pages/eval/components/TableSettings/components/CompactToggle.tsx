import React, { useCallback } from 'react';

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

  const handleClick = useCallback(() => {
    if (!disabled) {
      onChange(!checked);
    }
  }, [disabled, checked, onChange]);

  const handleCheckboxChange = useCallback(
    (value: boolean | 'indeterminate') => {
      if (!disabled) {
        onChange(value === true);
      }
    },
    [disabled, onChange],
  );

  const handleStopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      className={cn(
        'flex items-center min-h-8 p-1 -mx-1 rounded transition-colors',
        disabled ? 'opacity-50 cursor-default' : 'cursor-pointer hover:bg-muted/50',
      )}
      role="listitem"
      onClick={handleClick}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={handleCheckboxChange}
        disabled={disabled}
        className="mr-2"
        aria-labelledby={labelId}
        onClick={handleStopPropagation}
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
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{tooltipText}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

export default React.memo(CompactToggle);
