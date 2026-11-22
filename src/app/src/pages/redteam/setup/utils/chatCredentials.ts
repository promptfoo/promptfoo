import { isPlainObject } from '@app/utils/isPlainObject';
import { headerVariable, localKeyPrefix } from '@promptfoo/types/api/redteamSetup';

type Keys = Record<string, string>;

// Mask explicit credential assignments before building the hosted conversation.
// The model decides which header to use. Only Test, Run and Save YAML need values.
const assignment =
  /\b((?:(?:(?:api[ _-]?)?key|(?:access[ _-]?)?token|password|secret|authorization|x-(?!tenant-id\b|org-id\b|api-version\b)[\w-]+)["']?\s*(?:[:=]\s*|\bis\s+))(?:(?:Bearer|Basic|Token|ApiKey)\s+)?|Bearer\s+)(?:"([^"\n]+)"|'([^'\n]+)'|`([^`\n]+)`|([\w+./=~-]+)(?=$|[,;\n]|[.!?]\s))/gi;

export function captureKeys(input: string, previous: Keys = {}) {
  const keys = { ...previous };
  let content = input.replace(assignment, (match, prefix, double, single, code, bare) => {
    const supplied: string = double ?? single ?? code ?? bare.replace(/[.!?]+$/, '');
    const value = supplied.replace(/^(?:Bearer|Basic|Token|ApiKey) /i, '');
    if (
      !value ||
      value.startsWith('{{') ||
      value.startsWith('$') ||
      (bare &&
        (/^(?:bearer|basic|token|auth|authentication|authorization|x-[\w-]+|none|unknown|required|optional|missing|unset|invalid)$/i.test(
          value,
        ) ||
          /^[A-Z_][A-Z0-9_]*$/.test(value)))
    ) {
      return match;
    }
    const name =
      Object.keys(keys).find((key) => keys[key] === value) ??
      localKeyPrefix + crypto.randomUUID().replace(/-/g, '').toUpperCase();
    keys[name] = value;
    const ref = '{{env.' + name + '}}';
    const start = prefix.length + (bare ? 0 : 1) + supplied.length - value.length;
    return match.slice(0, start) + ref + match.slice(start + value.length);
  });
  // A follow-up can refer to a previously supplied value without naming the header again.
  const byValue = new Map(Object.entries(keys).map(([name, value]) => [value, name]));
  content = content.replace(/[^\s"'\x60,;{}]+/g, (word) => {
    const value = byValue.has(word) ? word : word.replace(/[.!?]+$/, '');
    const name = byValue.get(value);
    return name ? '{{env.' + name + '}}' + word.slice(value.length) : word;
  });
  return { content, keys };
}

export function displayKeys(value: string) {
  return value.replace(
    /(?:\{\{\s*env\.)?PROMPTFOO_CHAT_KEY_[A-F0-9]{32}(?:\s*\}\})?/g,
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
  const list = result.targets ?? result.providers;
  if (!Array.isArray(list)) {
    return result;
  }
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
