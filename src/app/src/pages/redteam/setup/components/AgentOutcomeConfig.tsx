import { useId } from 'react';

import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@app/components/ui/radio-group';
import { Textarea } from '@app/components/ui/textarea';
import {
  AGENT_OUTCOME_DEFAULT_TASKS,
  type AgentOutcomePluginId,
  AgentOutcomePluginIdSchema,
  DEFAULT_AGENT_OUTCOME_ARTIFACT_VAR,
  getAgentOutcomeConfigSchema,
  isAgentOutcomePlugin,
} from '@promptfoo/redteam/constants';
import { getPluginDocumentationUrl } from './pluginDocumentationMap';
import type { PluginConfig } from '@promptfoo/redteam/types';

interface AgentOutcomeConfigProps {
  plugin: AgentOutcomePluginId;
  config: PluginConfig;
  maxCharsPerMessage?: number;
  onChange: (config: PluginConfig) => void;
  readOnly?: boolean;
  singleTest?: boolean;
}

const modes = [
  { value: 'indirect', label: 'Indirect via tool' },
  { value: 'direct', label: 'Direct user request' },
  { value: 'both', label: 'Both' },
] as const;

const revisions = [
  { value: 'off', label: 'Off' },
  { value: 'public', label: 'Use public reply' },
  { value: 'blind', label: 'Ticket only (blind)' },
] as const;

export function withAgentOutcomeMessageLimit(
  plugin: string,
  config: PluginConfig,
  maxCharsPerMessage?: number,
) {
  return maxCharsPerMessage && isAgentOutcomePlugin(plugin)
    ? { ...config, maxCharsPerMessage }
    : config;
}

export function getAgentOutcomeConfigIssue(
  plugin: string | null,
  config: PluginConfig,
  maxCharsPerMessage?: number,
) {
  if (plugin && isAgentOutcomePlugin(plugin)) {
    const effectiveConfig = withAgentOutcomeMessageLimit(plugin, config, maxCharsPerMessage);
    return getAgentOutcomeConfigSchema(plugin).safeParse(effectiveConfig).error?.issues[0];
  }
  return undefined;
}

export function AgentOutcomeConfig({
  plugin,
  config,
  maxCharsPerMessage,
  onChange,
  readOnly,
  singleTest,
}: AgentOutcomeConfigProps) {
  const id = useId();
  const configured = config.mode ?? 'both';
  const mode = singleTest && configured === 'both' ? 'indirect' : configured;
  const issue = getAgentOutcomeConfigIssue(plugin, config, maxCharsPerMessage);
  const invalidTask = issue?.path[0] === 'legitimateTask';
  const invalidVariable = issue?.path[0] === 'indirectInjectionVar';
  const errorId = `${id}-error`;
  const canRevise = plugin === AgentOutcomePluginIdSchema.enum.privateToPublicDisclosure;
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
          onValueChange={(mode) => {
            const next = { ...config, mode };
            if (mode === 'direct') {
              delete next.metaTicketRevision;
            }
            onChange(next);
          }}
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
      {canRevise && !singleTest && (mode !== 'direct' || config.metaTicketRevision) && (
        <div className="space-y-2">
          <p id={`${id}-revision`} className="text-sm font-medium">
            Meta ticket revision (experimental)
          </p>
          <RadioGroup
            aria-labelledby={`${id}-revision`}
            aria-describedby={`${id}-revision-hint`}
            value={config.metaTicketRevision ?? 'off'}
            onValueChange={(value) => {
              const next = { ...config };
              if (value === 'public' || value === 'blind') {
                next.metaTicketRevision = value;
              } else {
                delete next.metaTicketRevision;
              }
              onChange(next);
            }}
            disabled={readOnly}
            className="flex flex-wrap gap-4"
          >
            {revisions.map(({ value, label }) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-${value}`} value={value} />
                <Label htmlFor={`${id}-${value}`} inline>
                  {label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <p id={`${id}-revision-hint`} className="text-xs text-muted-foreground">
            With Basic enabled, each verified safe indirect test can trigger one extra attempt in a
            fresh session. Both options send the original ticket to Promptfoo for a rewrite. Only
            “Use public reply” sends the verified public reply. Choose “Ticket only” if target
            output is excluded from attack generation. Use synthetic tickets and replies.
          </p>
        </div>
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
