import fs from 'node:fs';

import { createOpenApiHelpers } from '../../promptfoo-provider-setup/scripts/openapi-helpers.mjs';

import {
  responseTransform,
  smokeAssertions,
} from '../../promptfoo-provider-setup/scripts/response-contract.mjs';

import * as yaml from '../../promptfoo-provider-setup/scripts/vendor/js-yaml.mjs';

const IDENTITY_FIELDS = new Set(['user_id', 'tenant_id', 'account_id', 'customer_id', 'org_id']);
const TECHNICAL_ID_FIELDS = new Set(['trace_id', 'request_id', 'correlation_id', 'span_id']);

function usage(message) {
  if (message) {
    console.error(message);
  }
  console.error(
    'Usage: node openapi-operation-to-redteam-config.mjs --spec openapi.yaml --operation-id op --base-url-env API_BASE_URL [--token-env API_TOKEN] [--auth-header Authorization] [--auth-prefix Bearer|none|custom] [--generator-provider file://redteam-generator.mjs] [--label label] [--policy text] [--num-tests 1] [--smoke-test true] [--smoke-assert PONG] [--output promptfooconfig.yaml]',
  );
  process.exit(1);
}

const {
  schemaSample,
  operationInputs,
  PROMPT_FIELDS,
  appendCookieHeader,
  asRecord,
  applyAuthConfig,
  credentialPlaceholder,
  findOperation,
  isCredentialParamName,
  isMultipartFileSchema,
  parseArgs,
  resolveRef,
  sampleValue,
  varName,
} = createOpenApiHelpers(usage);

function unique(values) {
  return [...new Set(values)];
}

function isTruthy(value) {
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
}

function isIdentityField(name) {
  if (IDENTITY_FIELDS.has(name)) {
    return true;
  }
  // Identity-bearing _id suffixes: user_id, primary_user_id, owner_account_id, tenant_ids, etc.
  if (/(^|_)(user|tenant|account|customer|org)_ids?$/.test(name)) {
    return true;
  }
  // Role/permission fields stay identity-like whether plural or not, bare or suffixed.
  if (/(^|_)(role|roles|permission|permissions)$/.test(name)) {
    return true;
  }
  return false;
}

function isTechnicalIdField(name) {
  return TECHNICAL_ID_FIELDS.has(name) || name.endsWith('_trace_id');
}

function inputDescription(name) {
  if (isIdentityField(name)) {
    return `Caller identity or tenancy field: ${name}.`;
  }
  if (isTechnicalIdField(name)) {
    return `Target input field: ${name}.`;
  }
  if (name.endsWith('_id')) {
    return `Object identifier being requested: ${name}.`;
  }
  if (PROMPT_FIELDS.has(name)) {
    return 'User-controlled message or instruction to the target.';
  }
  return `Target input field: ${name}.`;
}

function encodedInputTemplate(name) {
  return `{{${varName(name)} | urlencode}}`;
}

function formEncodedBody(fields) {
  return fields
    .map((name) => `${encodeURIComponent(name)}=${encodedInputTemplate(name)}`)
    .join('&');
}

function multipartPart(document, name, schema) {
  const value = `{{${varName(name)}}}`;
  if (isMultipartFileSchema(document, schema)) {
    return {
      kind: 'file',
      name,
      filename: `promptfoo-${varName(name)}.pdf`,
      source: {
        type: 'generated',
        generator: 'basic-document',
        format: 'pdf',
        text: `Promptfoo generated document for ${value}.`,
      },
    };
  }
  return { kind: 'field', name, value };
}

function inferPolicy(fields, operationId) {
  const ids = fields.filter((field) => field.endsWith('_id'));
  const promptFields = fields.filter((field) => PROMPT_FIELDS.has(field));
  const resourceText =
    ids.length > 0 ? ` for requested identifiers (${ids.join(', ')})` : ' for requested resources';
  const promptText =
    promptFields.length > 0
      ? ' It must not let user-controlled instructions override authorization or safety policy.'
      : '';
  return `The ${operationId} target must not disclose, modify, or act on data${resourceText} unless the caller is authorized.${promptText}`;
}

function inferPlugins(fields, policy, numTests) {
  const objectFields = fields.filter(
    (field) => field.endsWith('_id') && !isIdentityField(field) && !isTechnicalIdField(field),
  );
  const identityFields = fields.filter(isIdentityField);
  const plugins = [
    {
      id: 'policy',
      numTests,
      config: {
        policy,
      },
    },
  ];
  if (objectFields.length > 0 || identityFields.length > 0) {
    plugins.push({ id: 'rbac', numTests });
  }
  // Object identifiers (non-identity _id fields) imply broken-object-level-authorization risk.
  if (objectFields.length > 0) {
    plugins.push({ id: 'bola', numTests });
  }
  return plugins;
}

const args = parseArgs(process.argv.slice(2));
if (!args.spec || !args['operation-id'] || !args['base-url-env']) {
  usage('Missing --spec, --operation-id, or --base-url-env');
}

const document = yaml.load(fs.readFileSync(args.spec, 'utf8'), {
  // Preserve js-yaml v4's support for YAML merge keys in user-supplied specs.
  schema: yaml.CORE_SCHEMA.withTags(yaml.mergeTag),
});
const { pathTemplate, pathItem, method, operation } = findOperation(
  asRecord(document, 'OpenAPI document'),
  args['operation-id'],
);
const pathVars = [...pathTemplate.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
const promptPath = pathTemplate.replace(/\{([^}]+)\}/g, (_match, name) =>
  encodedInputTemplate(name),
);
const inputs = operationInputs(document, pathItem, operation, pathVars);
const fieldSamples = Object.fromEntries([
  ...Object.entries(inputs.parameterSamples),
  ...inputs.bodyFields.map((name) => [
    varName(name),
    PROMPT_FIELDS.has(name)
      ? schemaSample(document, inputs.requestProperties[name], name)
      : (inputs.requestExampleFields[name] ??
        schemaSample(document, inputs.requestProperties[name], name)),
  ]),
]);
// Parameters with these names (or suffixes) are treated as credentials even
// when the spec models them as plain header/query/cookie parameters rather
// than as securitySchemes. Their example values are replaced with
// `{{env.<UPPER_NAME>}}` placeholders so generated configs never embed real
// tokens.

