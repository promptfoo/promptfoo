import React, { useMemo, useState } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Label } from '@app/components/ui/label';
import { NumberInput } from '@app/components/ui/number-input';
import { Textarea } from '@app/components/ui/textarea';
import { cn } from '@app/lib/utils';
import { ChevronDown } from 'lucide-react';
import ExtensionEditor from './ExtensionEditor';
import InputsEditor from './InputsEditor';
import type { ProviderOptions } from '@promptfoo/types';

interface CommonConfigurationOptionsProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
  onValidationChange?: (hasErrors: boolean) => void;
  extensions?: string[];
  onExtensionsChange?: (extensions: string[]) => void;
  /** Test generation instructions for red team attack generation */
  testGenerationInstructions?: string;
  /** Callback when test generation instructions change */
  onTestGenerationInstructionsChange?: (instructions: string) => void;
  /** Callback when prompts should be updated (auto-generated from inputs) */
  onPromptsChange?: (prompts: string[]) => void;
  /** Hide the Test Generation section (useful for non-redteam contexts) */
  hideTestGeneration?: boolean;
}

const CommonConfigurationOptions = ({
  selectedTarget,
  updateCustomTarget,
  onValidationChange,
  extensions = [],
  onExtensionsChange,
  testGenerationInstructions = '',
  onTestGenerationInstructionsChange,
  onPromptsChange,
  hideTestGeneration = false,
}: CommonConfigurationOptionsProps) => {
  const inputs = (selectedTarget as { inputs?: Record<string, string> }).inputs;
  const hasInputs = inputs && Object.keys(inputs).length > 0;
  const hasInstructions = !!testGenerationInstructions?.trim();
  const [isTestGenExpanded, setIsTestGenExpanded] = useState(hasInputs || hasInstructions);
  const [isDelayExpanded, setIsDelayExpanded] = useState(!!selectedTarget.delay);

  // Determine if test generation section should be shown
  const showTestGeneration = useMemo(() => {
    // Hide if explicitly requested
    if (hideTestGeneration) {
      return false;
    }
    // Show if callbacks are provided (controlled mode)
    if (onTestGenerationInstructionsChange || onPromptsChange) {
      return true;
    }
    // Hide by default if no callbacks provided
    return false;
  }, [hideTestGeneration, onTestGenerationInstructionsChange, onPromptsChange]);

  const handleExtensionsChange = React.useCallback(
    (newExtensions: string[]) => {
      onExtensionsChange?.(newExtensions);
    },
    [onExtensionsChange],
  );

  const handleInputsChange = React.useCallback(
    (inputs: Record<string, string> | undefined) => {
      updateCustomTarget('inputs', inputs);

      // Auto-generate prompts JSON template when inputs are configured
      if (onPromptsChange) {
        if (inputs && Object.keys(inputs).length > 0) {
          // Create JSON template with all input variable names as template variables
          const jsonTemplate = JSON.stringify(
            Object.fromEntries(Object.keys(inputs).map((key) => [key, `{{${key}}}`])),
          );
          onPromptsChange([jsonTemplate]);
        } else {
          // Reset to default prompt when inputs are cleared
          onPromptsChange(['{{prompt}}']);
        }
      }
    },
    [updateCustomTarget, onPromptsChange],
  );

  return (
    <div className="space-y-4">
      {showTestGeneration && (
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
              <Label className="mb-1.5 block">Instructions</Label>
              <p className="mb-2 text-sm text-muted-foreground">
                Additional guidance for generating red team attacks. Useful if you need to tweak
                anything from structure to specific scenarios for your application.
              </p>
              <Textarea
                value={testGenerationInstructions}
                onChange={(e) => onTestGenerationInstructionsChange?.(e.target.value)}
                placeholder="Generate the attack as a news article"
                rows={3}
                className="min-h-18 resize-y"
                disabled={hasInputs}
              />
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  View examples
                </summary>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <li>• Generate the attack as a news article</li>
                  <li>• Generate the attack as a receipt or invoice</li>
                  <li>• Limit the attack to 300 characters</li>
                  <li>• Adopt a frustrated customer persona when attacking</li>
                  <li>
                    • Format the attack as a JSON object:{' '}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      {`{"message": "..."}`}
                    </code>
                  </li>
                </ul>
              </details>
            </div>

            {/* Multi-Variable Inputs */}
            <div>
              <Label className="mb-1.5 block">Generate Multiple Variables</Label>
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
      )}

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
