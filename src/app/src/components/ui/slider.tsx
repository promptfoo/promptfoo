import * as React from 'react';

import { cn } from '@app/lib/utils';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Info } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

/**
 * Slider - A control for selecting a value from a range.
 *
 * Built on Radix UI Slider primitive with full keyboard navigation and accessibility.
 *
 * @example
 * // Basic usage
 * <Slider value={[50]} onValueChange={setValue} min={0} max={100} />
 *
 * @example
 * // With step and marks
 * <Slider
 *   value={[value]}
 *   onValueChange={(v) => setValue(v[0])}
 *   min={0}
 *   max={100}
 *   step={10}
 *   showMarks
 * />
 *
 * @example
 * // Range slider with two handles
 * <Slider value={[25, 75]} onValueChange={setRange} min={0} max={100} />
 *
 * @example
 * // With SliderWithLabel for convenience
 * <SliderWithLabel
 *   label="Volume"
 *   value={volume}
 *   onValueChange={setVolume}
 *   min={0}
 *   max={100}
 *   formatValue={(v) => `${v}%`}
 * />
 */

interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  /**
   * Size variant of the slider.
   * @default "default"
   */
  size?: 'sm' | 'default';
  /**
   * Whether to show tick marks at each step.
   * @default false
   */
  showMarks?: boolean;
}

