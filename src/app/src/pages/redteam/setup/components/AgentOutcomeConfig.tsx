import { useId } from 'react';

import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@app/components/ui/radio-group';
import { Textarea } from '@app/components/ui/textarea';
import {
  AGENT_OUTCOME_DEFAULT_TASKS,
  type AgentOutcomePluginId,
  DEFAULT_AGENT_OUTCOME_ARTIFACT_VAR,
  isAgentOutcomePlugin,
} from '@promptfoo/redteam/constants';
import { getAgentOutcomeConfigSchema, type PluginConfig } from '@promptfoo/redteam/types';
import { getPluginDocumentationUrl } from './pluginDocumentationMap';

interface AgentOutcomeConfigProps {
  plugin: AgentOutcomePluginId;
  config: PluginConfig;
  onChange: (config: PluginConfig) => void;
  readOnly?: boolean;
  singleTest?: boolean;
  /** The scan-wide limit from Run Options, which overrides the plugin's own limit. */
  maxCharsPerMessage?: number;
}

const modes = [
  { value: 'indirect', label: 'Indirect via tool' },
  { value: 'direct', label: 'Direct user request' },
  { value: 'both', label: 'Both' },
] as const;

export function getAgentOutcomeConfigIssue(
  plugin: string | null,
  config: unknown,
  maxCharsPerMessage?: number,
) {
  if (plugin && isAgentOutcomePlugin(plugin)) {
    return getAgentOutcomeConfigSchema(plugin, maxCharsPerMessage).safeParse(config).error
      ?.issues[0];
  }
  return undefined;
}

export function AgentOutcomeConfig({
  plugin,
  config,
  onChange,
  readOnly,
  singleTest,
  maxCharsPerMessage,
}: AgentOutcomeConfigProps) {
  const id = useId();
  const configured = config.mode ?? 'both';
  const mode = singleTest && configured === 'both' ? 'indirect' : configured;
  const issue = getAgentOutcomeConfigIssue(plugin, config, maxCharsPerMessage);
  const invalidTask = issue?.path[0] === 'legitimateTask';
  const invalidVariable = issue?.path[0] === 'indirectInjectionVar';
  const errorId = `${id}-error`;
  const error = issue && (
    <p id={errorId} role="alert" className="text-xs text-destructive">
      {issue.message}
      {mode === 'direct' &&
        (invalidTask || invalidVariable) &&
        ' Select “Indirect via tool” to edit this field.'}
    </p>
  );

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
            The first test uses tool content. Generate at least two to cover both sources.
          </p>
        )}
      </div>
      {mode !== 'direct' && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${id}-task`}>User task for indirect tests (optional)</Label>
            <Textarea
              id={`${id}-task`}
              aria-invalid={invalidTask}
              aria-describedby={invalidTask ? errorId : undefined}
              placeholder={AGENT_OUTCOME_DEFAULT_TASKS[plugin]}
              value={config.legitimateTask ?? ''}
              onChange={(e) => onChange({ ...config, legitimateTask: e.target.value || undefined })}
              disabled={readOnly}
            />
            {invalidTask && error}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-var`}>Variable for third-party content</Label>
            <Input
              id={`${id}-var`}
              aria-invalid={invalidVariable}
              aria-describedby={invalidVariable ? errorId : `${id}-hint`}
              placeholder={DEFAULT_AGENT_OUTCOME_ARTIFACT_VAR}
              value={config.indirectInjectionVar ?? ''}
              onChange={(e) =>
                onChange({ ...config, indirectInjectionVar: e.target.value.trim() || undefined })
              }
              disabled={readOnly}
            />
            {invalidVariable && error}
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              Put this variable’s value in a document the agent can read through a tool. Send the
              user task as the prompt.
            </p>
          </div>
        </>
      )}
      {(mode === 'direct' || !(invalidTask || invalidVariable)) && error}
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
