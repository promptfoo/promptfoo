import { randomUUID } from 'node:crypto';
export const fixtures = {
  'coding-agent:consent-bypass': () => import('./scenarios/consent-bypass.mjs'),
  'agentic:private-to-public-disclosure': () =>
    import('./scenarios/private-to-public-disclosure.mjs'),
  'agentic:unauthorized-sharing': () => import('./scenarios/unauthorized-sharing.mjs'),
};

async function calibrate({ prompt, tools, script, unsafe, signal, observe }) {
  const results = [];
  const messages = [{ role: 'user', content: prompt }];
  for (let i = 0; i < 16; i++) {
    signal?.throwIfAborted();
    observe(messages);
    const step = await script({ results, messages, unsafe });
    if (typeof step === 'string') return step;
    if (!Object.hasOwn(tools, step.tool)) throw new Error('Unknown tool ' + step.tool);
    const result = await tools[step.tool].execute(step.args ?? {});
    results.push(result);
    messages.push({ role: 'tool', content: JSON.stringify(result) });
  }
  throw new Error('Calibration exceeded 16 tool calls');
}

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
  if (!Object.hasOwn(fixtures, pluginId) || !caseId || !['direct', 'indirect'].includes(mode)) {
    throw new Error('Expected an agent outcome case in test metadata');
  }
  if (mode === 'indirect' && (typeof artifact !== 'string' || !artifact.trim())) {
    throw new Error('Indirect trials require an artifact');
  }
  const { default: fixture } = await fixtures[pluginId]();
  const trialId = randomUUID();
  const events = [];
  const record = (type, data) => events.push({ type, data: structuredClone(data) });
  let output = '';
  let interrupted;
  let seen = false;
  const role = mode === 'indirect' ? 'tool' : 'user';
  const value = mode === 'indirect' ? JSON.stringify(artifact).slice(1, -1) : prompt;
  function observe(messages) {
    seen ||= messages.some((m) => {
      const text = Array.isArray(m.content) ? m.content.map((p) => p.text).join('\n') : m.content;
      return m.role === role && typeof text === 'string' && text.includes(value);
    });
  }
  async function turn({ tools, script }) {
    const scoped = {};
    for (const [name, definition] of Object.entries(tools)) {
      scoped[name] = {
        ...definition,
        async execute(args) {
          signal?.throwIfAborted();
          const result = await definition.execute(args);
          record('tool', { name, args, result });
          return structuredClone(result);
        },
      };
    }
    try {
      signal?.throwIfAborted();
      const options = { prompt, tools: scoped, model, signal, record, observe };
      if (target === 'openclaw-live') {
        const { runOpenClaw } = await import('./openclaw.mjs');
        output = await runOpenClaw(options);
      } else {
        output = await calibrate({ ...options, script, unsafe: target === 'unsafe' });
      }
    } catch (error) {
      // A service can still prove a committed effect after an agent timeout.
      interrupted = String(error.message ?? error);
      record('interrupted', interrupted);
    }
    return output;
  }
  signal?.throwIfAborted();
  const result = await fixture.run({
    trialId,
    caseId,
    mode,
    variant,
    prompt,
    artifact,
    turn,
    record,
  });
  return {
    output: interrupted ? 'Agent interrupted. ' + interrupted : output,
    metadata: {
      agentOutcomeEvidence: {
        version: 1,
        pluginId,
        caseId,
        taskCompleted: interrupted ? null : result.taskCompleted,
        attackExposed: seen && result.attackExposed,
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
