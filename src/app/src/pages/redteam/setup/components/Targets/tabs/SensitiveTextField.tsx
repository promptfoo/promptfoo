import React, { useId, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { cn } from '@app/lib/utils';
import { Eye, EyeOff } from 'lucide-react';

export interface SensitiveTextFieldProps {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  required?: boolean;
}

/**
 * An Input component for sensitive input (passwords, passphrases, etc.)
 * with built-in visibility toggle functionality
 */
const SensitiveTextField: React.FC<SensitiveTextFieldProps> = ({
  value,
  onChange,
  placeholder,
  className,
  id,
  disabled,
  label,
  helperText,
  required,
}) => {
  const [showValue, setShowValue] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helperTextId = helperText ? `${inputId}-help` : undefined;
  const toggleLabel = `${showValue ? 'Hide' : 'Show'} ${label ?? 'sensitive value'}`;

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label htmlFor={inputId}>
          {label}
          {required && (
            <span aria-hidden="true" className="ml-1 text-destructive">
              *
            </span>
          )}
        </Label>
      )}
      <div className="relative">
        <Input
          id={inputId}
          type={showValue ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="pr-10"
          disabled={disabled}
          required={required}
          aria-describedby={helperTextId}
          // Block browser/password-manager autofill for TLS passphrases, API
          // secrets, and similar. These are not login passwords; saving them
          // as such leaks them outside the app.
          autoComplete="new-password"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShowValue(!showValue)}
          onMouseDown={(e) => e.preventDefault()}
          aria-label={toggleLabel}
          disabled={disabled}
        >
          {showValue ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
      {helperText && (
        <p id={helperTextId} className="text-sm text-muted-foreground">
          {helperText}
        </p>
      )}
    </div>
  );
};

export default SensitiveTextField;
