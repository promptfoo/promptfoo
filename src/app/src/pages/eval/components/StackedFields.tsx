import { cn } from '@app/lib/utils';

interface StackedFieldsProps {
  fields: Record<string, string | number | boolean | null | object>;
  title?: string;
}

/**
 * Renders a flat object as stacked labeled fields.
 * Useful for displaying multiple input variables or structured data.
 */
export function StackedFields({ fields, title }: StackedFieldsProps) {
  const entries = Object.entries(fields);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div>
      {title && <h4 className="mb-1.5 text-sm font-medium">{title}</h4>}
      <div className="flex flex-col gap-1.5">
        {entries.map(([key, value]) => {
          const displayValue =
            value === null
              ? 'null'
              : value === ''
                ? '(empty)'
                : typeof value === 'object'
                  ? JSON.stringify(value, null, 2)
                  : String(value);

          const isEmptyOrNull = value === null || value === '';
          const isComplexValue = typeof value === 'object' && value !== null;

          return (
            <div key={key}>
              <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {key}
              </div>
              {isComplexValue ? (
                <pre
                  className={cn(
                    'm-0 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed',
                    isEmptyOrNull && 'italic opacity-50',
                  )}
                >
                  {displayValue}
                </pre>
              ) : (
                <div
                  className={cn(
                    'break-words text-sm leading-relaxed [overflow-wrap:anywhere]',
                    isEmptyOrNull && 'italic opacity-50',
                  )}
                >
                  {displayValue}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
