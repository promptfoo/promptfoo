import * as React from 'react';
import { cn } from '@app/lib/utils';
import { Check, Minus } from 'lucide-react';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate, checked, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    const resolvedRef = (ref as React.RefObject<HTMLInputElement>) || innerRef;

    React.useEffect(() => {
      if (resolvedRef.current) {
        resolvedRef.current.indeterminate = indeterminate ?? false;
      }
    }, [resolvedRef, indeterminate]);

    return (
      <label className="relative inline-flex items-center">
        <input
          type="checkbox"
          ref={resolvedRef}
          checked={checked}
          className="peer sr-only"
          {...props}
        />
        <div
          className={cn(
            'relative h-4 w-4 shrink-0 rounded border border-border cursor-pointer',
            'peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            'peer-checked:bg-primary peer-checked:border-primary peer-checked:text-primary-foreground',
            'hover:border-primary/50 hover:bg-muted/50',
            'peer-checked:hover:bg-primary/90',
            'transition-colors',
            indeterminate && 'bg-primary border-primary text-primary-foreground',
            className,
          )}
        >
          {(indeterminate || checked) && (
            <span className="absolute inset-0 flex items-center justify-center">
              {indeterminate ? (
                <Minus className="h-3 w-3" />
              ) : (
                <Check className="h-3 w-3" />
              )}
            </span>
          )}
        </div>
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
