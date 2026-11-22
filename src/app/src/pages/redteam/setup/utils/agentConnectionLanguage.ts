// Read the *roles* of local connection details. Values still have to pass the
// same validators as a field-by-field answer before they can reach a target.
import {
  looksLikeCredentialValue,
  looksLikeRequestCredentialParameter,
} from '@app/stores/evalConfig';
import { isSetupAuthHeader, isSetupReplyPath } from '@promptfoo/types/api/redteamSetup';

export type Field = 'url' | 'body' | 'responsePath' | 'authEnv' | 'authHeader' | 'modelName';
export type Slots = Partial<Record<Field, string | null>> & { openai?: boolean };
type Token = { value: string; word: string; kind: 'word' | 'literal' | 'url' | 'json' };
const words = (value: string) => new Set(value.split(' '));
const requestVerbs = words(
  'post posts send sends sending takes take accepts accept expects expect put pass submit',
);
const replyVerbs = words(
  'return returns returned returning respond responds responding read reads extract get back receive find',
);
const requestNouns = words('request body input payload prompt question message query');
const replyNouns = words('response reply answer output result');
const authWords = words(
  'auth authentication authorization bearer token credentials authenticated header env environment variable',
);
const authContext = words(
  'http no yes post required needed via provided stored uses var need needs require requires expects custom put pass send : =',
);
const separators = words('. , ; ! ? and but then -> →');
const locators = words('under at in from as named called key field property parameter into to use');
const scaffolding = words(
  "the a an i it its that this we my our your you app api bot endpoint url requests it’s it's is are has have with using of for by would should please now instead actually also just json object string field fields key property name parameter use change switch set goes comes value contains me us",
);
const filler = new Set([...scaffolding, ...locators, ...requestVerbs, ...replyVerbs]);
const nouns = new Set([...requestNouns, ...replyNouns]);
const authFiller = new Set([...authContext, ...authWords, ...scaffolding, ...locators]);
const pathLike = /\b\w+(?:\[\d+\])?\.\w+\b/;
const unknown = /\b(?:unsure|unknown|not sure|don['’]?t know|do not know|no idea)\b/i;
const unsupported =
  'I can set up JSON POST requests with bearer auth or an API key header. Use manual setup for other methods or headers.';
const unsupportedHeader =
  'This header needs manual setup. Chat supports common authentication headers such as X-API-Key and Authorization: Bearer.';
const credentialError =
  'Leave out secrets. Give the environment variable name that holds your key.';

export function authHeaderName(value: string): string | undefined {
  if (!isSetupAuthHeader(value)) {
    return undefined;
  }
  return value.toLowerCase() === 'authorization' ? 'Authorization' : value;
}

export function replyField(value: string): string | undefined {
  // The HTTP provider evaluates transformResponse. Accept property reads only.
  const path = value.replace(/^(?:json|\$)\./, '');
  return isSetupReplyPath(path) ? path : undefined;
}

// Recognize bare addresses locally, but only infer HTTP for an exact loopback host.
const address = /(?:^|[\s"'`])(?:localhost\b|\[::1\]|127\.0\.0\.1\b|[\w.-]+:\d+|[\w.-]+\.\w+\/)/i;
const chatFormat =
  /\b(?:openai[- ](?:compatible|style|like|format|chat)|(?:like|similar to|same as|format (?:as|to|of)) (?:the )?openai|chat completions?)\b/i;
const skipModel =
  /^(?:(?:please )?(?:skip|remove|omit|no|without)(?: the)? model(?: name)?|(?:a |the )?model(?: name)? (?:is )?(?:not (?:needed|required)|optional)|i (?:don['’]t know|am not sure of) (?:the )?model(?: name)?)[.!]?$/i;
const modelAssignment =
  /^(?:(?:actually|please)[, ]+)?(?:(?:use|add|set|change|switch to) )?(?:(?:a|the|my|our) )?model(?: name)?(?:[ :=]+(?:(?:is|to|named|called) )?["'`]?[^\s,"'`]+["'`]?[.!]?)$/i;
const formatWords = words(
  'similar format like compatible compatibility style same uses except needs matches follows based on',
);

// Free-form scope messages go to Cloud. A machine value or a clear field
// assignment stays local, even if the connection is already complete.
export function connectionIntent(input: string, ready: boolean): Field | undefined {
  if (
    address.test(input) ||
    /\w+:\/\/|\bcurl\s|\b(?:openai|anthropic|ollama|google|file|exec|python|javascript):\S/i.test(
      input,
    )
  ) {
    return 'url';
  }
  if (
    /\b(?:x-[\w-]*(?:key|token|auth)|api-key)\b/i.test(input) ||
    /^authorization$/i.test(input.trim())
  ) {
    return 'authHeader';
  }
  if (chatFormat.test(input) || skipModel.test(input) || modelAssignment.test(input)) {
    return 'modelName';
  }
  if (input.includes('{')) {
    return 'body';
  }
  if (
    /\b(?:authorization|api[-_ ]?key|password|token)\s*(?:[:=]|is\s+\S+)|\bno auth(?:entication)?\b/i.test(
      input,
    ) ||
    /\b[A-Z][A-Z0-9_]+_(?:TOKEN|KEY)\b|\bsk-[\w-]{8}/.test(input)
  ) {
    return 'authEnv';
  }
  if (/\bheader\b/i.test(input) && /\b(?:x-|auth|key|token|cookie)/i.test(input)) {
    return 'authEnv';
  }
  if (/\bbearer\b/i.test(input) && !/\bbearer token[.!?]?$/i.test(input)) {
    return 'authEnv';
  }
  return fieldIntent(input, ready);
}

function fieldIntent(input: string, ready: boolean): Field | undefined {
  const cues: string[] = input.toLowerCase().match(/\b[\w.]+\b/g) ?? [];
  const request = cues.some((word) => requestVerbs.has(word) || requestNouns.has(word));
  const reply = cues.some((word) => replyVerbs.has(word) || replyNouns.has(word));
  // A field path, key, or explicit assignment points to the connection. A
  // capability ("it takes orders") alone describes the app being tested.
  const path = pathLike.test(input);
  const explicit =
    /\b(?:field|json|request body|plain text|response path|(?:test )?prompt (?:goes )?(?:in|under))\b/i.test(
      input,
    );
  const scope = /\b(?:must|should|never|risks?|tests?|checks?|bypass|leak)\b/i.test(input);
  if (!path && !explicit && scope) {
    return;
  }
  const located = /\b(?:goes|is|responds|returns|back) (?:at|in|under)\b/i.test(input);
  const named = ready && (cues.some((word) => nouns.has(word)) || cues.includes('text'));
  if (path || explicit || located || named) {
    if (reply && (path || explicit || located || cues.some((word) => replyVerbs.has(word)))) {
      return 'responsePath';
    }
    if (request && (path || explicit || located || cues.some((word) => requestVerbs.has(word)))) {
      return 'body';
    }
    if (path && ready) {
      return 'responsePath';
    }
  }
  if (ready && !scope && /\b(?:auth|authentication|bearer token)\b/i.test(input)) {
    return 'authEnv';
  }
}

// Preserve nested JSON examples, including spaces and punctuation inside strings.
function jsonEnd(text: string, start: number) {
  let depth = 0;
  let quoted = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '\\') {
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === '{') {
      depth++;
    } else if (!quoted && char === '}' && --depth === 0) {
      return i + 1;
    }
  }
  throw new Error('Check the braces and quotes in your JSON example.');
}

function token(value: string, kind: Token['kind'] = 'word'): Token {
  const word = kind === 'word' ? value.toLowerCase() : '';
  return { value, word, kind };
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const lexeme =
    /https?:\/\/[^\s<>"'`]+|(?:localhost\b|\[::1\]|127\.0\.0\.1\b|[\w.@-]+:\d+|[\w.-]+\.\w+\/)[^\s<>"'`]*|\$\{\w+\}|\{\{[^}]*\}\}|[\w$][\w$’'\[\].-]*|->|[^\s]/gi;
  let match: RegExpExecArray | null;
  while ((match = lexeme.exec(text))) {
    const original = match[0];
    if (original === '{') {
      lexeme.lastIndex = jsonEnd(text, match.index);
      tokens.push(token(text.slice(match.index, lexeme.lastIndex), 'json'));
      continue;
    }
    if (original === "'" || original === '"' || original === '`') {
      const end = text.indexOf(original, lexeme.lastIndex);
      if (end > lexeme.lastIndex) {
        const value = text.slice(lexeme.lastIndex, end);
        tokens.push(
          token(
            value,
            /^https?:\/\//i.test(value) || address.test(value)
              ? 'url'
              : value.startsWith('{')
                ? 'json'
                : 'literal',
          ),
        );
        lexeme.lastIndex = end + 1;
        continue;
      }
    }
    const value = original.length > 1 ? original.replace(/[.,;!]$/, '') : original;
    tokens.push(token(value, /^https?:\/\//i.test(value) || address.test(value) ? 'url' : 'word'));
    if (original !== value) {
      tokens.push(token(original.slice(-1)));
    }
  }
  return tokens;
}

function role(token: Token, previous?: Token): Field | undefined {
  const { word } = token;
  if (
    authWords.has(word) ||
    isSetupAuthHeader(token.value) ||
    /^(?:[A-Z][A-Z0-9_]*_(?:KEY|TOKEN|AUTH)|\$[A-Z_][A-Z0-9_]*)$/.test(token.value) ||
    (word === 'key' && previous?.word === 'api')
  ) {
    return 'authEnv';
  }
  if (requestVerbs.has(word) || requestNouns.has(word)) {
    return 'body';
  }
  if (replyVerbs.has(word) || replyNouns.has(word)) {
    return 'responsePath';
  }
}

function readAuth(tokens: Token[], slots: Slots, fallback: Field) {
  const text = tokens.map((t) => t.word).join(' ');
  // Keep the explicitly chosen header in “use X instead of Y”.
  const headers = tokens.filter(
    (t, i) =>
      isSetupAuthHeader(t.value) &&
      !(tokens[i - 2]?.word === 'instead' && tokens[i - 1]?.word === 'of'),
  );
  const alternatives = tokens.filter((t) => isSetupAuthHeader(t.value) && !headers.includes(t));
  const names = tokens.filter(
    ({ value }) =>
      /^(?:\$\{?\w+\}?|\{\{\s*env\.\w+\s*\}\}|[A-Z][A-Z0-9_]+)$/.test(value) &&
      !authFiller.has(value.toLowerCase()) &&
      !isSetupAuthHeader(value),
  );
  if (headers.length > 1) {
    throw new Error(
      'Give one authentication header, for example X-API-Key or Authorization: Bearer.',
    );
  }
  if (/\b(?:basic|cookie|oauth)\b/i.test(text) || names.length > 1) {
    throw new Error(unsupported);
  }
  if (
    tokens.some((t) => t.word === 'header') &&
    tokens.some(
      (t) =>
        !isSetupAuthHeader(t.value) &&
        (t.value.includes('-') ||
          ['host', 'origin', 'connection', 'referer', 'cookie', 'forwarded'].includes(t.word)),
    )
  ) {
    throw new Error(unsupportedHeader);
  }
  const credential = tokens.findIndex(
    (t) => isSetupAuthHeader(t.value) || ['bearer', 'token', 'key', 'header'].includes(t.word),
  );
  if (
    credential >= 0 &&
    tokens
      .slice(credential + 1)
      .some(
        (t) =>
          !names.includes(t) &&
          !headers.includes(t) &&
          !alternatives.includes(t) &&
          !authFiller.has(t.word),
      )
  ) {
    throw new Error(credentialError);
  }
  if (alternatives.length && !headers.length) {
    slots.authHeader = null;
    return;
  }
  if (unknown.test(text)) {
    slots[fallback === 'authHeader' ? 'authHeader' : 'authEnv'] = null;
    return;
  }
  if (
    /\b(?:none|public|no|without|(?:doesn['’]?t|does not) (?:need|require)|(?:not|isn['’]?t) (?:needed|required))\b/i.test(
      text,
    )
  ) {
    if (names.length || headers.length || slots.authHeader !== undefined || slots.authEnv) {
      throw new Error('Do you want to use an API key or no authentication?');
    }
    slots.authEnv = 'No auth';
    return;
  }
  const bearer = tokens.some((t) => t.word === 'bearer');
  const header = headers[0]?.value || (bearer ? 'Authorization' : undefined);
  if (
    (bearer && header?.toLowerCase() !== 'authorization') ||
    slots.authEnv === 'No auth' ||
    (header && slots.authHeader && header.toLowerCase() !== slots.authHeader.toLowerCase())
  ) {
    throw new Error('Which authentication header should I use? Give one header name.');
  }
  if (header) {
    slots.authHeader = header;
  } else if (!slots.authHeader && /\b(?:header|api key|key)\b/i.test(text)) {
    slots.authHeader = null;
  }
  if (names.length) {
    slots.authEnv = names[0].value;
  } else if (slots.authHeader === undefined) {
    slots.authEnv = null;
  }
}

function fieldValue(tokens: Token[], field: Field): string | null {
  const text = tokens.map((t) => t.word).join(' ');
  if (unknown.test(text) || /\bor\b/i.test(text)) {
    return null;
  }
  if (field === 'responsePath' && /\b(?:plain|raw)\s*text\b/i.test(text)) {
    return 'Plain text';
  }
  const candidates = tokens.filter(
    (t) => t.kind !== 'word' || (/^[\w$]/.test(t.value) && !filler.has(t.word)),
  );
  // Explicit examples and quoted names take precedence over descriptive words.
  const exact = candidates.filter((t) => t.kind !== 'word' || /[.\[]/.test(t.value));
  if (exact.length) {
    return exact.length === 1 ? exact[0].value : null;
  }
  const last = candidates.pop();
  if (!last) {
    return null;
  }
  const preceding = tokens.slice(0, tokens.indexOf(last));
  if (!preceding.some((t) => locators.has(t.word))) {
    // A role alone ("JSON body", "the response") isn't a field name.
    if (nouns.has(last.word) && !preceding.some((t) => role(t) === field)) {
      return null;
    }
    if (candidates.some((t) => !nouns.has(t.word))) {
      return null;
    }
  }
  return last.value;
}

function impliedField(part: Token[], fallback: Field): Field | undefined {
  if (part.some((t) => t.kind === 'json')) {
    return fallback === 'responsePath' ? fallback : 'body';
  }
  if (part.some((t) => pathLike.test(t.value) && !t.value.includes('{'))) {
    return fallback === 'body' ? fallback : 'responsePath';
  }
  if (fallback === 'authEnv' && part.some((t) => t.word === 'public')) {
    return fallback;
  }
}

function readClause(tokens: Token[], slots: Slots, fallback: Field, continuation: boolean) {
  if (!tokens.length) {
    return;
  }
  let field: Field | undefined;
  let start = 0;
  const store = (end: number) => {
    const part = tokens.slice(start, end);
    const chosen = field ?? impliedField(part, fallback);
    if (!chosen) {
      if (continuation && slots.body && part.some((t) => !filler.has(t.word))) {
        // A second, unlabeled request field needs a JSON example.
        slots.body = null;
      }
      return;
    }
    if (chosen === 'authEnv' || chosen === 'authHeader') {
      readAuth(part, slots, fallback);
      return;
    }
    if (chosen === 'body' && part.every((t) => filler.has(t.word))) {
      // "POST to URL" on its own doesn't change an earlier body.
      return;
    }
    const value = fieldValue(part, chosen);
    if (
      value === null &&
      slots.openai &&
      part.every((t) => filler.has(t.word) || nouns.has(t.word))
    ) {
      return; // "Same request and response format as OpenAI" uses the inferred fields.
    }
    if (slots[chosen] != null && value && slots[chosen] !== value) {
      throw new Error('I found two different values for the same setting. Which one should I use?');
    }
    if (value !== null || slots[chosen] === undefined) {
      slots[chosen] = value;
    }
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = role(token, tokens[i - 1]);
    if (!next) {
      continue;
    }
    const { word } = token;
    if (field && field !== next) {
      // Names like "message" in "returns message" are values, not new topics.
      if (nouns.has(word) && !['field', 'key', 'path', ':'].includes(tokens[i + 1]?.word)) {
        continue;
      }
      const boundary =
        next === 'authEnv' && ['no', 'without'].includes(tokens[i - 1].word) ? i - 1 : i;
      store(boundary);
      start = boundary;
    }
    field = next;
  }
  store(tokens.length);
}

function checkToken(value: string, next: Token | undefined) {
  if (
    !isSetupAuthHeader(value) &&
    (/^x-/i.test(value) ||
      (next?.word === ':' &&
        /^(?:host|origin|connection|forwarded|proxy-.+|content-.+|authorization|cookie)$/i.test(
          value,
        )))
  ) {
    throw new Error(unsupportedHeader);
  }
  if (
    looksLikeCredentialValue(value) ||
    /^sk-/i.test(value) ||
    (value === '@' && next?.kind === 'url') ||
    /^password$/i.test(value) ||
    ((['=', ':'].includes(next?.value ?? '') ||
      (next?.value === 'is' && value.toLowerCase() !== 'token')) &&
      looksLikeRequestCredentialParameter(value) &&
      !isSetupAuthHeader(value))
  ) {
    throw new Error(credentialError);
  }
  const method = value.toUpperCase();
  if (
    ['PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'COOKIE', 'COOKIES', 'OAUTH'].includes(method) ||
    (['GET', 'PUT'].includes(method) &&
      (value === method || next?.kind === 'url' || next?.value === 'request'))
  ) {
    throw new Error(unsupported);
  }
  if (next?.value === '(' && value.includes('.')) {
    throw new Error('Give a field path, like result.answer, without code.');
  }
}

function extractModel(tokens: Token[], slots: Slots) {
  const index = tokens.findIndex((t) => t.word === 'model');
  if (index < 0) {
    return;
  }
  const skip = ['skip', 'remove', 'omit', 'no', 'without'].includes(tokens[index - 1]?.word);
  let end = index + 1;
  while (
    tokens[end] &&
    ['name', 'is', 'named', 'called', 'to', ':', '='].includes(tokens[end].word)
  ) {
    end++;
  }
  if (skip) {
    slots.modelName = '';
  } else if (
    tokens[end]?.word === 'not' &&
    ['needed', 'required'].includes(tokens[end + 1]?.word)
  ) {
    slots.modelName = '';
    end += 2;
  } else if (tokens[end] && !separators.has(tokens[end].word) && !filler.has(tokens[end].word)) {
    let name = tokens[end++].value;
    while (tokens[end + 1] && [':', '/'].includes(tokens[end].word)) {
      name += tokens[end++].value + tokens[end++].value;
    }
    slots.modelName = name;
  }
  tokens.splice(skip ? index - 1 : index, end - (skip ? index - 1 : index));
}

export function readConnectionSlots(input: string, fallback: Field): Slots {
  if (skipModel.test(input)) {
    return { modelName: '' };
  }
  // A bare remote host after POST is a missing protocol, not a dot-separated body field.
  if (/\bpost(?: to)?\s+(?!127\.0\.0\.1\b)[\w.-]+\.\w+(?:[.,;!?]|\s|$)/i.test(input)) {
    throw new Error('Include https:// or http:// before your endpoint address.');
  }
  const tokens = tokenize(input);
  const slots: Slots = {};
  extractModel(tokens, slots);
  const prose = tokens.map((t) => t.word).join(' ');
  if (chatFormat.test(prose) && !/\bresponses api\b/i.test(prose)) {
    slots.openai = true;
  }
  let clause: Token[] = [];
  let continuation = false;
  for (const [index, token] of tokens.entries()) {
    if (token.kind === 'url') {
      if (slots.url) {
        throw new Error('Which endpoint should I use? Give me one URL at a time.');
      }
      slots.url = token.value;
      continue;
    }
    const chatLabel =
      token.word === 'chat' &&
      (tokens[index - 1]?.word === 'openai' ||
        /^completions?$/.test(tokens[index + 1]?.word ?? ''));
    const completionLabel = /^completions?$/.test(token.word) && tokens[index - 1]?.word === 'chat';
    if (
      slots.openai &&
      (formatWords.has(token.word) ||
        chatLabel ||
        completionLabel ||
        /^openai(?:-|$)/.test(token.word))
    ) {
      continue;
    }
    if (token.kind !== 'json') {
      checkToken(token.value, tokens[index + 1]);
    }
    if (separators.has(token.word)) {
      readClause(clause, slots, fallback, continuation);
      continuation = token.word === 'and';
      clause =
        token.value === '->' || token.value === '→'
          ? [{ kind: 'word', value: 'returns', word: 'returns' }]
          : [];
    } else {
      clause.push(token);
    }
  }
  readClause(clause, slots, fallback, continuation);
  if (
    tokens.some(
      (t) =>
        t.kind !== 'json' &&
        t.value.startsWith('{{') &&
        t.value !== '{{prompt}}' &&
        slots.authEnv !== t.value,
    )
  ) {
    throw new Error('Use {{prompt}} as the only template in your request.');
  }
  if (!Object.keys(slots).length && unknown.test(input)) {
    slots[fallback] = null;
  }
  return slots;
}