function Slider({
  className,
  size = 'default',
  showMarks = false,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step = 1,
  ref,
  ...props
}: SliderProps) {
  // Calculate marks for display
  const marks = React.useMemo(() => {
    if (!showMarks || step <= 0) return [];
    const marks: number[] = [];
    for (let i = min; i <= max; i += step) {
      marks.push(i);
    }
    return marks;
  }, [showMarks, min, max, step]);

  const currentValue = value ?? defaultValue ?? [min];

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex w-full touch-none select-none items-center',
        size === 'sm' ? 'h-4' : 'h-5',
        className,
      )}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      step={step}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          'relative w-full grow overflow-hidden rounded-full bg-muted',
          size === 'sm' ? 'h-1' : 'h-1.5',
        )}
      >
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
        {/* Marks */}
        {showMarks &&
          marks.map((mark) => {
            const percent = ((mark - min) / (max - min)) * 100;
            // Don't show marks at the exact position of thumbs or at 0%/100%
            const isAtThumb = currentValue.some((v) => Math.abs(v - mark) < step * 0.1);
            if (percent === 0 || percent === 100 || isAtThumb) return null;
            return (
              <span
                key={mark}
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 rounded-full bg-border',
                  size === 'sm' ? 'h-1 w-1' : 'h-1.5 w-1.5',
                )}
                style={{ left: `${percent}%`, transform: 'translate(-50%, -50%)' }}
              />
            );
          })}
      </SliderPrimitive.Track>
      {/* Render a thumb for each value */}
      {currentValue.map((_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          aria-label={props['aria-label']}
          className={cn(
            'block rounded-full border-2 border-primary bg-background shadow-sm',
            'ring-offset-background transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:pointer-events-none disabled:opacity-50',
            'hover:bg-primary/10',
            size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}
Slider.displayName = 'Slider';

/**
 * SliderWithLabel - A convenience component that combines Slider with a label and value display.
 *
 * Provides a consistent layout for sliders with labels and formatted values.
 */
interface SliderWithLabelProps extends Omit<SliderProps, 'value' | 'onValueChange' | 'onValueCommit'> {
  /**
   * The label text for the slider.
   */
  label: React.ReactNode;
  /**
   * Optional description text shown below the label.
   */
  description?: React.ReactNode;
  /**
   * Optional tooltip text shown when hovering over an info icon.
   */
  tooltipText?: React.ReactNode;
  /**
   * Optional icon shown before the label.
   */
  icon?: React.ReactNode;
  /**
   * Current value (single number, not array).
   */
  value: number;
  /**
   * Callback when value changes.
   */
  onValueChange: (value: number) => void;
  /**
   * Callback when value change is committed (on mouse up / touch end).
   */
  onValueCommit?: (value: number) => void;
  /**
   * Format the displayed value.
   * @default (v) => String(v)
   */
  formatValue?: (value: number) => string;
  /**
   * Whether to show the current value.
   * @default true
   */
  showValue?: boolean;
  /**
   * Position of the value display.
   * @default "right"
   */
  valuePosition?: 'right' | 'below';
}

function SliderWithLabel({
  className,
  label,
  description,
  tooltipText,
  icon,
  value,
  onValueChange,
  onValueCommit,
  formatValue = (v) => String(v),
  showValue = true,
  valuePosition = 'right',
  size = 'default',
  disabled,
  ...props
}: SliderWithLabelProps) {
  const id = React.useId();

  const handleValueChange = (values: number[]) => {
    onValueChange(values[0]);
  };

  const handleValueCommit = (values: number[]) => {
    onValueCommit?.(values[0]);
  };

  return (
    <div
      className={cn('grid gap-2', disabled && 'opacity-50', className)}
      role="group"
      aria-labelledby={id}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-0.5 min-w-0">
          <div className="flex items-center gap-1.5">
            {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
            <label
              id={id}
              className={cn(
                'font-medium leading-none',
                size === 'sm' ? 'text-sm' : 'text-base',
                disabled && 'cursor-not-allowed',
              )}
            >
              {label}
            </label>
            {tooltipText && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info
                    className={cn(
                      'shrink-0 text-muted-foreground cursor-help',
                      size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {tooltipText}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {description && (
            <span className="text-sm text-muted-foreground leading-snug">{description}</span>
          )}
        </div>
        {showValue && valuePosition === 'right' && (
          <span
            className={cn(
              'shrink-0 font-medium tabular-nums text-muted-foreground',
              size === 'sm' ? 'text-sm' : 'text-base',
            )}
          >
            {formatValue(value)}
          </span>
        )}
      </div>
      <Slider
        value={[value]}
        onValueChange={handleValueChange}
        onValueCommit={handleValueCommit}
        size={size}
        disabled={disabled}
        aria-label={typeof label === 'string' ? label : undefined}
        aria-labelledby={typeof label !== 'string' ? id : undefined}
        {...props}
      />
      {showValue && valuePosition === 'below' && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatValue(props.min ?? 0)}</span>
          <span className="font-medium">{formatValue(value)}</span>
          <span>{formatValue(props.max ?? 100)}</span>
        </div>
      )}
    </div>
  );
}
SliderWithLabel.displayName = 'SliderWithLabel';

/**
 * RangeSlider - A convenience wrapper for Slider with two handles.
 *
 * For selecting a range of values.
 */
interface RangeSliderProps extends Omit<SliderProps, 'value' | 'onValueChange' | 'defaultValue'> {
  /**
   * Current range value [min, max].
   */
  value: [number, number];
  /**
   * Callback when range changes.
   */
  onValueChange: (value: [number, number]) => void;
  /**
   * Callback when range change is committed.
   */
  onValueCommit?: (value: [number, number]) => void;
  /**
   * Default range value.
   */
  defaultValue?: [number, number];
}

function RangeSlider({
  value,
  onValueChange,
  onValueCommit,
  defaultValue,
  ...props
}: RangeSliderProps) {
  const handleValueChange = (values: number[]) => {
    onValueChange([values[0], values[1]]);
  };

  const handleValueCommit = (values: number[]) => {
    onValueCommit?.([values[0], values[1]]);
  };

  return (
    <Slider
      value={value}
      onValueChange={handleValueChange}
      onValueCommit={handleValueCommit}
      defaultValue={defaultValue}
      {...props}
    />
  );
}
RangeSlider.displayName = 'RangeSlider';

export { Slider, SliderWithLabel, RangeSlider };
