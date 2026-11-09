/**
 * Lightweight sanity check for the schema used in promptfooconfig.yaml.
 * Zero dependencies - run with plain Node: `node test.js`
 */
const schema = {
  type: 'object',
  properties: {
    sentiment: { enum: ['positive', 'negative', 'neutral'] },
    keywords: { type: 'array', items: { type: 'string' }, maxItems: 3 },
  },
  required: ['sentiment', 'keywords'],
};

function validate(obj, s) {
  if (typeof obj !== 'object' || obj === null) return 'not an object';
  for (const key of s.required) {
    if (!(key in obj)) return `missing ${key}`;
  }
  for (const [key, sub] of Object.entries(s.properties)) {
    if (!(key in obj)) continue;
    if (sub.enum && !sub.enum.includes(obj[key])) {
      return `${key} got ${obj[key]}, expected one of ${sub.enum.join(',')}`;
    }
    if (sub.type === 'array' && !Array.isArray(obj[key])) return `${key} must be array`;
    if (sub.maxItems !== undefined && Array.isArray(obj[key]) && obj[key].length > sub.maxItems) {
      return `${key} has ${obj[key].length} items, max ${sub.maxItems}`;
    }
  }
  return null;
}

const passing = { sentiment: 'positive', keywords: ['fast', 'perfect'] };
const failing = { sentiment: 'joyful', keywords: ['a', 'b', 'c', 'd'] };

console.log('valid case:', validate(passing, schema) ?? 'PASS');
console.log('invalid case:', validate(failing, schema) ?? 'PASS');
