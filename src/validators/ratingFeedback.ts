import { z } from 'zod';

// Keep the constraints in regex primitives so YAML/editor JSON Schema validation
// enforces them too. Placeholders belong in the path/query/fragment, never the host.
const templatePattern =
  /^https:\/\/[^/?#@\s{}\\]+(?:[/?#](?:[^\s{}\\]|\{\{(?:evalId|resultId|testCaseId|rating)\}\})*)?$/;
const credentialNames = [
  'key',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'token',
  'secret',
  'clientsecret',
  'password',
  'passwd',
  'authorization',
  'auth',
  'credential',
  'signature',
  'sig',
  'xamzcredential',
  'xamzsignature',
  'xamzsecuritytoken',
];
const credentialKeys = credentialNames
  .map((name) => [...name].map((letter) => `[${letter}${letter.toUpperCase()}]`).join('[._+-]*'))
  .join('|');
const noCredentialsPattern = new RegExp(`^(?![\\s\\S]*[?&#;](?:${credentialKeys})=)[\\s\\S]*$`);
// Encoded parameter names can disguise a credential key from schema validators.
const noEncodedKeysPattern = /^(?![\s\S]*[?&#;][^?&#;=%]*%[^?&#;=]*=)[\s\S]*$/;

export const RatingFeedbackUrlSchema = z
  .string()
  .min(1)
  .max(8192)
  .regex(
    templatePattern,
    'Feedback URLs require HTTPS, no URL credentials, and supported placeholders outside the host',
  )
  .regex(noCredentialsPattern, 'Feedback URLs must not contain credential parameters')
  .regex(noEncodedKeysPattern, 'Feedback URL parameter names must not be percent-encoded')
  .refine((template) => {
    if (template.length > 8192) {
      return false;
    }
    try {
      const url = new URL(
        template.replace(/\{\{(?:evalId|resultId|testCaseId|rating)\}\}/g, 'placeholder'),
      );
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Feedback URL is not a valid HTTPS URL');

// A union preserves the at-least-one-link requirement in generated JSON Schema.
export const RatingFeedbackSchema = z.union([
  z.object({ pass: RatingFeedbackUrlSchema, fail: RatingFeedbackUrlSchema.optional() }),
  z.object({ pass: RatingFeedbackUrlSchema.optional(), fail: RatingFeedbackUrlSchema }),
]);

/** Validate every authored feedback link before an evaluation can be saved or shared. */
export function validateRatingFeedback(config: {
  defaultTest?: unknown;
  tests?: unknown;
  scenarios?: unknown;
}): void {
  const validateTest = (test: unknown) => {
    if (test && typeof test === 'object' && 'feedback' in test && test.feedback !== undefined) {
      RatingFeedbackSchema.parse(test.feedback);
    }
  };
  const validateTests = (tests: unknown) => {
    if (Array.isArray(tests)) {
      tests.forEach(validateTest);
    }
  };
  validateTest(config.defaultTest);
  validateTests(config.tests);
  if (Array.isArray(config.scenarios)) {
    for (const scenario of config.scenarios) {
      validateTests(scenario?.config);
      validateTests(scenario?.tests);
    }
  }
}