const credentialParamNames = new Set(
  [...inputs.headerFields, ...inputs.queryFields, ...inputs.cookieFields].filter(
    isCredentialParamName,
  ),
);
const nonCredentialHeaderFields = inputs.headerFields.filter(
  (name) => !credentialParamNames.has(name),
);
const nonCredentialQueryFields = inputs.queryFields.filter(
  (name) => !credentialParamNames.has(name),
);
const nonCredentialCookieFields = inputs.cookieFields.filter(
  (name) => !credentialParamNames.has(name),
);
const headerVars = nonCredentialHeaderFields.map(varName);
const cookieVars = nonCredentialCookieFields.map(varName);
const fields = unique([
  ...pathVars.map(varName),
  ...nonCredentialQueryFields.map(varName),
  ...inputs.bodyFields.map(varName),
  ...headerVars,
  ...cookieVars,
]);
if (fields.length === 0) {
  usage(
    'Selected operation has no controllable request inputs; use provider setup for response checks.',
  );
}
const numTests = Number.parseInt(args['num-tests'] || '1', 10);
if (!Number.isInteger(numTests) || numTests < 1) {
  usage('--num-tests must be a positive integer');
}
const policy = args.policy || inferPolicy(fields, args['operation-id']);

const headers =
  inputs.requestMediaEntry && !inputs.requestIsMultipart
    ? { 'Content-Type': inputs.requestMediaEntry?.mediaType || 'application/json' }
    : {};
for (const name of inputs.headerFields) {
  headers[name] = credentialParamNames.has(name)
    ? credentialPlaceholder(name)
    : `{{${varName(name)}}}`;
}
for (const name of inputs.cookieFields) {
  appendCookieHeader(
    headers,
    name,
    credentialParamNames.has(name) ? credentialPlaceholder(name) : `{{${varName(name)}}}`,
  );
}
const queryParams = Object.fromEntries(
  inputs.queryFields.map((name) => [
    name,
    credentialParamNames.has(name) ? credentialPlaceholder(name) : `{{${varName(name)}}}`,
  ]),
);
applyAuthConfig(args, document, operation, headers, queryParams);

const targetConfig = {
  url: `{{env.${args['base-url-env']}}}${promptPath}`,
  method,
  stateful: false,
};
if (Object.keys(headers).length > 0) {
  targetConfig.headers = headers;
}
if (inputs.bodyFields.length > 0) {
  if (inputs.requestIsMultipart) {
    targetConfig.multipart = {
      parts: inputs.bodyFields.map((name) =>
        multipartPart(document, name, inputs.requestProperties[name]),
      ),
    };
  } else if (inputs.requestIsText || inputs.requestBodyIsScalar) {
    targetConfig.body = `{{${varName(inputs.bodyFields[0])}}}`;
  } else if (inputs.requestBodyIsArray) {
    targetConfig.body = [
      inputs.requestBodyArrayItemIsObject
        ? Object.fromEntries(inputs.bodyFields.map((name) => [name, `{{${varName(name)}}}`]))
        : `{{${varName(inputs.bodyFields[0])}}}`,
    ];
  } else {
    targetConfig.body = inputs.requestIsFormUrlEncoded
      ? formEncodedBody(inputs.bodyFields)
      : Object.fromEntries(inputs.bodyFields.map((name) => [name, `{{${varName(name)}}}`]));
  }
}
if (Object.keys(queryParams).length > 0) {
  targetConfig.queryParams = queryParams;
}
if (inputs.responseMediaEntry) {
  targetConfig.transformResponse = responseTransform({
    field: inputs.responseField,
    array: inputs.responseIsArray,
    schema: inputs.responseField
      ? inputs.responseProperties[inputs.responseField]
      : inputs.responseSchema,
    resolveRef: (schema) => resolveRef(document, schema),
  });
}

const redteam = {
  purpose: policy,
  maxConcurrency: 1,
  numTests,
  plugins: inferPlugins(fields, policy, numTests),
  strategies: [{ id: 'jailbreak:meta', config: { numIterations: 2 } }],
};
if (args['generator-provider']) {
  redteam.provider = args['generator-provider'];
}

const defaultVars = Object.fromEntries(
  fields.map((name) => [name, fieldSamples[name] ?? sampleValue(name)]),
);
const includeSmokeTest = isTruthy(args['smoke-test']) || Boolean(args['smoke-assert']);
const config = {
  description: args.description || `Redteam setup generated from ${args['operation-id']}`,
  targets: [
    {
      id: 'https',
      label: args.label || args['operation-id'],
      inputs: Object.fromEntries(fields.map((name) => [name, inputDescription(name)])),
      config: targetConfig,
    },
  ],
  defaultTest: {
    vars: defaultVars,
  },
  ...(includeSmokeTest
    ? {
        tests: [
          {
            description: `${args['operation-id']} smoke test`,
            vars: defaultVars,
            assert: smokeAssertions(Boolean(inputs.responseMediaEntry), args['smoke-assert']),
          },
        ],
      }
    : {}),
  redteam,
};

const output = `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n${yaml.dump(config, { lineWidth: 100, noRefs: true })}`;
if (args.output) {
  fs.writeFileSync(args.output, output);
} else {
  process.stdout.write(output);
}
