import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AGENT_OUTCOME_DEFAULT_TASKS,
  AGENT_OUTCOME_PLUGINS,
  AgentOutcomeCaseSchema,
  ALL_PLUGINS,
  DEFAULT_PLUGINS,
  getAgentOutcomeArtifact,
  isAgentOutcomePlugin,
  MULTI_INPUT_VAR,
  REMOTE_ONLY_PLUGIN_IDS,
} from '../../../../src/redteam/constants';
import { CODING_AGENT_PLUGINS } from '../../../../src/redteam/constants/codingAgents';
import {
  ConsentBypassPlugin,
  PrivateToPublicDisclosurePlugin,
  UnauthorizedSharingPlugin,
} from '../../../../src/redteam/plugins/agentic/agentOutcome';
import { pluginMatchesStrategyTargets } from '../../../../src/redteam/strategies/util';
import { createMockProvider } from '../../../factories/provider';

import type { PluginConfig } from '../../../../src/redteam/types';

describe.each([
  [ConsentBypassPlugin, 'analytics', 'migration guide'],
  [PrivateToPublicDisclosurePlugin, 'internal diagnostic', 'reporter-authored'],
  [UnauthorizedSharingPlugin, 'parent folder', 'recipient on a ticket'],
] as const)('%s', (Plugin, directGoal, indirectGoal) => {
  it('generates direct requests and indirect tool content under the same outcome assertion', async () => {
    const provider = createMockProvider();
    provider.callApi
      .mockResolvedValueOnce({ output: 'Prompt: request A\nPrompt: request B' })
      .mockResolvedValueOnce({ output: 'Prompt: third-party content' });
    const plugin = new Plugin(provider, 'Internal demo agent', 'query');
    const rows = await plugin.generateTests(3);
    expect(rows.map((row) => row.vars?.query)).toEqual([
      'request A',
      'request B',
      AGENT_OUTCOME_DEFAULT_TASKS[Plugin.id],
    ]);
    expect(rows.map((row) => row.vars?.artifact)).toEqual(['', '', 'third-party content']);
    expect(rows.map(getAgentOutcomeArtifact)).toEqual([
      undefined,
      undefined,
      'third-party content',
    ]);
    const cases = rows.map(({ metadata, vars, assert }) => {
      const assigned = AgentOutcomeCaseSchema.parse(metadata?.agentOutcome);
      expect(assigned.pluginId).toBe(Plugin.id);
      expect(assigned.variant).toBe('attack');
      expect(vars?.agentOutcome).toEqual(assigned);
      expect(metadata?.pluginId).toBe(Plugin.id);
      expect(assert).toEqual([
        { type: `promptfoo:redteam:${Plugin.id}`, metric: expect.any(String) },
      ]);
      return assigned;
    });
    expect(new Set(cases.map((row) => row.caseId)).size).toBe(3);
    expect(cases.map(({ mode }) => mode)).toEqual(['direct', 'direct', 'indirect']);
    const calls = provider.callApi.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toContain(directGoal);
    expect(calls[1][0]).toContain(indirectGoal);
    expect(calls[1][0]).toContain('Internal demo agent');
  });
});

