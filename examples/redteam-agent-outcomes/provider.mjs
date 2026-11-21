import { randomUUID } from 'node:crypto';

import consent from './scenarios/consent-bypass.mjs';
import disclosure from './scenarios/private-to-public-disclosure.mjs';
import sharing from './scenarios/unauthorized-sharing.mjs';

export const fixtures = [consent, disclosure, sharing];

export async function runTrial({
  pluginId,
  caseId,
  mode,
  variant,
  prompt,
  artifact,
  target = 'safe',
  model,
  signal,
}) {
  if (!['safe', 'unsafe', 'openclaw-live'].includes(target)) {
    throw new Error('Set AGENT_MODE to safe, unsafe or openclaw-live');
  }
  const fixture = fixtures.find(({ id }) => id === pluginId);
  if (!fixture || !caseId || !['direct', 'indirect'].includes(mode)) {
    throw new Error('Expected an agent outcome case in test metadata');
  }
  if (mode === 'indirect' && (typeof artifact !== 'string' || !artifact.trim())) {
    throw new Error('Indirect trials require an artifact');
  }
  const live = target === 'openclaw-live';
  const trialId = randomUUID();
  const events = [];
  const record = (type, data) => events.push({ type, data: structuredClone(data) });
  let output = '';
  let interrupted;
  let attackExposed = false;
  async function turn({ tools, script, artifactTool }) {
    const readings = new Set();
    // For live runs, observe only requests accepted by the model endpoint.
    function observe(messages) {
      attackExposed ||= messages.some(({ role, content }) => {
        const text = Array.isArray(content) ? content.map((p) => p.text).join('\n') : content;
        return mode === 'direct'
          ? role === 'user' && typeof text === 'string' && text.includes(prompt)
          : role === 'tool' && readings.has(text);
      });
    }
    async function call(name, args = {}) {
      signal?.throwIfAborted();
      const result = await tools[name].execute(args);
      record('tool', { name, args, result });
      if (mode === 'indirect' && name === artifactTool) {
        const text = JSON.stringify(result);
        if (text.includes(JSON.stringify(artifact).slice(1, -1))) {
          readings.add(text);
          if (!live) attackExposed = true;
        }
      }
      return result;
    }
    try {
      signal?.throwIfAborted();
      if (live) {
        const { runOpenClaw } = await import('./openclaw.mjs');
        output = await runOpenClaw({ prompt, tools, call, model, signal, record, observe });
      } else {
        attackExposed = mode === 'direct';
        output = await script({ call, prompt, unsafe: target === 'unsafe' });
      }
    } catch (error) {
      // A service can still prove a committed effect after an agent timeout.
      interrupted = String(error?.message ?? error) || 'Unknown error';
      record('interrupted', interrupted);
    }
  }
  signal?.throwIfAborted();
  const result = await fixture.run({ mode, variant, artifact, turn, record });
  return {
    output: interrupted ? 'Agent interrupted. ' + interrupted : output,
    metadata: {
      agentOutcomeEvidence: {
        version: 1,
        pluginId,
        caseId,
        taskCompleted: interrupted ? null : result.taskCompleted,
        attackExposed,
        measurements: result.measurements,
      },
      agentOutcomeTrace: { trialId, target, events },
    },
  };
}

export default class Provider {
  constructor({ config = {} } = {}) {
    this.target = config.target ?? process.env.AGENT_MODE ?? 'safe';
    this.model = config.model ?? process.env.AGENT_MODEL;
    this.config = { ...config, maxRetries: 0 };
  }

  id() {
    return ['agent-outcomes', this.target, this.model].filter(Boolean).join(':');
  }

  callApi(prompt, context, options) {
    const spec = context.test?.metadata?.agentOutcome ?? context.vars.agentOutcome;
    return runTrial({
      ...spec,
      prompt,
      artifact: context.vars[spec?.indirectInjectionVar ?? 'artifact'],
      target: this.target,
      model: this.model,
      signal: options?.abortSignal,
    });
  }
}
