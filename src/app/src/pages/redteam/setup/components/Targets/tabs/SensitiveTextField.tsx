import React, { useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { cn } from '@app/lib/utils';
import { Eye, EyeOff } from 'lucide-react';

interface SensitiveTextFieldProps {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
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
}) => {
  const [showValue, setShowValue] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={showValue ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cn('pr-10', className)}
        disabled={disabled}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
        onClick={() => setShowValue(!showValue)}
        onMouseDown={(e) => e.preventDefault()}
        aria-label="toggle password visibility"
        disabled={disabled}
      >
        {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
};

export default SensitiveTextField;
