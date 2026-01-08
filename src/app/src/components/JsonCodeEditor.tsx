import 'prismjs/components/prism-json';

import React from 'react';

import { Button } from '@app/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import { AlignLeft } from 'lucide-react';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';

const highlightJSON = (code: string): string => {
  try {
    const grammar = Prism.languages.json;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'json');
  } catch {
    return code;
  }
};

export interface JsonCodeEditorProps {
  /** The current JSON string value */
  value: string;
  /** Callback when the value changes */
  onChange: (value: string) => void;
  /** Whether there's currently a JSON error (controls error styling and format button state) */
  hasError?: boolean;
  /** Placeholder text to show when empty */
  placeholder?: string;
  /** Minimum height of the editor */
  minHeight?: string;
  /** Additional className for the container */
  className?: string;
  /** Label for the header (e.g., "JSON") */
  headerLabel?: string;
  /** Whether to show the header bar (default: true) */
  showHeader?: boolean;
  /** Whether to show the format button (default: true) */
  showFormatButton?: boolean;
  /** Custom format button variant */
  formatButtonVariant?: 'ghost' | 'outline';
  /** Position of format button - 'header' puts it in header bar, 'overlay' puts it over the editor */
  formatButtonPosition?: 'header' | 'overlay';
}

/**
 * A JSON code editor with syntax highlighting and optional format button.
 * When the format button is clicked with invalid JSON, shows an error toast.
 */
export const JsonCodeEditor: React.FC<JsonCodeEditorProps> = ({
  value,
  onChange,
  hasError = false,
  placeholder,
  minHeight = '120px',
  className,
  headerLabel = 'JSON',
  showHeader = true,
  showFormatButton = true,
  formatButtonVariant = 'ghost',
  formatButtonPosition = 'header',
}) => {
  const { showToast } = useToast();

  const handleFormatJson = () => {
    if (!value.trim()) {
      return;
    }

    try {
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 2);
      onChange(formatted);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid JSON syntax';
      showToast(`Cannot format: ${errorMessage}`, 'error');
    }
  };

  const formatButton = showFormatButton && (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={formatButtonVariant}
          size={formatButtonPosition === 'header' ? 'sm' : 'icon'}
          onClick={handleFormatJson}
          disabled={!value.trim()}
          className={cn(
            formatButtonPosition === 'header' && 'h-7 px-2',
            formatButtonPosition === 'overlay' &&
              'absolute right-1 top-1 z-10 size-8 bg-muted/50 hover:bg-muted',
            hasError && 'text-destructive hover:text-destructive',
          )}
        >
          <AlignLeft className="size-4" />
          {formatButtonPosition === 'header' && <span className="ml-1 text-xs">Format</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hasError ? 'Fix JSON errors to format' : 'Format JSON'}</TooltipContent>
    </Tooltip>
  );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border',
        hasError ? 'border-destructive' : 'border-border',
        className,
      )}
    >
      {showHeader && (
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">{headerLabel}</span>
          {formatButtonPosition === 'header' && formatButton}
        </div>
      )}
      <div className="relative bg-white dark:bg-zinc-950">
        {formatButtonPosition === 'overlay' && formatButton}
        <Editor
          value={value}
          onValueChange={onChange}
          highlight={highlightJSON}
          padding={12}
          placeholder={placeholder}
          style={{
            fontFamily: 'ui-monospace, "Fira Code", monospace',
            fontSize: 13,
            minHeight,
          }}
        />
      </div>
    </div>
  );
};

export default JsonCodeEditor;
