import React, { useCallback } from 'react';

import { Checkbox } from '@app/components/ui/checkbox';
import { Switch } from '@app/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { Info } from 'lucide-react';

interface SettingItemProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: React.ReactElement | null;
  tooltipText?: string;
  disabled?: boolean;
  component?: 'checkbox' | 'switch';
}

const SettingItem = ({
  label,
  checked,
  onChange,
  icon,
  tooltipText,
  disabled = false,
  component = 'checkbox',
}: SettingItemProps) => {
  const labelId = `setting-${label.replace(/\s+/g, '-').toLowerCase()}`;

  const handleCheckboxChange = useCallback(
    (val: boolean | 'indeterminate') => {
      if (!disabled) {
        onChange(Boolean(val));
      }
    },
    [disabled, onChange],
  );

  const handleSwitchChange = useCallback(
    (val: boolean) => {
      if (!disabled) {
        onChange(val);
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
        'p-2.5 mb-1.5 border rounded transition-all',
        checked ? 'border-border/25 bg-primary/[0.03]' : 'border-border/15 bg-transparent',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:bg-primary/[0.06] hover:border-primary/30 hover:-translate-y-px hover:shadow-sm',
      )}
      role="listitem"
    >
      <label
        className={cn(
          'flex items-center gap-2 min-h-9 w-full',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        {component === 'checkbox' ? (
          <Checkbox
            checked={checked}
            onCheckedChange={handleCheckboxChange}
            disabled={disabled}
            aria-labelledby={labelId}
            className="shrink-0"
          />
        ) : (
          <Switch
            checked={checked}
            onCheckedChange={handleSwitchChange}
            disabled={disabled}
            aria-labelledby={labelId}
            className="shrink-0"
          />
        )}

        <div className="flex items-center gap-1.5 py-0.5 flex-1">
          {icon && (
            <div className="text-primary flex items-center justify-center text-lg min-w-5 mr-0.5">
              {icon}
            </div>
          )}
          <span id={labelId} className="text-sm leading-normal tracking-[0.01em] text-foreground">
            {label}
          </span>
          {tooltipText && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="p-0.5 ml-0.5 text-primary/70 hover:text-primary hover:bg-primary/10 rounded"
                  aria-label={`Information about ${label}`}
                  onClick={handleStopPropagation}
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{tooltipText}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </label>
    </div>
  );
};

export default React.memo(SettingItem);
