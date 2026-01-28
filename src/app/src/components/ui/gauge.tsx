import * as React from 'react';

import { cn } from '@app/lib/utils';

interface GaugeProps extends Omit<React.ComponentProps<'div'>, 'value'> {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  showValue?: boolean;
  formatValue?: (value: number) => string;
}

/**
 * A semicircular gauge component that displays a percentage value.
 * Uses SVG for rendering with customizable colors via CSS variables.
 */
export function Gauge({
  value,
  max = 100,
  size = 100,
  strokeWidth = 10,
  className,
  showValue = true,
  formatValue = (v) => `${Math.round(v)}%`,
  ...props
}: GaugeProps) {
  // Normalize value to 0-100 range
  const normalizedValue = Math.min(Math.max((value / max) * 100, 0), 100);

  // SVG arc calculations for a semicircle (180 degrees, from -90 to 90)
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // Half circle circumference
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (normalizedValue / 100) * circumference;

  // Center coordinates
  const cx = size / 2;
  const cy = size / 2;

  // Arc path for semicircle (bottom half)
  const arcPath = `
    M ${cx - radius} ${cy}
    A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}
  `;

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      role="meter"
      aria-valuenow={Number.isNaN(value) ? undefined : value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label="Progress gauge"
      {...props}
    >
      <svg
        width={size}
        height={size / 2 + strokeWidth / 2}
        viewBox={`0 0 ${size} ${size / 2 + strokeWidth / 2}`}
        className="overflow-visible"
        aria-hidden="true"
      >
        {/* Background arc */}
        <path
          d={arcPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="text-muted/30"
        />
        {/* Value arc */}
        <path
          d={arcPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className="text-primary transition-all duration-500"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
          }}
        />
      </svg>
      {showValue && (
        <div
          className="absolute text-lg font-semibold"
          style={{
            bottom: strokeWidth / 2,
          }}
        >
          {Number.isNaN(value) ? '-' : formatValue(value)}
        </div>
      )}
    </div>
  );
}