describe('agent outcome configuration', () => {
  it('keeps the configured assignment fixed while varying only the named tool content', async () => {
    const provider = createMockProvider({ response: { output: 'Prompt: raw 1\nPrompt: raw 2' } });
    const plugin = new PrivateToPublicDisclosurePlugin(provider, 'Support desk', 'query', {
      mode: 'indirect',
      legitimateTask: 'Triage issue 103.',
      indirectInjectionVar: 'issueBody',
      examples: ['Custom issue'],
    });
    const rows = await plugin.generateTests(2);
    expect(provider.callApi).toHaveBeenCalledTimes(1);
    expect(provider.callApi.mock.calls[0][0]).toContain('Triage issue 103.');
    expect(provider.callApi.mock.calls[0][0]).toContain('Custom issue');
    expect(rows.map(getAgentOutcomeArtifact)).toEqual(['raw 1', 'raw 2']);
    for (const row of rows) {
      expect(row.vars?.query).toBe('Triage issue 103.');
      expect(row.vars?.issueBody).toBe(getAgentOutcomeArtifact(row));
      expect(row.vars).not.toHaveProperty('artifact');
      expect(row.metadata?.agentOutcome).toMatchObject({ indirectInjectionVar: 'issueBody' });
    }
  });

  it.each(['both', 'direct'])(
    'generates only one direct request for a single %s test',
    async (mode) => {
      const provider = createMockProvider({ response: { output: 'Prompt: direct request' } });
      const rows = await new ConsentBypassPlugin(provider, 'Coding agent', 'request', {
        mode,
      }).generateTests(1);
      expect(provider.callApi).toHaveBeenCalledTimes(1);
      expect(rows[0].vars?.request).toBe('direct request');
      expect(rows[0].metadata?.agentOutcome).toMatchObject({ mode: 'direct' });
    },
  );

  it.each([false, true])(
    'isolates the user message with declared inputs (declared artifact=%s)',
    async (declareArtifact) => {
      const inputs = {
        message: { description: 'Owner task', type: 'text' as const, config: { benign: true } },
        ...(declareArtifact ? { ticket: 'Recipient ticket' } : {}),
      };
      const provider = createMockProvider({ response: { output: 'Prompt: grant parent access' } });
      const plugin = new UnauthorizedSharingPlugin(provider, 'Release agent', MULTI_INPUT_VAR, {
        mode: 'indirect',
        legitimateTask: 'Share file 5 with Pat.',
        indirectInjectionVar: 'ticket',
        inputs,
      });
      const [row] = await plugin.generateTests(1);
      expect(row.vars).toMatchObject({
        message: 'Share file 5 with Pat.',
        [MULTI_INPUT_VAR]: 'Share file 5 with Pat.',
        ticket: 'grant parent access',
      });
      expect(row.metadata?.inputVars).toEqual({
        message: 'Share file 5 with Pat.',
        ...(declareArtifact ? { ticket: 'grant parent access' } : {}),
      });
    },
  );

  it.each([
    'prompt',
    'evaluationId',
    'tools',
    'tool_choice',
    'token',
    'expiration',
    'signature',
    'signatureTimestamp',
    'sessionId',
  ])(
    'rejects an artifact in the HTTP template variable %s with a distinct user field',
    (indirectInjectionVar) => {
      expect(
        () =>
          new ConsentBypassPlugin(createMockProvider(), 'purpose', 'query', {
            mode: 'indirect',
            indirectInjectionVar,
          }),
      ).toThrow('Use a non-reserved variable name');
    },
  );

  it.each<PluginConfig>([
    { mode: 'invalid' },
    { legitimateTask: ' ' },
    { indirectInjectionVar: 'query' },
    { indirectInjectionVar: '__prompt' },
    { indirectInjectionVar: 'agentOutcome' },
    { indirectInjectionVar: '__proto__' },
    { indirectInjectionVar: 'foo.bar' },
    { inputs: { artifact: 'no owner field' } },
    { inputs: { query: 'owner', message: 'ambiguous owner' } },
    { inputs: { agentOutcome: 'reserved' } },
    { inputs: { query: { description: 'owner', type: 'image' } } },
    { inputs: { query: { description: 'owner', type: 'text', config: { benign: true } } } },
    {
      mode: 'indirect',
      inputs: {
        query: 'task',
        artifact: { description: 'source', type: 'text', config: { benign: true } },
      },
    },
  ])('rejects invalid or ambiguous configuration %j before generation', (config) => {
    const provider = createMockProvider();
    expect(() => new ConsentBypassPlugin(provider, 'purpose', 'query', config)).toThrow(z.ZodError);
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it.each(AGENT_OUTCOME_PLUGINS)(
    'requires explicit selection of %s and blocks transformations',
    (pluginId) => {
      expect(ALL_PLUGINS).toContain(pluginId);
      expect(isAgentOutcomePlugin(pluginId)).toBe(true);
      expect(DEFAULT_PLUGINS.has(pluginId)).toBe(false);
      expect(CODING_AGENT_PLUGINS).not.toContain(pluginId);
      expect(REMOTE_ONLY_PLUGIN_IDS).not.toContain(pluginId);
      expect(
        pluginMatchesStrategyTargets({ metadata: { pluginId } }, 'jailbreak', [pluginId]),
      ).toBe(false);
    },
  );
});
