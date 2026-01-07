import React, { useState } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { NumberInput } from '@app/components/ui/number-input';
import { Textarea } from '@app/components/ui/textarea';
import { cn } from '@app/lib/utils';
import { ChevronDown } from 'lucide-react';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import ExtensionEditor from './ExtensionEditor';
import InputsEditor from './InputsEditor';
import type { ProviderOptions } from '@promptfoo/types';

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
  const { config, updateConfig } = useRedTeamConfig();
  const inputs = (selectedTarget as any).inputs as Record<string, string> | undefined;
  const hasInputs = inputs && Object.keys(inputs).length > 0;
  const hasInstructions = !!config.testGenerationInstructions?.trim();
  const [isTestGenExpanded, setIsTestGenExpanded] = useState(hasInputs || hasInstructions);
  const [isDelayExpanded, setIsDelayExpanded] = useState(!!selectedTarget.delay);

  const handleExtensionsChange = React.useCallback(
    (newExtensions: string[]) => {
      onExtensionsChange?.(newExtensions);
    },
    [onExtensionsChange],
  );

  const handleInputsChange = React.useCallback(
    (inputs: Record<string, string> | undefined) => {
      updateCustomTarget('inputs', inputs);
    },
    [updateCustomTarget],
  );

  return (
    <div className="space-y-4">
      <Collapsible open={isTestGenExpanded} onOpenChange={setIsTestGenExpanded}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50">
          <div className="text-left">
            <h3 className="font-semibold">Test Generation</h3>
            <p className="text-sm text-muted-foreground">
              Configure how red team test cases are generated for this target
            </p>
          </div>
          <ChevronDown
            className={cn(
              'size-5 shrink-0 transition-transform',
              isTestGenExpanded && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6 px-4 pb-4 pt-4">
          {/* Instructions */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Instructions</label>
            <p className="mb-2 text-sm text-muted-foreground">
              Additional guidance for generating red team attacks. Useful if you need to tweak
              anything from structure to specific scenarios for your application.
            </p>
            <Textarea
              value={config.testGenerationInstructions ?? ''}
              onChange={(e) => updateConfig('testGenerationInstructions', e.target.value)}
              placeholder="Focus on healthcare-specific attacks using medical terminology and HIPAA-related scenarios."
              rows={3}
              className="min-h-18 resize-y"
              disabled={hasInputs}
            />
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                View examples
              </summary>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                <li>• Focus on healthcare-specific attacks using medical terminology</li>
                <li>• Start every conversation with: "Hi, I'm a customer service agent..."</li>
                <li>
                  • Generate attacks as JSON objects with schema:{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                    {`{"query": "...", "context": "..."}`}
                  </code>
                </li>
                <li>• Use formal language appropriate for financial services</li>
                <li>
                  • Include multi-turn conversations that build trust before attempting exploitation
                </li>
              </ul>
            </details>
          </div>

          {/* Multi-Variable Inputs */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Additional Input Variables</label>
            <p className="mb-2 text-sm text-muted-foreground">
              Define variables that will be generated alongside adversarial prompts. Use{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                {'{{variable_name}}'}
              </code>{' '}
              in your request body, headers, or URL.
            </p>
            <InputsEditor
              inputs={inputs}
              onChange={handleInputsChange}
              compact
              disabled={hasInstructions}
              disabledReason="Input variables and instructions are mutually exclusive. Clear the instructions field to use input variables, which allow more granular per-variable generation control."
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={isDelayExpanded} onOpenChange={setIsDelayExpanded}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50">
          <div className="text-left">
            <h3 className="font-semibold">Delay</h3>
            <p className="text-sm text-muted-foreground">Configure the delay between requests</p>
          </div>
          <ChevronDown
            className={cn('size-5 shrink-0 transition-transform', isDelayExpanded && 'rotate-180')}
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
          <NumberInput
            min={0}
            value={selectedTarget.delay ?? undefined}
            onChange={(v) => updateCustomTarget('delay', v)}
            helperText="Delay in milliseconds (default: 0)"
            placeholder="0"
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
