import React, { useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Input } from '@app/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { isJavascriptFile } from '@promptfoo/util/fileExtensions';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface ValidationError {
  message: string;
}

interface ExtensionEditorProps {
  extensions: string[];
  onExtensionsChange: (extensions: string[]) => void;
  onValidationChange?: (hasErrors: boolean) => void;
}

const FILE_PROTOCOL_PREFIX = 'file://';

const validatePath = (value: string, isTyping: boolean): ValidationError | undefined => {
  if (!value) {
    return undefined;
  }
  if (!value.trim()) {
    return undefined;
  }

  const withoutPrefix = value.replace(FILE_PROTOCOL_PREFIX, '');
  const [filePath, functionName] = withoutPrefix.split(':');

  // During typing, only show format error if they've already typed a colon
  if (isTyping && !value.includes(':')) {
    return undefined;
  }

  if (!filePath || !functionName) {
    return { message: 'Format: /path/to/file.js:hookFunction' };
  }

  // During typing, don't show file type error until they've finished typing the file extension
  if (!isTyping && !isJavascriptFile(filePath) && !filePath.endsWith('.py')) {
    return { message: 'Must be a JavaScript/TypeScript or Python file' };
  }

  return undefined;
};

export default function ExtensionEditor({
  extensions,
  onExtensionsChange,
  onValidationChange,
}: ExtensionEditorProps) {
  const [isTyping, setIsTyping] = React.useState(false);
  const [isExpanded, setIsExpanded] = useState(!!extensions.length);
  const typingTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const error = React.useMemo(() => validatePath(extensions[0], isTyping), [extensions, isTyping]);

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setIsTyping(true);

      // Clear any existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set a new timeout to mark typing as finished
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
      }, 500);
      const validationResult = validatePath(newValue, true);
      onValidationChange?.(!!validationResult);

      onExtensionsChange([`${FILE_PROTOCOL_PREFIX}${newValue}`]);
    },
    [onExtensionsChange, onValidationChange],
  );

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="mt-4">
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-background p-4 hover:bg-muted/50">
        <div className="text-left">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Extension Hook</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="mb-2">Run custom code at these lifecycle points:</p>
                <ul className="list-disc pl-4 text-sm">
                  <li>beforeAll - Start of test suite</li>
                  <li>afterAll - End of test suite</li>
                  <li>beforeEach - Before each test</li>
                  <li>afterEach - After each test</li>
                </ul>
                <a
                  href="https://www.promptfoo.dev/docs/configuration/reference/#extension-hooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block text-primary hover:underline"
                >
                  View documentation
                </a>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-sm text-muted-foreground">
            {extensions.length > 0
              ? extensions[0]
              : 'Add custom code to run at specific points in the evaluation lifecycle'}
          </p>
        </div>
        <ChevronDown className={cn('h-5 w-5 transition-transform', isExpanded && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-2">
        <p className="mb-4">
          See{' '}
          <a
            href="https://www.promptfoo.dev/docs/configuration/reference/#extension-hooks"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            docs
          </a>{' '}
          for more details.
        </p>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 select-none text-sm text-muted-foreground">
            file://
          </span>
          <Input
            className={cn('pl-14', error && 'border-destructive')}
            placeholder="/path/to/hook.js:extensionHook"
            value={extensions[0]?.replace(FILE_PROTOCOL_PREFIX, '') || ''}
            onChange={handleChange}
          />
        </div>
        {error && <p className="mt-1 text-sm text-destructive">{error.message}</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}
