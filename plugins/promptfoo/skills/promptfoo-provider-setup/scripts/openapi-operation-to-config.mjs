import fs from 'node:fs';

import { responseTransform, smokeAssertions } from './response-contract.mjs';

import * as yaml from './vendor/js-yaml.mjs';
import { createOpenApiCore, PROMPT_FIELDS } from '../../openapi-converter-core.mjs';

const {
  parseArgs,
  asRecord,
  resolveRef,
  sampleResolvedSchema,
  sampleValue,
  varName,
  isMultipartFileSchema,
  analyzeOperation,
  isCredentialParamName,
  appendCookieHeader,
  authConfigs,
  authValue,
} = createOpenApiCore(usage, schemaSample);

function usage(message) {
  if (message) {
    console.error(message);
  }
  console.error(
    'Usage: node openapi-operation-to-config.mjs --spec openapi.yaml --operation-id op --base-url-env API_BASE_URL [--token-env API_TOKEN] [--auth-header Authorization] [--auth-prefix Bearer|none|custom] [--label label] [--smoke-assert text] [--output promptfooconfig.yaml]',
  );
  process.exit(1);
}

function schemaSample(document, schema, name, depth = 0) {
  if (PROMPT_FIELDS.has(name)) {
    return 'Say exactly PONG.';
  }
  if (!schema || typeof schema !== 'object') {
    return sampleValue(name);
  }
  const resolved = asRecord(resolveRef(document, schema), `${name} schema`);
  return sampleResolvedSchema(document, resolved, name, depth);
}

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

function credentialEnvName(paramName) {
  return varName(paramName).toUpperCase();
}
function credentialPlaceholder(paramName) {
  return `{{env.${credentialEnvName(paramName)}}}`;
}

const args = parseArgs(process.argv.slice(2));
if (!args.spec || !args['operation-id'] || !args['base-url-env']) {
  usage('Missing --spec, --operation-id, or --base-url-env');
}

const document = yaml.load(fs.readFileSync(args.spec, 'utf8'), {
  // Preserve js-yaml v4's support for YAML merge keys in user-supplied specs.
  schema: yaml.CORE_SCHEMA.withTags(yaml.mergeTag),
});
const {
  pathTemplate,
  method,
  operation,
  pathVars,
  parameterSamples,
  queryFields,
  headerFields,
  cookieFields,
  requestMediaEntry,
  requestIsMultipart,
  requestIsText,
  requestBodyIsScalar,
  requestBodyIsArray,
  requestBodyArrayItemIsObject,
  requestIsFormUrlEncoded,
  requestProperties,
  requestExampleFields,
  bodyFields,
  responseMediaEntry,
  responseField,
  responseIsArray,
  responseProperties,
  responseSchema,
} = analyzeOperation(document, args['operation-id']);
const promptPath = pathTemplate.replace(/\{([^}]+)\}/g, (_match, name) =>
  encodedInputTemplate(name),
);

const credentialHeaderFields = headerFields.filter(isCredentialParamName);
const credentialQueryFields = queryFields.filter(isCredentialParamName);
const credentialCookieFields = cookieFields.filter(isCredentialParamName);
const credentialParamNames = new Set([
  ...credentialHeaderFields,
  ...credentialQueryFields,
  ...credentialCookieFields,
]);
const headers =
  requestMediaEntry && !requestIsMultipart
    ? { 'Content-Type': requestMediaEntry?.mediaType || 'application/json' }
    : {};
for (const name of headerFields) {
  headers[name] = credentialParamNames.has(name)
    ? credentialPlaceholder(name)
    : `{{${varName(name)}}}`;
}
for (const name of cookieFields) {
  appendCookieHeader(
    headers,
    name,
    credentialParamNames.has(name) ? credentialPlaceholder(name) : `{{${varName(name)}}}`,
  );
}
const queryParams = Object.fromEntries(
  queryFields.map((name) => [
    name,
    credentialParamNames.has(name) ? credentialPlaceholder(name) : inputTemplate(name),
  ]),
);
if (args['token-env']) {
  for (const auth of authConfigs(args, document, operation).auths) {
    const value = authValue(args['token-env'], auth.prefix);
    if (auth.location === 'query') {
      queryParams[auth.name] = value;
    } else if (auth.location === 'cookie') {
      appendCookieHeader(headers, auth.name, value);
    } else {
      headers[auth.name] = value;
    }
  }
}

const providerConfig = {
  url: `{{env.${args['base-url-env']}}}${promptPath}`,
  method,
  stateful: false,
};
if (Object.keys(headers).length > 0) {
  providerConfig.headers = headers;
}
if (bodyFields.length > 0) {
  if (requestIsMultipart) {
    providerConfig.multipart = {
      parts: bodyFields.map((name) => multipartPart(document, name, requestProperties[name])),
    };
  } else if (requestIsText || requestBodyIsScalar) {
    providerConfig.body = inputTemplate(bodyFields[0]);
  } else if (requestBodyIsArray) {
    providerConfig.body = [
      requestBodyArrayItemIsObject
        ? Object.fromEntries(bodyFields.map((name) => [name, inputTemplate(name)]))
        : inputTemplate(bodyFields[0]),
    ];
  } else {
    providerConfig.body = requestIsFormUrlEncoded
      ? formEncodedBody(bodyFields)
      : Object.fromEntries(bodyFields.map((name) => [name, inputTemplate(name)]));
  }
}
if (Object.keys(queryParams).length > 0) {
  providerConfig.queryParams = queryParams;
}
if (responseMediaEntry) {
  providerConfig.transformResponse = responseTransform({
    field: responseField,
    array: responseIsArray,
    schema: responseField ? responseProperties[responseField] : responseSchema,
    resolveRef: (schema) => resolveRef(document, schema),
  });
}

const nonCredentialQueryFields = queryFields.filter((name) => !credentialParamNames.has(name));
const nonCredentialHeaderFields = headerFields.filter((name) => !credentialParamNames.has(name));
const nonCredentialCookieFields = cookieFields.filter((name) => !credentialParamNames.has(name));
const varNames = [...pathVars, ...nonCredentialQueryFields, ...bodyFields]
  .filter((name) => inputTemplate(name) !== '{{prompt}}')
  .map(varName);
varNames.push(...nonCredentialHeaderFields.map(varName), ...nonCredentialCookieFields.map(varName));
if (!varNames.includes('message')) {
  varNames.push('message');
}
const vars = Object.fromEntries([...new Set(varNames)].map((name) => [name, sampleValue(name)]));
for (const [name, value] of Object.entries(parameterSamples)) {
  if (name in vars) {
    vars[name] = value;
  }
}
for (const name of bodyFields) {
  const key = varName(name);
  if (key in vars) {
    vars[key] = PROMPT_FIELDS.has(name)
      ? schemaSample(document, requestProperties[name], name)
      : (requestExampleFields[name] ?? schemaSample(document, requestProperties[name], name));
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
      assert: smokeAssertions(Boolean(responseMediaEntry), args['smoke-assert']),
    },
  ],
};

const output = `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n${yaml.dump(config, { lineWidth: 100, noRefs: true })}`;
if (args.output) {
  fs.writeFileSync(args.output, output);
} else {
  process.stdout.write(output);
}
