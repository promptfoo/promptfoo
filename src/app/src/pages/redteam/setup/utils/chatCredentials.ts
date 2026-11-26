import { isPlainObject } from '@app/utils/isPlainObject';
import { headerVariable, localKeyPrefix } from '@promptfoo/types/api/redteamSetup';

type Keys = Record<string, string>;

// Mask explicit credential assignments before building the hosted conversation.
// The model decides which header to use. Only Test, Run and Save YAML need values.
const assignment =
  /(?<![\w-])((?:(?:(?:api[ _-]?)?key|(?:access[ _-]?)?token|password|secret|authorization|x-(?!tenant-id\b|org-id\b|api-version\b)[\w-]+|(?!idempotency-key\b)[\w-]+-(?:access|key|token|auth|secret))["']?\s*(?:[:=]\s*|\bis\s+))(?:(?:Bearer|Basic|Token|ApiKey)\s+)?|Bearer\s+)(?:"((?:[^"\\\n]|\\.)+)(?:"|$)|'((?:[^'\\\n]|\\.)+)(?:'|$)|`([^`\n]+)(?:`|$)|([\w+./=~!?#%$@:&^*-]+)(?=$|[\s,;)}\]]))/gi;

export function captureKeys(input: string, previous: Keys = {}) {
  const keys = { ...previous };
  const content = input.replace(assignment, (match, prefix, double, single, code, bare, offset) => {
    const supplied: string = double ?? single ?? code ?? bare.replace(/[.!?]+$/, '');
    const raw = supplied.replace(/^(?:Bearer|Basic|Token|ApiKey) /i, '');
    const value = raw.replace(/\\(["'\\])/g, '$1');
    // Native template variables are references even in fields like "key".
    if (
      !value ||
      headerVariable(value) ||
      /^\{\{\s*[a-z_]\w*(?:\.\w+)*(?:\s*\|\s*\w+)*\s*\}\}$/i.test(value) ||
      /^\$\{[a-z_]\w*\}$/i.test(value) ||
      (bare ? /^\$[a-z_]\w*$/i : /^\$[A-Z_][A-Z0-9_]*$/).test(value)
    ) {
      return match;
    }
    if (bare) {
      // Distinguish "the key is in the header" and variable names from literal assignments.
      const rest = input.slice(offset + match.length);
      if (
        (/\bis\s+$/i.test(prefix) &&
          !bare.endsWith('.') &&
          /^\s+\w/.test(rest) &&
          !/^\s+(?:and|then|in|with|please)\b/i.test(rest)) ||
        /^(?:bearer|basic|token|auth|authentication|authorization|x-[\w-]+|none|unknown|required|optional|missing|unset|invalid|wrong)$/i.test(
          value,
        ) ||
        /^[A-Z_][A-Z0-9_]*$/.test(value)
      ) {
        return match;
      }
    }
    const name =
      Object.keys(keys).find((key) => keys[key] === value) ??
      localKeyPrefix + crypto.randomUUID().replace(/-/g, '').toUpperCase();
    keys[name] = value;
    const ref = '{{env.' + name + '}}';
    const start = prefix.length + (bare ? 0 : 1) + supplied.length - raw.length;
    return match.slice(0, start) + ref + match.slice(start + raw.length);
  });
  // A follow-up can repeat a value without naming the header, including next to punctuation.
  const names = new Map(Object.entries(keys).map(([name, value]) => [value, name]));
  if (!names.size) {
    return { content, keys };
  }
  const values = [...names.keys()]
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const known = new RegExp(
    '\\{\\{env\\.PROMPTFOO_CHAT_KEY_[A-F0-9]{32}\\}\\}|(?<!\\w)(?:' + values + ')(?!\\w)',
    'g',
  );
  return {
    content: content.replace(known, (value) => {
      const name = names.get(value);
      return name ? '{{env.' + name + '}}' : value;
    }),
    keys,
  };
}

export function displayKeys(value: string) {
  return value.replace(
    /(?:\{\{\s*env(?:\.|\[['"]))?PROMPTFOO_CHAT_KEY_[A-F0-9]{32}(?:(?:['"]\])?\s*\}\})?/g,
    '[provided key]',
  );
}

// Bind only references in headers of approved targets. Never interpolate an
// agent-supplied expression or substitute a key into surrounding prose or URLs.
export function keysForTargets(targets: unknown[], keys: Keys = {}) {
  const used: Keys = {};
  for (const target of targets) {
    if (
      !isPlainObject(target) ||
      !isPlainObject(target.config) ||
      !isPlainObject(target.config.headers)
    ) {
      continue;
    }
    for (const value of Object.values(target.config.headers)) {
      const name = typeof value === 'string' && headerVariable(value);
      if (name && Object.prototype.hasOwnProperty.call(keys, name)) {
        used[name] = keys[name];
      }
    }
  }
  return Object.keys(used).length ? used : undefined;
}

export function exportWithKeys(config: Record<string, unknown>, keys: Keys, approved: number[]) {
  const result = structuredClone(config);
  const entries = result.targets ?? result.providers;
  const list = Array.isArray(entries) ? entries : [entries];
  for (const index of approved) {
    const headers = list[index]?.config?.headers;
    for (const [header, value] of Object.entries(headers ?? {})) {
      if (typeof value !== 'string') {
        continue;
      }
      const name = headerVariable(value);
      if (name && Object.prototype.hasOwnProperty.call(keys, name)) {
        headers[header] = value.replace(/\{\{.*\}\}/, () => keys[name]);
      }
    }
  }
  return result;
}
