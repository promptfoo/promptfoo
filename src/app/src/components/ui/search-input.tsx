import * as React from 'react';

import { cn } from '@app/lib/utils';
import { Search, X } from 'lucide-react';
import { Input } from './input';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  clearLabel?: string;
  containerClassName?: string;
}

function SearchInput({
  value,
  onChange,
  onClear,
  clearLabel,
  className,
  containerClassName,
  placeholder = 'Search...',
  ...props
}: SearchInputProps) {
  const accessibleLabel =
    props['aria-label'] ?? (props['aria-labelledby'] ? undefined : placeholder);
  const resolvedClearLabel =
    clearLabel ?? (accessibleLabel ? `Clear ${accessibleLabel.toLowerCase()}` : 'Clear search');

  const handleClear = () => {
    onChange('');
    onClear?.();
  };

  return (
    <div className={cn('relative', containerClassName)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder={placeholder}
        aria-label={accessibleLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('pl-9 pr-8', className)}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
          aria-label={resolvedClearLabel}
        >
          <X className="size-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

export { SearchInput };
