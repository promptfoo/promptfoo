import { useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import { type RedteamSetupPlan, RedteamSetupReplySchema } from '@promptfoo/types/api/redteamSetup';
import isEqual from 'fast-deep-equal';
import { type ConnectionDraft, parseConnection, toTarget } from '../utils/agentConnection';
import { riskName } from '../utils/plugins';
import { applicationDefinitionToPurpose } from '../utils/purposeParser';
import { missingEndpoint } from '../utils/targetDestination';
import { EXAMPLE_CONFIG, useRedTeamConfig } from './useRedTeamConfig';

import type { Config, ProviderOptions } from '../types';

const API_PATH = '/redteam/setup-plan';
const UNAVAILABLE = 'Could not reach the setup agent. Send your reply again or set up manually.';
const QUESTIONS = {
  url: 'Where should I send the tests? Share an HTTP endpoint, a model ID like ollama:chat:llama3, or a cURL request. Leave out credentials.',
  body: 'What JSON does your app expect? Pick an example or paste a request body with {{prompt}} where the test goes.',
  responsePath:
    'Where is the answer in the response? Give me a field like result.answer, paste an example, or choose plain text.',
  authEnv:
    'Does the endpoint need a bearer token? Give me the name of an environment variable set where you run Promptfoo. Never paste the token itself.',
};
export type Field = keyof typeof QUESTIONS;
type Step = Field | 'scope' | 'ready';
interface Message {
  role: 'user' | 'assistant';
  content: string;
  // Only app and test-scope exchanges belong in requests to the hosted agent.
  scope?: true;
}

export interface SetupDraft {
  messages: Message[];
  input: string;
  step: Step;
  demo?: boolean;
  deferred?: boolean;
  plan?: RedteamSetupPlan;
  connection?: ConnectionDraft;
  excluded?: string[];
  interrupted?: { field: Field; input: string };
  previousPlan?: RedteamSetupPlan;
  approved?: { config: Config; plan: RedteamSetupPlan };
}

function existingTarget(config: Config): ProviderOptions | undefined {
  const target = config.target;
  if (!target?.id || missingEndpoint(target)) {
    return undefined;
  }
  return target;
}

function targetFor(draft: SetupDraft, config: Config) {
  if (draft.connection) {
    return toTarget(draft.connection);
  }
  return draft.demo ? EXAMPLE_CONFIG.target : existingTarget(config);
}

function nextField(connection?: ConnectionDraft): Field {
  if (!connection?.url) {
    return 'url';
  }
  if (!connection.body) {
    return 'body';
  }
  return connection.responsePath === undefined ? 'responsePath' : 'authEnv';
}

function ask(draft: SetupDraft, step: Step, content: string): SetupDraft {
  return { ...draft, step, messages: [...draft.messages, { role: 'assistant', content }] };
}

function advance(draft: SetupDraft, config: Config): SetupDraft {
  if (!draft.plan?.plugins.length) {
    const lastScopeMessage = draft.messages.filter((message) => message.scope).pop();
    const question =
      lastScopeMessage?.role === 'assistant'
        ? lastScopeMessage.content
        : 'Describe what the app does and what you want to test, leaving out connection details.';
    return ask(draft, 'scope', 'I’ve kept the connection details here. ' + question);
  }
  if (draft.interrupted) {
    const { field, input } = draft.interrupted;
    return ask({ ...draft, input, interrupted: undefined }, field, QUESTIONS[field]);
  }
  if (targetFor(draft, config)) {
    return ask(
      draft,
      'ready',
      'Ready to review. You can still change the connection or ask me to adjust the tests.',
    );
  }
  const field = nextField(draft.connection);
  return ask(draft, field, QUESTIONS[field]);
}

function selectedPlan({ plan, excluded }: SetupDraft) {
  return plan && { ...plan, plugins: plan.plugins.filter(({ id }) => !excluded?.includes(id)) };
}

// The model cannot set a target, headers, request templates, scripts, or provider options.
function buildConfig(config: Config, plan: RedteamSetupPlan, draft: SetupDraft): Config {
  const target =
    targetFor(draft, config) ??
    partialConnection(draft.connection) ??
    (draft.deferred || draft.connection ? { id: 'http', config: { url: '' } } : undefined);
  const replacing = target && !isEqual(target, config.target);
  // Prompts, examples, extensions and other target-specific settings can contain
  // private data. Never carry them to a replacement target.
  const base = draft.demo
    ? EXAMPLE_CONFIG
    : replacing
      ? useRedTeamConfig.getInitialState().config
      : config;
  const retained = { ...base.applicationDefinition };
  for (const field of Object.keys(draft.approved?.plan.application || {})) {
    delete retained[field as keyof typeof retained];
  }
  const applicationDefinition = {
    ...retained,
    ...plan.application,
    ...(draft.demo && {
      redteamUser: EXAMPLE_CONFIG.applicationDefinition.redteamUser,
      forbiddenData: 'Other customers’ records, including Jane Smith’s (jane.smith@example.com).',
    }),
    purpose: plan.purpose,
  };
  return {
    ...base,
    target: target ?? base.target,
    applicationDefinition,
    purpose: applicationDefinitionToPurpose(applicationDefinition),
    plugins: plan.plugins.map(({ id }) => id),
    strategies: ['basic'],
    numTests: plan.numTests ?? 3,
  };
}

// A manual handoff keeps validated answers, including the new host, without
// inheriting headers or auth from the target it replaces.
function partialConnection(connection?: ConnectionDraft): ProviderOptions | undefined {
  if (!connection?.url) {
    return undefined;
  }
  const target = toTarget({ body: {}, responsePath: '', authEnv: '', ...connection });
  if (target && !connection.body) {
    delete target.config.body;
  }
  if (target && connection.responsePath === undefined) {
    delete target.config.transformResponse;
  }
  return target;
}

export function isField(step: Step): step is Field {
  return step !== 'scope' && step !== 'ready';
}

// A pasted connection belongs in the local conversation, even at the opening question.
function connectionField(input: string): Field | undefined {
  if (input.startsWith('{')) {
    return 'body';
  }
  if (
    /https?:\/\/|\bcurl\s|^(?:openai|anthropic|ollama|google|file|exec|python|javascript):/i.test(
      input,
    )
  ) {
    return 'url';
  }
  if (/(?:reply|response|answer) (?:is |field )?(?:at|in)\s+\w+/i.test(input)) {
    return 'responsePath';
  }
  if (input.includes('{{prompt}}')) {
    return 'body';
  }
  if (
    /\b(?:authorization:|bearer\s)/i.test(input) ||
    /^[A-Z][A-Z0-9_]+_(?:TOKEN|KEY)$/.test(input)
  ) {
    return 'authEnv';
  }
  return undefined;
}

// A partial connection reply stays local when switching topics. Offer to move
// only a plain-language question about tests, with a separate, explicit Send.
function testSuggestion(input: string) {
  return (
    input.includes(' ') &&
    /^[\p{L}\d ,.'’?!-]{1,300}$/u.test(input) &&
    !/\.\S/.test(input) &&
    /\b(?:tests?|risks?|privacy|probes?)\b/i.test(input) &&
    !/(?:bearer|secret|password|token|api key|[a-z0-9-]{24,})/i.test(input)
  );
}

const WHY: Record<Field, string> = {
  url: 'Promptfoo needs a destination to test. Nothing will be sent there until you start a run.',
  body: 'Every test prompt will replace {{prompt}} in this JSON before it goes to your app.',
  responsePath: 'Promptfoo grades the reply. This tells it which part of your response to read.',
  authEnv: 'Promptfoo reads the token at run time. Your setup will only contain the variable name.',
};

function localReply(draft: SetupDraft, config: Config, answer: string, field: Field): SetupDraft {
  const messages: Message[] = [...draft.messages, { role: 'user', content: answer }];
  const next = { ...draft, messages, input: '' };
  if (/^why\??$/i.test(answer)) {
    return ask(next, field, WHY[field] + ' ' + QUESTIONS[field]);
  }
  if (
    draft.plan &&
    /^why (?:did you (?:choose|pick|suggest) )?(?:these|those|the) (?:tests|risks|probes)\??$/i.test(
      answer,
    )
  ) {
    const reasons = draft.plan.plugins.map(({ reason }) => reason).join(' ');
    return ask(next, field, reasons + ' ' + QUESTIONS[field]);
  }
  if (
    field === 'url' &&
    /^(?:skip|later|not (?:yet|sure)|i(?:['’]m not sure| (?:don['’]t|do not) (?:know|have)(?: (?:it|(?:a |an |the |my )?(?:url|endpoint|target|app)))?(?: yet)?))[.!?]?$/i.test(
      answer,
    )
  ) {
    if (targetFor(draft, config)) {
      return advance(next, config);
    }
    return ask(
      { ...next, deferred: true },
      'url',
      'You can add a connection later. Review and save your test draft now, or send an endpoint or model ID here. Running stays disabled until you connect a target.',
    );
  }
  if (field !== 'url' && draft.connection?.model) {
    throw new Error(
      'The model handles its own requests and responses. Change the target to an HTTP endpoint to customize them.',
    );
  }
  // Split a URL out of an opening description locally. Have the user check
  // and send the remaining text separately before it can reach the model.
  if (!draft.messages.length && field === 'url' && !/^curl\s/i.test(answer)) {
    const match = answer.match(/https?:\/\/[^\s<>"']+/i);
    if (match && match[0] !== answer) {
      const url = match[0].replace(/[.,;]$/, '');
      const connection = parseConnection(url, {}, 'url');
      const remaining = answer
        .replace(match[0], '')
        .replace(/\bat\s*(?=$|[.,;])/i, '')
        .trim();
      const prose =
        remaining.length > 8 &&
        !/[{}]|https?:|bearer|token|password|authorization|api[-_ ]?key/i.test(remaining);
      return ask(
        {
          ...next,
          messages: [{ role: 'user', content: url }],
          connection,
          demo: false,
          input: prose ? remaining : '',
        },
        'scope',
        prose
          ? 'I’ve kept the endpoint here. Check the description below, remove any private details and send it to choose tests.'
          : 'I’ve kept the endpoint here. What does the app do, and what should it never do? Leave out connection details.',
      );
    }
  }
  const destination = answer.match(
    /^(?:actually[, ]+)?(?:use|switch to|change (?:the )?(?:target|url|endpoint) to) (https?:\/\/\S+)(?: instead)?$/i,
  );
  const connection = parseConnection(destination?.[1] ?? answer, draft.connection ?? {}, field);
  // Response examples can contain private records. Keep only the selected field.
  if (field === 'responsePath' && answer.startsWith('{')) {
    messages[messages.length - 1] = {
      role: 'user',
      content: connection.responsePath || 'Plain text',
    };
  }
  return advance(
    { ...next, connection, demo: false, deferred: false, interrupted: undefined },
    config,
  );
}

function scopeReply(draft: SetupDraft, config: Config, response: unknown): SetupDraft {
  const reply = RedteamSetupReplySchema.parse(response);
  if ('explanation' in reply) {
    const next = {
      ...draft,
      messages: [
        ...draft.messages,
        { role: 'assistant', content: reply.explanation, scope: true } as const,
      ],
    };
    if (draft.plan?.plugins.length) {
      return !draft.interrupted && targetFor(draft, config)
        ? { ...next, step: 'ready' }
        : advance(next, config);
    }
    return { ...next, step: 'scope' };
  }
  if (!('plugins' in reply)) {
    return {
      ...draft,
      step: 'scope',
      messages: [...draft.messages, { role: 'assistant', content: reply.question, scope: true }],
    };
  }
  const next = { ...draft, plan: reply, previousPlan: undefined, excluded: [] };
  if (!reply.plugins.length) {
    const selected = selectedPlan(draft);
    return ask(
      { ...next, previousPlan: selected?.plugins.length ? selected : draft.previousPlan },
      'scope',
      `${reply.note} Would you like to test something else or continue manually?`,
    );
  }
  const count = reply.numTests ?? 3;
  if (
    draft.plan &&
    count !== (draft.plan.numTests ?? 3) &&
    !draft.interrupted &&
    targetFor(next, config)
  ) {
    return ask(
      next,
      'ready',
      `I’ve updated the plan to ${count} ${count === 1 ? 'test' : 'tests'} per risk. Check the estimate below.`,
    );
  }
  if (!targetFor(next, config)) {
    next.messages = [
      ...next.messages,
      {
        role: 'assistant',
        content: `I suggest checking for ${reply.plugins.map(({ id }) => riskName(id).replace(/^[A-Z](?=[a-z])/, (letter) => letter.toLowerCase())).join(', ')}.${reply.note ? ' ' + reply.note : ''}`,
      },
    ];
  }
  return advance(next, config);
}

export function useSetupAgent(draft: SetupDraft, setDraft: (draft: SetupDraft) => void) {
  const { config } = useRedTeamConfig();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    callApi(API_PATH, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setDisabled(data.enabled === false))
      .catch(() => {}); // A temporary status failure should not block setup.
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  async function send(answer: string) {
    if (pending || !answer.trim()) {
      return;
    }
    setError('');
    // An explicit correction can answer an earlier question. JSON alone is
    // ambiguous, so interpret it as a response when asking for a reply field.
    const field =
      draft.step === 'responsePath' && answer.startsWith('{')
        ? draft.step
        : (connectionField(answer) ?? (isField(draft.step) ? draft.step : undefined));
    if (field) {
      try {
        setDraft(localReply(draft, config, answer, field));
      } catch (err) {
        setError(
          testSuggestion(answer) && isField(draft.step)
            ? 'This reply is still local. Choose “Edit reply for Promptfoo Cloud” to discuss the tests.'
            : err instanceof Error
              ? err.message
              : 'Check the connection details and try again.',
        );
      }
      return;
    }
    await sendScope(answer);
  }

  async function sendScope(answer: string) {
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    const messages: Message[] = [...draft.messages, { role: 'user', content: answer, scope: true }];
    const selected = selectedPlan(draft);
    try {
      const response = await callApi(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages
            .filter((m) => m.scope)
            .slice(-23)
            .map(({ role, content }) => ({ role, content })),
          previous: selected?.plugins.length ? selected : draft.plan,
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) {
        return;
      }
      if (!response.ok) {
        setError(result.error || UNAVAILABLE);
        return;
      }
      setDraft(scopeReply({ ...draft, messages, input: '' }, config, result));
    } catch {
      setError(UNAVAILABLE);
    } finally {
      setPending(false);
    }
  }
  const selected = selectedPlan(draft);
  const proposed = selected && buildConfig(config, selected, draft);
  const ready = draft.step === 'ready' && !!draft.plan && !!targetFor(draft, config);
  const replacing = proposed && !isEqual(proposed.target, config.target);
  const hasTarget = Boolean(existingTarget(config));
  const canMoveSuggestion = isField(draft.step) && testSuggestion(draft.input);
  function edit(field: Field | 'scope') {
    setError('');
    if (field === 'scope' && isField(draft.step)) {
      const interrupted = { field: draft.step, input: canMoveSuggestion ? '' : draft.input };
      const prompt = canMoveSuggestion
        ? 'Check your reply and remove private details before sending it to Promptfoo Cloud.'
        : 'What would you like to ask or change about the tests? Your connection details stay here.';
      setDraft(
        ask({ ...draft, interrupted, input: canMoveSuggestion ? draft.input : '' }, field, prompt),
      );
    } else if (field !== 'scope') {
      setDraft(ask(draft, field, QUESTIONS[field]));
    }
  }
  function resume() {
    setError('');
    setDraft(advance(draft, config));
  }
  function restorePlan() {
    setError('');
    setDraft(advance({ ...draft, plan: draft.previousPlan, previousPlan: undefined }, config));
  }
  return {
    pending,
    disabled,
    error,
    send,
    clearError: () => setError(''),
    proposed,
    ready,
    replacing,
    hasTarget,
    connected: Boolean(targetFor(draft, config)),
    canMoveSuggestion,
    resume,
    edit,
    restorePlan,
  };
}
