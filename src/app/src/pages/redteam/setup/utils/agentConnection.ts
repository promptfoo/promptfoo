import {
  looksLikeCredentialValue,
  looksLikeRequestCredentialParameter,
} from '@app/stores/evalConfig';
import {
  isSetupAuthHeader,
  isSetupReplyPath,
  type SetupConnectionDraft,
  SetupConnectionDraftSchema,
} from '@promptfoo/types/api/redteamSetup';

import type { ProviderOptions } from '../types';

// A provider ID can start a process or load local code. Limit direct targets
// to text model providers, including only their text generation APIs.
const modelId =
  /^(?:openai:(?:(?:chat|responses):)?(?:gpt-|o[134]\b|chatgpt-)[\w.-]*|anthropic:(?:messages:)?claude-(?!code\b|agent\b)[\w.-]+|google:gemini-[\w.-]+|ollama:(?:chat:)?[\w.-]+(?:[/:][\w.-]+)*)$/;
const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?]|$)/i;
const unsafeTemplate = /\{\{(?!(?:prompt|sessionId)\}\})|\{[%#]|\$\{/;
const secretError = 'Leave out secrets. Use an environment variable name for authentication.';

function validateBody(body: Record<string, unknown>) {
  let hasPrompt = false;
  JSON.stringify(body, (name, value) => {
    if (['$ref', 'constructor', 'prototype', '__proto__'].includes(name) || /[{}]/.test(name)) {
      throw new Error('Use inline JSON without references, templates in keys, or reserved keys.');
    }
    if (
      looksLikeRequestCredentialParameter(name) ||
      (typeof value === 'string' && looksLikeCredentialValue(value))
    ) {
      throw new Error(secretError);
    }
    if (typeof value === 'string') {
      if (unsafeTemplate.test(value) || /file:\/\//i.test(value)) {
        throw new Error(
          'Use only {{prompt}} and {{sessionId}} in request values. Leave out file references.',
        );
      }
      hasPrompt ||= value.includes('{{prompt}}');
    }
    return value;
  });
  if (!hasPrompt) {
    throw new Error('Include {{prompt}} where the test message goes in the JSON body.');
  }
}

function validateUrl(value: string, authenticated: boolean) {
  if (!/^https?:\/\//i.test(value) || !URL.canParse(value) || /[\s\\{}#]/.test(value)) {
    throw new Error('Use a full HTTP or HTTPS endpoint without a fragment or templates.');
  }
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    looksLikeCredentialValue(value) ||
    [...url.searchParams.keys()].some(looksLikeRequestCredentialParameter)
  ) {
    throw new Error('Use a URL without credentials.');
  }
  if (authenticated && url.protocol !== 'https:' && !loopback.test(url.hostname)) {
    throw new Error('Use HTTPS to send credentials outside localhost.');
  }
}

function validate(draft: SetupConnectionDraft) {
  const { url, body, responsePath, authHeader, authEnv, model } = draft;
  if (model !== undefined) {
    if (!modelId.test(model) || Object.keys(draft).some((name) => name !== 'model')) {
      throw new Error('Use a text model provider ID alone, or configure an HTTP target.');
    }
    return;
  }
  if (url !== undefined) {
    validateUrl(url, Boolean(authEnv));
  }
  if (body !== undefined) {
    validateBody(body);
  }
  if (responsePath && !isSetupReplyPath(responsePath)) {
    throw new Error('Use a reply path like result.answer without code.');
  }
  if (authEnv && (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(authEnv) || looksLikeCredentialValue(authEnv))) {
    throw new Error(secretError);
  }
  if (
    authHeader !== undefined &&
    (!isSetupAuthHeader(authHeader) || looksLikeCredentialValue(authHeader) || authEnv === '')
  ) {
    throw new Error('Use a safe credential header only when the endpoint requires authentication.');
  }
}

// These checks establish provenance, never infer intent or interpret a reply.
// Compare whole URL literals so a trusted prefix can't authorize a different host.
function literals(input: string) {
  return input.split(/[\s"'\x60<>()]+/).flatMap((word) => [word, word.replace(/[.,;!?]+$/, '')]);
}

function statesEndpoint(input: string, url: URL) {
  return literals(input).some((word) => {
    const value = loopback.test(word) ? 'http://' + word : word;
    return /^https?:\/\//i.test(value) && URL.canParse(value) && new URL(value).href === url.href;
  });
}

function statesEdit(input: string, previous: URL, url: URL) {
  if (url.hostname !== previous.hostname || url.protocol !== previous.protocol) {
    return false;
  }
  const parts = literals(input);
  if (
    url.port !== previous.port &&
    !parts.includes(url.port || (url.protocol === 'https:' ? '443' : '80'))
  ) {
    return false;
  }
  return (
    (url.pathname === previous.pathname && url.search === previous.search) ||
    parts.includes(url.pathname + url.search)
  );
}

function namesVariable(input: string, variable: string) {
  // A name in a URL path/query is not permission to send that credential.
  const reference = input.replace(
    /(?:https?:\/\/|(?:localhost|127\.0\.0\.1|\[::1\])[:/?])[^\s"'\x60]+/gi,
    '',
  );
  return new RegExp('(?:^|[^\\w-])' + variable + '(?![\\w-])').test(reference);
}

function verifyModel(
  draft: SetupConnectionDraft,
  previous: SetupConnectionDraft | undefined,
  userTurns: string[],
) {
  const latest = userTurns[userTurns.length - 1] ?? '';
  if (draft.model && previous?.model !== draft.model) {
    // A direct provider may use ambient API keys. The user must name the
    // provider and model, especially when moving away from their own endpoint.
    const parts = literals(
      (previous?.url || previous?.model ? latest : userTurns.join(' ')).toLowerCase(),
    );
    const id = draft.model.toLowerCase();
    const [provider] = id.split(':');
    const name = id.replace(/^[^:]+:(?:(?:chat|responses|messages|completion):)?/, '');
    if (!parts.includes(id) && !(parts.includes(provider) && parts.includes(name))) {
      throw new Error(
        'Ask which provider and model to test directly. Never substitute a direct provider for the user’s app or guess a model ID.',
      );
    }
  }
  const model = draft.body?.model;
  if (model !== undefined && model !== previous?.body?.model) {
    const turns = previous?.body?.model ? [latest] : userTurns;
    if (
      typeof model !== 'string' ||
      !model ||
      !turns.some((turn) => literals(turn.replace(/=/g, ' ')).includes(model))
    ) {
      throw new Error('Omit model from the request body unless the user supplies its exact name.');
    }
  }
}

export function bindConnection(
  proposal: SetupConnectionDraft,
  previous: SetupConnectionDraft | undefined,
  userTurns: string[],
): SetupConnectionDraft {
  const result = SetupConnectionDraftSchema.safeParse(proposal);
  if (!result.success) {
    throw new Error('The connection contains unsupported or malformed settings.');
  }
  const draft = result.data;
  validate(draft);
  verifyModel(draft, previous, userTurns);
  const latest = userTurns[userTurns.length - 1] ?? '';
  const url = draft.url ? new URL(draft.url) : undefined;
  const prior = previous?.url ? new URL(previous.url) : undefined;
  if (url && url.href !== prior?.href) {
    const grounded =
      statesEndpoint(latest, url) ||
      (prior
        ? statesEdit(latest, prior, url)
        : !previous?.authEnv && userTurns.some((turn) => statesEndpoint(turn, url)));
    if (!grounded) {
      throw new Error('Ask for the exact endpoint URL before setting or changing the destination.');
    }
  }
  if (draft.authEnv) {
    // A credential grant follows its origin. Dropping the URL or changing a
    // port must never free that grant for reuse at another destination.
    const sameGrant =
      draft.authEnv === previous?.authEnv && (!prior || prior.origin === url?.origin);
    if (!sameGrant && !namesVariable(latest, draft.authEnv)) {
      throw new Error(
        'Ask for the environment variable name for this destination. Never guess or reuse a credential from a different origin.',
      );
    }
  }
  if (draft.authHeader?.toLowerCase() === 'authorization') {
    draft.authHeader = 'Authorization';
  }
  return draft;
}

export function toTarget(
  draft: SetupConnectionDraft,
  { partial = false }: { partial?: boolean } = {},
): ProviderOptions | undefined {
  try {
    validate(draft);
  } catch {
    return undefined;
  }
  if (draft.model) {
    return { id: draft.model, config: {} };
  }
  const { url, body, responsePath, authEnv } = draft;
  if (!url || (!partial && (!body || responsePath === undefined || authEnv === undefined))) {
    return undefined;
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authEnv) {
    const header = draft.authHeader || 'Authorization';
    const variable = '{{env.' + authEnv + '}}';
    if (header.toLowerCase() === 'authorization') {
      headers.Authorization = 'Bearer ' + variable;
    } else {
      headers[header] = variable;
    }
  }
  return {
    id: 'http',
    label: new URL(url).host,
    config: {
      url,
      method: 'POST',
      headers,
      // Fetch otherwise forwards custom credentials across origins on redirects.
      ...(authEnv && { redirect: 'error' as const }),
      ...(body && { body }),
      ...(responsePath !== undefined && {
        transformResponse: responsePath ? 'json.' + responsePath : 'text',
      }),
    },
  };
}
