import React, { useState } from 'react';

import { BaseNumberInput } from '@app/components/form/input/BaseNumberInput';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { cn } from '@app/lib/utils';
import { ChevronDown } from 'lucide-react';
import ExtensionEditor from './ExtensionEditor';
import type { ProviderOptions } from '@promptfoo/types';
import 'prismjs/themes/prism.css';

interface CommonConfigurationOptionsProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  onValidationChange?: (hasErrors: boolean) => void;
  extensions?: string[];
  onExtensionsChange?: (extensions: string[]) => void;
}

const CommonConfigurationOptions = ({
  selectedTarget,
  updateCustomTarget,
  onValidationChange,
  extensions = [],
  onExtensionsChange,
}: CommonConfigurationOptionsProps) => {
  const [isDelayExpanded, setIsDelayExpanded] = useState(!!selectedTarget.delay);

  const handleExtensionsChange = React.useCallback(
    (newExtensions: string[]) => {
      onExtensionsChange?.(newExtensions);
    },
    [onExtensionsChange],
  );

  return (
    <div>
      <Collapsible open={isDelayExpanded} onOpenChange={setIsDelayExpanded}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-background p-4 hover:bg-muted/50">
          <div className="text-left">
            <h3 className="font-semibold">Delay</h3>
            <p className="text-sm text-muted-foreground">Configure the delay between requests</p>
          </div>
          <ChevronDown
            className={cn('h-5 w-5 transition-transform', isDelayExpanded && 'rotate-180')}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4 pt-2">
          <p className="mb-4">
            Add a delay (ms) between requests to simulate a real user. See{' '}
            <a
              href="https://www.promptfoo.dev/docs/providers/http/#delay"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              docs
            </a>{' '}
            for more details.
          </p>
          <BaseNumberInput
            min={0}
            value={selectedTarget.delay ?? ''}
            onChange={(v) => updateCustomTarget('delay', v)}
            helperText="Delay in milliseconds (default: 0)"
          />
        </CollapsibleContent>
      </Collapsible>

      <ExtensionEditor
        extensions={extensions}
        onExtensionsChange={handleExtensionsChange}
        onValidationChange={onValidationChange}
      />
    </div>
  );
};

export default CommonConfigurationOptions;
