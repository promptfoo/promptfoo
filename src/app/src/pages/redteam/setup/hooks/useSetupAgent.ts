import { useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import {
  isSetupReplyPath,
  type RedteamSetupPlan,
  RedteamSetupReplySchema,
} from '@promptfoo/types/api/redteamSetup';
import isEqual from 'fast-deep-equal';
import { type ConnectionDraft, parseConnection, toTarget } from '../utils/agentConnection';
import { connectionIntent } from '../utils/agentConnectionLanguage';
import { riskName } from '../utils/plugins';
import { applicationDefinitionToPurpose } from '../utils/purposeParser';
import { missingEndpoint } from '../utils/targetDestination';
import { EXAMPLE_CONFIG, useRedTeamConfig } from './useRedTeamConfig';

import type { Config, ProviderOptions } from '../types';

const API_PATH = '/redteam/setup-plan';
const UNAVAILABLE = 'Could not reach the setup agent. Send your reply again or set up manually.';
const QUESTIONS = {
  url: 'What’s the URL of your API? You can also use a model ID like ollama:chat:llama3.',
  body: 'Where should I put the test prompt in your request? Tell me the field name, or share an example JSON body.',
  responsePath:
    'Where is the answer in the response? Give me a field like result.answer, paste an example, or choose plain text.',
  authEnv:
    'Does the endpoint need a bearer token? Give me the name of an environment variable set where you run Promptfoo. Never paste the token itself.',
};
const CONNECT =
  'How do I reach your app? Describe your API in your own words, paste a cURL request, or give me a model ID. Share what you know and leave out secrets.';
const DISCOVER =
  'Test the connection to find the reply field, or tell me where to read it. I won’t contact your API until you confirm.';
export type Field = keyof typeof QUESTIONS;
type Step = Field | 'scope' | 'ready';
interface Message {
  role: 'user' | 'assistant';
  content: string;
  // Only app and test-scope exchanges belong in requests to the hosted agent.
  scope?: true;
  test?: 'success' | 'error';
}

export interface SetupDraft {
  messages: Message[];
  input: string;
  step: Step;
  demo?: boolean;
  deferred?: boolean;
  discoverResponse?: boolean;
  tested?: { target?: ProviderOptions; success: boolean; paths?: string[] };
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

function nextField(connection?: ConnectionDraft, discover = false): Field {
  if (!connection?.url) {
    return 'url';
  }
  if (!connection.body) {
    return 'body';
  }
  if (discover && connection.authEnv === undefined) {
    return 'authEnv';
  }
  return connection.responsePath === undefined ? 'responsePath' : 'authEnv';
}

function ask(draft: SetupDraft, step: Step, content: string): SetupDraft {
  return { ...draft, step, messages: [...draft.messages, { role: 'assistant', content }] };
}

function advance(draft: SetupDraft, config: Config): SetupDraft {
  if (!draft.plan?.plugins.length && !(draft.discoverResponse && !targetFor(draft, config))) {
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
  const field = nextField(draft.connection, draft.discoverResponse);
  if (field === 'url' && !draft.connection && !draft.discoverResponse) {
    return ask(draft, field, CONNECT);
  }
  if (field === 'responsePath' && draft.discoverResponse) {
    return ask(draft, field, DISCOVER);
  }
  if (field === 'body' && draft.step === 'body') {
    return ask(
      draft,
      field,
      'Look for an example JSON request in your API docs. Paste it without secrets and mark where the message goes with {{prompt}}. You can also try an example below, then test the connection.',
    );
  }
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

function connectionField(input: string, step: Step) {
  return isField(step) ? step : connectionIntent(input, step === 'ready');
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
  url: 'Promptfoo needs a destination to test. Nothing will be sent there until you test the connection or start a run.',
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
  if (testSuggestion(answer) && !connectionIntent(answer, false)) {
    throw new Error('Choose “Adjust tests” to discuss the scope.');
  }
  const { description, details } = draft.messages.length
    ? { details: answer }
    : splitOpening(answer);
  const previous = draft.connection ?? {};
  const connection = parseConnection(details, previous, field);
  if (previous.model && !connection.url && !connection.model) {
    throw new Error(
      'The model handles its own requests and responses. Change the target to an HTTP endpoint to customize them.',
    );
  }
  const discoverResponse =
    connection.responsePath === undefined &&
    (draft.discoverResponse ||
      (field === 'responsePath' &&
        !connection.model &&
        (isEqual(previous, connection) ||
          (previous.responsePath !== undefined && previous.url === connection.url))) ||
      /\b(?:not sure|unsure|don['’]t know|no idea)\b.{0,50}\b(?:response|reply|comes back|returns?)\b/i.test(
        answer,
      ));
  // Examples can contain private records. Show the extracted field instead.
  if (
    answer.includes('{') &&
    (field === 'responsePath' || /(?:returns?|response|responds?|reply|->|→)/i.test(answer))
  ) {
    messages[messages.length - 1] = {
      role: 'user',
      content:
        connection.responsePath === undefined
          ? 'Shared an API response example.'
          : 'Read the reply from ' + (connection.responsePath || 'plain text') + '.',
    };
  }
  const updated = {
    ...next,
    connection,
    demo: false,
    deferred: false,
    interrupted: undefined,
    discoverResponse,
    tested: isEqual(previous, connection) ? draft.tested : undefined,
  };
  if (description) {
    return ask(
      { ...updated, input: description },
      'scope',
      'I’ve kept the connection details here. Check the app description below, remove any private details and send it to choose tests.',
    );
  }
  return advance(updated, config);
}

// Offer only a separate app description for explicit confirmation. All API
// clauses remain local, including field names and environment references.
function splitOpening(input: string): { description?: string; details: string } {
  const match = input.match(
    /^(.+?)(?:\s+at\s+(?=https?:\/\/)|[.!?]\s+(?=(?:post|send|curl|https?:\/\/|the (?:api|endpoint|url))\b))/i,
  );
  if (!match) {
    return { details: input };
  }
  const description = match[1].trim();
  if (
    description.length < 9 ||
    connectionIntent(description, true) ||
    /[{}$\/]|\w\.\w|\b(?:api|post|get|put|patch|delete|header|auth|body|field|response|reply|input|bearer|token|password|authorization|api[-_ ]?key)\b/i.test(
      description,
    )
  ) {
    return { details: input };
  }
  return { description, details: input.slice(match[0].length) };
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
    const field = connectionField(answer, draft.step);
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
  const target = targetFor(draft, config);
  const ready = draft.step === 'ready' && !!draft.plan && !!target;
  const replacing = proposed && !isEqual(proposed.target, config.target);
  const hasTarget = Boolean(existingTarget(config));
  const canMoveSuggestion =
    isField(draft.step) && testSuggestion(draft.input) && !connectionIntent(draft.input, false);
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
  function chooseTestedPath(path: string) {
    const { tested, connection } = draft;
    if (
      pending ||
      draft.input.trim() ||
      !connection ||
      !tested?.paths?.includes(path) ||
      !isEqual(tested.target, toTarget(connection)) ||
      (path !== 'Plain text' && !isSetupReplyPath(path))
    ) {
      return;
    }
    const updated = { ...connection, responsePath: path === 'Plain text' ? '' : path };
    const target = toTarget(updated);
    if (!target) {
      return;
    }
    setError('');
    setDraft(
      advance(
        {
          ...draft,
          connection: updated,
          tested: { target, success: true },
          discoverResponse: false,
          messages: [
            ...draft.messages,
            { role: 'user', content: 'Use ' + path + ' for the reply.' },
          ],
        },
        config,
      ),
    );
  }
  function prepareTest(answer: string) {
    setError('');
    const field = nextField(draft.connection, true);
    setDraft(
      ask(
        {
          ...draft,
          input: '',
          discoverResponse: true,
          interrupted: undefined,
          messages: [...draft.messages, { role: 'user', content: answer }],
        },
        field,
        'Before testing the connection, I need one more detail. ' + QUESTIONS[field],
      ),
    );
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
    target,
    connected: Boolean(target),
    canMoveSuggestion,
    local: connectionField(draft.input.trim(), draft.step) !== undefined,
    prepareTest,
    chooseTestedPath,
    resume,
    edit,
    restorePlan,
  };
}
