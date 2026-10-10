import fs from 'node:fs';

import { createOpenApiHelpers } from './openapi-helpers.mjs';

import { responseTransform, smokeAssertions } from './response-contract.mjs';

import * as yaml from './vendor/js-yaml.mjs';

function usage(message) {
  if (message) {
    console.error(message);
  }
  console.error(
    'Usage: node openapi-operation-to-config.mjs --spec openapi.yaml --operation-id op --base-url-env API_BASE_URL [--token-env API_TOKEN] [--auth-header Authorization] [--auth-prefix Bearer|none|custom] [--label label] [--smoke-assert text] [--output promptfooconfig.yaml]',
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
} = createOpenApiHelpers(usage, true);

function inputTemplate(name) {
  return PROMPT_FIELDS.has(name) ? '{{prompt}}' : `{{${varName(name)}}}`;
}

function encodedInputTemplate(name) {
  return PROMPT_FIELDS.has(name) ? '{{prompt | urlencode}}' : `{{${varName(name)} | urlencode}}`;
}

function formEncodedBody(fields) {
  return fields
    .map((name) => `${encodeURIComponent(name)}=${encodedInputTemplate(name)}`)
    .join('&');
}

function multipartPart(document, name, schema) {
  if (isMultipartFileSchema(document, schema)) {
    return {
      kind: 'file',
      name,
      filename: `promptfoo-${varName(name)}.pdf`,
      source: {
        type: 'generated',
        generator: 'basic-document',
        format: 'pdf',
        text: `Promptfoo generated document for ${inputTemplate(name)}.`,
      },
    };
  }
  return { kind: 'field', name, value: inputTemplate(name) };
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

// Parameters with these names (or these suffixes) are treated as credentials
// even when they are modeled as plain header/query/cookie parameters rather
// than as OpenAPI securitySchemes. Copying their literal `example` values into
// the generated config could leak real tokens, so the helper forces
// `{{env.<UPPER_NAME>}}` placeholders for them instead.

const credentialParamNames = new Set(
  [...inputs.headerFields, ...inputs.queryFields, ...inputs.cookieFields].filter(
    isCredentialParamName,
  ),
);
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
    credentialParamNames.has(name) ? credentialPlaceholder(name) : inputTemplate(name),
  ]),
);
applyAuthConfig(args, document, operation, headers, queryParams);

const providerConfig = {
  url: `{{env.${args['base-url-env']}}}${promptPath}`,
  method,
  stateful: false,
};
if (Object.keys(headers).length > 0) {
  providerConfig.headers = headers;
}
if (inputs.bodyFields.length > 0) {
  if (inputs.requestIsMultipart) {
    providerConfig.multipart = {
      parts: inputs.bodyFields.map((name) =>
        multipartPart(document, name, inputs.requestProperties[name]),
      ),
    };
  } else if (inputs.requestIsText || inputs.requestBodyIsScalar) {
    providerConfig.body = inputTemplate(inputs.bodyFields[0]);
  } else if (inputs.requestBodyIsArray) {
    providerConfig.body = [
      inputs.requestBodyArrayItemIsObject
        ? Object.fromEntries(inputs.bodyFields.map((name) => [name, inputTemplate(name)]))
        : inputTemplate(inputs.bodyFields[0]),
    ];
  } else {
    providerConfig.body = inputs.requestIsFormUrlEncoded
      ? formEncodedBody(inputs.bodyFields)
      : Object.fromEntries(inputs.bodyFields.map((name) => [name, inputTemplate(name)]));
  }
}
if (Object.keys(queryParams).length > 0) {
  providerConfig.queryParams = queryParams;
}
if (inputs.responseMediaEntry) {
  providerConfig.transformResponse = responseTransform({
    field: inputs.responseField,
    array: inputs.responseIsArray,
    schema: inputs.responseField
      ? inputs.responseProperties[inputs.responseField]
      : inputs.responseSchema,
    resolveRef: (schema) => resolveRef(document, schema),
  });
}

const nonCredentialQueryFields = inputs.queryFields.filter(
  (name) => !credentialParamNames.has(name),
);
const nonCredentialHeaderFields = inputs.headerFields.filter(
  (name) => !credentialParamNames.has(name),
);
const nonCredentialCookieFields = inputs.cookieFields.filter(
  (name) => !credentialParamNames.has(name),
);
const varNames = [...pathVars, ...nonCredentialQueryFields, ...inputs.bodyFields]
  .filter((name) => inputTemplate(name) !== '{{prompt}}')
  .map(varName);
varNames.push(...nonCredentialHeaderFields.map(varName), ...nonCredentialCookieFields.map(varName));
if (!varNames.includes('message')) {
  varNames.push('message');
}
const vars = Object.fromEntries([...new Set(varNames)].map((name) => [name, sampleValue(name)]));
for (const [name, value] of Object.entries(inputs.parameterSamples)) {
  if (name in vars) {
    vars[name] = value;
  }
}
for (const name of inputs.bodyFields) {
  const key = varName(name);
  if (key in vars) {
    vars[key] = PROMPT_FIELDS.has(name)
      ? schemaSample(document, inputs.requestProperties[name], name)
      : (inputs.requestExampleFields[name] ??
        schemaSample(document, inputs.requestProperties[name], name));
  }
}
const config = {
  description: args.description || `Provider setup generated from ${args['operation-id']}`,
  prompts: ['{{message}}'],
  providers: [{ id: 'https', label: args.label || args['operation-id'], config: providerConfig }],
  tests: [
    {
      description: `${args['operation-id']} responds successfully`,
      vars,
      assert: smokeAssertions(Boolean(inputs.responseMediaEntry), args['smoke-assert']),
    },
  ],
};

const output = `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n${yaml.dump(config, { lineWidth: 100, noRefs: true })}`;
if (args.output) {
  fs.writeFileSync(args.output, output);
} else {
  process.stdout.write(output);
}
