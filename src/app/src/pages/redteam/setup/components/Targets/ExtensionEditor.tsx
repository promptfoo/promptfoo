import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';

import { HelperText } from '@app/components/ui/helper-text';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { cn } from '@app/lib/utils';
import { isJavascriptFile } from '@promptfoo/util/fileExtensions';
import { SetupSection } from '../SetupSection';

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
    return { message: 'Incorrect format. Must be of the format /path/to/file.js:hookFunction' };
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
  const [isTyping, setIsTyping] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const error = useMemo(() => validatePath(extensions[0], isTyping), [extensions, isTyping]);

  const handleChange = useCallback(
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
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <SetupSection
      title="Extension Hook"
      description="Run custom code at specific points in the evaluation lifecycle"
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      className="mt-4"
    >
      <p className="mb-3 text-sm text-muted-foreground">
        Extension hooks allow you to run custom Javascript or Python code that modifies the
        evaluation state at specific points in the lifecycle. These hooks are defined in an
        extension specified below. You can either use a default export, or reference a specific
        function.
      </p>
      <p className="mb-2 text-sm font-medium">Available Hooks</p>
      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Description</th>
              <th className="pb-2 font-medium">Context</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-2 pr-4 font-mono text-xs">beforeAll</td>
              <td className="py-2 pr-4">Runs before the entire test suite begins</td>
              <td className="py-2 font-mono text-xs">{`{ suite }`}</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-2 pr-4 font-mono text-xs">afterAll</td>
              <td className="py-2 pr-4">Runs after the entire test suite has finished</td>
              <td className="py-2 font-mono text-xs">{`{ results, suite }`}</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-2 pr-4 font-mono text-xs">beforeEach</td>
              <td className="py-2 pr-4">Runs before each individual test</td>
              <td className="py-2 font-mono text-xs">{`{ test }`}</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono text-xs">afterEach</td>
              <td className="py-2 pr-4">Runs after each individual test</td>
              <td className="py-2 font-mono text-xs">{`{ test, result }`}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <a
        href="https://www.promptfoo.dev/docs/configuration/reference/#extension-hooks"
        target="_blank"
        rel="noopener noreferrer"
        className="mb-4 block text-sm text-primary hover:underline"
      >
        View documentation →
      </a>
      <div className="space-y-2">
        <Label htmlFor="extension-path">Extension File Path</Label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm text-foreground">
            file://
          </span>
          <Input
            id="extension-path"
            className={cn('pl-[39px]', error && 'border-destructive')}
            placeholder="/path/to/hook.js:extensionHook"
            value={extensions[0]?.replace(FILE_PROTOCOL_PREFIX, '') || ''}
            onChange={handleChange}
          />
        </div>
        <HelperText error={!!error}>
          {error ? error.message : 'Path to your extension file and exported function name'}
        </HelperText>
      </div>
    </SetupSection>
  );
}
