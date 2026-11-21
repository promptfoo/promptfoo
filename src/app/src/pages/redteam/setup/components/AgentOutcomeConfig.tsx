import { useId } from 'react';

import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@app/components/ui/radio-group';
import { Textarea } from '@app/components/ui/textarea';
import {
  AGENT_OUTCOME_DEFAULT_TASKS,
  type AgentOutcomePluginId,
  DEFAULT_AGENT_OUTCOME_ARTIFACT_VAR,
} from '@promptfoo/redteam/constants';
import { getPluginDocumentationUrl } from './pluginDocumentationMap';
import type { PluginConfig } from '@promptfoo/redteam/types';

interface AgentOutcomeConfigProps {
  plugin: AgentOutcomePluginId;
  config: PluginConfig;
  onChange: (config: PluginConfig) => void;
  readOnly?: boolean;
  singleTest?: boolean;
}

const modes = [
  { value: 'direct', label: 'Direct user request' },
  { value: 'indirect', label: 'Indirect via tool' },
  { value: 'both', label: 'Both' },
] as const;

export function AgentOutcomeConfig({
  plugin,
  config,
  onChange,
  readOnly,
  singleTest,
}: AgentOutcomeConfigProps) {
  const id = useId();
  const configured = config.mode ?? 'both';
  const mode = singleTest && configured === 'both' ? 'direct' : configured;

  return (
    <div className="space-y-5">
      <div>
        <p id={`${id}-mode`} className="mb-2 text-sm font-medium">
          Attack source
        </p>
        <RadioGroup
          aria-labelledby={`${id}-mode`}
          value={mode}
          onValueChange={(value) => onChange({ ...config, mode: value as PluginConfig['mode'] })}
          disabled={readOnly}
          className="flex flex-wrap gap-4"
        >
          {modes
            .filter(({ value }) => !singleTest || value !== 'both')
            .map(({ value, label }) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-${value}`} value={value} />
                <Label htmlFor={`${id}-${value}`} inline>
                  {label}
                </Label>
              </div>
            ))}
        </RadioGroup>
        {mode === 'both' && (
          <p className="mt-2 text-xs text-muted-foreground">
            Tests are split between the two sources. Generate at least two to cover both.
          </p>
        )}
      </div>
      {mode !== 'direct' && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${id}-task`}>User task for indirect tests (optional)</Label>
            <Textarea
              id={`${id}-task`}
              placeholder={AGENT_OUTCOME_DEFAULT_TASKS[plugin]}
              value={config.legitimateTask ?? ''}
              onChange={(e) => onChange({ ...config, legitimateTask: e.target.value || undefined })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-var`}>Variable for third-party content</Label>
            <Input
              id={`${id}-var`}
              aria-describedby={`${id}-hint`}
              placeholder={DEFAULT_AGENT_OUTCOME_ARTIFACT_VAR}
              value={config.indirectInjectionVar ?? ''}
              onChange={(e) =>
                onChange({ ...config, indirectInjectionVar: e.target.value.trim() || undefined })
              }
              disabled={readOnly}
            />
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              Put this variable’s value in a document the agent can read through a tool. Send the
              user task as the prompt.
            </p>
          </div>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        For grading, your target must return independent observations in{' '}
        <code>metadata.agentOutcomeEvidence</code>.{' '}
        <a
          className="text-primary underline"
          href={getPluginDocumentationUrl(plugin)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Set up evidence collection
        </a>
      </p>
    </div>
  );
}
