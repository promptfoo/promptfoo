import React, { useCallback, useEffect, useState } from 'react';

import { Input } from '@app/components/ui/input';
import { Slider } from '@app/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { Info } from 'lucide-react';
import { useDebounce } from 'use-debounce';

interface EnhancedRangeSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  label: string;
  unit?: string;
  unlimited?: boolean;
  onChangeCommitted?: (value: number) => void;
  disabled?: boolean;
  tooltipText?: string;
  icon?: React.ReactNode;
}

const EnhancedRangeSlider = ({
  value,
  onChange,
  min,
  max,
  label,
  unit = '',
  unlimited,
  onChangeCommitted,
  disabled = false,
  tooltipText,
  icon,
}: EnhancedRangeSliderProps) => {
  // Ensure value is always a valid number
  const safeValue = value === null || value === undefined || Number.isNaN(value) ? min : value;
  const [localValue, setLocalValue] = useState(safeValue);
  const [debouncedValue] = useDebounce(localValue, 150);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const isUnlimited = unlimited && safeValue === max;
  const labelId = `slider-label-${label.replace(/\s+/g, '-').toLowerCase()}`;

  // Update state when external value changes
  useEffect(() => {
    if (debouncedValue !== safeValue) {
      onChange(debouncedValue);
    }
  }, [debouncedValue, onChange, safeValue]);

  // Safely update input value when external value changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    setLocalValue(safeValue);
    setInputValue(isUnlimited ? 'Unlimited' : String(safeValue));
  }, [safeValue, max, unlimited, isUnlimited]);

  const handleSliderChange = useCallback(
    (values: number[]) => {
      const newSafeValue = values[0];
      setLocalValue(newSafeValue);
      setInputValue(unlimited && newSafeValue === max ? 'Unlimited' : String(newSafeValue));
    },
    [max, unlimited],
  );

  const handleSliderCommit = useCallback(
    (values: number[]) => {
      if (onChangeCommitted) {
        onChangeCommitted(values[0]);
      }
    },
    [onChangeCommitted],
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  const handleInputBlur = useCallback(() => {
    setIsEditing(false);
    if (inputValue === 'Unlimited' && unlimited) {
      setLocalValue(max);
      onChange(max);
      return;
    }

    const parsedValue = Number.parseInt(inputValue, 10);
    if (Number.isNaN(parsedValue)) {
      // Revert to current value if input is invalid
      setInputValue(isUnlimited ? 'Unlimited' : String(localValue));
    } else {
      const clampedValue = Math.min(Math.max(parsedValue, min), max);
      setLocalValue(clampedValue);
      setInputValue(String(clampedValue));
      onChange(clampedValue);
    }
  }, [inputValue, unlimited, max, onChange, isUnlimited, localValue, min]);

  const handleEditClick = useCallback(() => {
    if (!disabled) {
      setIsEditing(true);
    }
  }, [disabled]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleInputBlur();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
        setInputValue(isUnlimited ? 'Unlimited' : String(localValue));
      }
    },
    [handleInputBlur, isUnlimited, localValue],
  );

  return (
    <div
      className={cn(
        'max-w-full mb-4 rounded p-2.5 pl-2 transition-opacity',
        disabled ? 'opacity-50' : 'hover:bg-background/50',
      )}
      role="group"
      aria-labelledby={labelId}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5 mb-2">
        {icon && <div className="text-primary flex items-center text-lg">{icon}</div>}
        <span id={labelId} className="font-medium flex-1">
          {label}
        </span>

        {/* Editable value box */}
        <div
          className={cn(
            'border rounded px-2.5 py-1 min-w-20 text-center cursor-text transition-all',
            isEditing
              ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
              : 'border-border/30 hover:border-primary hover:bg-primary/[0.02]',
          )}
          onClick={handleEditClick}
          role="textbox"
          aria-label={`Enter ${label.toLowerCase()} value`}
        >
          {isEditing ? (
            <div className="flex items-center">
              <Input
                autoFocus
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                className="h-auto p-0 text-center text-[0.95rem] font-medium border-0 shadow-none focus-visible:ring-0"
                aria-label={`Enter ${label.toLowerCase()} value`}
              />
              {unit && <span className="text-sm text-muted-foreground ml-1">{unit}</span>}
            </div>
          ) : (
            <span className="font-medium">
              {isUnlimited ? 'Unlimited' : `${localValue}${unit}`}
            </span>
          )}
        </div>

        {tooltipText && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="p-1 text-primary/70 hover:text-primary hover:bg-primary/10 rounded"
                aria-label={`Information about ${label.toLowerCase()}`}
              >
                <Info className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{tooltipText}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Slider with marks */}
      <div className="relative pt-1 pb-5">
        <Slider
          value={[localValue]}
          onValueChange={handleSliderChange}
          onValueCommit={onChangeCommitted ? handleSliderCommit : undefined}
          min={min}
          max={max}
          step={1}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={localValue}
          aria-valuetext={isUnlimited ? 'Unlimited' : `${localValue}${unit}`}
        />
        {/* Manual marks below the slider */}
        <div className="flex justify-between mt-1 text-xs text-muted-foreground">
          <span>{`${min}${unit}`}</span>
          <span>{unlimited ? 'Unlimited' : `${max}${unit}`}</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(EnhancedRangeSlider);
