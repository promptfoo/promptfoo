import React, { useCallback } from 'react';

import { Slider } from '@app/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { Info } from 'lucide-react';

interface CompactSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onChangeCommitted?: (value: number) => void;
  min: number;
  max: number;
  tooltipText?: string;
  unit?: string;
  unlimited?: boolean;
}

const CompactSlider = ({
  label,
  value,
  onChange,
  onChangeCommitted,
  min,
  max,
  tooltipText,
  unit,
  unlimited = false,
}: CompactSliderProps) => {
  const labelId = `compact-slider-${label.replace(/\s+/g, '-').toLowerCase()}`;

  const displayValue =
    unlimited && value >= max ? 'Unlimited' : `${value}${unit ? ` ${unit}` : ''}`;

  const handleValueChange = useCallback(
    ([newValue]: number[]) => {
      onChange(newValue);
    },
    [onChange],
  );

  const handleValueCommit = useCallback(
    ([newValue]: number[]) => {
      onChangeCommitted?.(newValue);
    },
    [onChangeCommitted],
  );

  return (
    <div className="[&:not(:last-child)]:mb-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center">
          <label id={labelId} className="text-[0.8125rem] leading-normal">
            {label}
          </label>
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
        <span className="text-xs text-muted-foreground font-medium tabular-nums">
          {displayValue}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={handleValueChange}
        onValueCommit={onChangeCommitted ? handleValueCommit : undefined}
        min={min}
        max={max}
        step={1}
        aria-labelledby={labelId}
        className="py-2"
      />
    </div>
  );
};

export default React.memo(CompactSlider);
