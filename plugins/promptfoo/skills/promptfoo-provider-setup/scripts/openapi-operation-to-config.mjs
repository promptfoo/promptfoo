import fs from 'node:fs';

import * as yaml from 'js-yaml';
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
  credentialPlaceholder,
  appendCookieHeader,
  authConfigs,
  authValue,
  responseAccessor,
} = createOpenApiCore(usage, schemaSample);

function usage(message) {
  if (message) {
    console.error(message);
  }
  console.error(
    'Usage: node openapi-operation-to-config.mjs --spec openapi.yaml --operation-id op --base-url-env API_BASE_URL [--token-env API_TOKEN] [--auth-header Authorization] [--auth-prefix Bearer|none|custom] [--label label] [--output promptfooconfig.yaml]',
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

const args = parseArgs(process.argv.slice(2));
if (!args.spec || !args['operation-id'] || !args['base-url-env']) {
  usage('Missing --spec, --operation-id, or --base-url-env');
}

const {
  document,
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
} = analyzeOperation(args);
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
if (responseField) {
  providerConfig.transformResponse = responseAccessor(
    responseIsArray ? 'json[0]' : 'json',
    responseField,
  );
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
// The canned "Say exactly PONG." prompt is only meaningful when the request
// carries a prompt field (path/query/body) — otherwise the message never reaches
// the target and `contains: PONG` fails by construction. Fall back to a safer
// response-shape assertion.
const promptReachesTarget =
  pathVars.some((name) => PROMPT_FIELDS.has(name)) ||
  queryFields.some((name) => PROMPT_FIELDS.has(name)) ||
  bodyFields.some((name) => PROMPT_FIELDS.has(name)) ||
  (bodyFields.length > 0 && (requestIsText || requestBodyIsScalar));
const responseIsJson = Boolean(responseMediaEntry);
const smokeAssert = promptReachesTarget
  ? [{ type: 'contains', value: 'PONG' }]
  : responseIsJson
    ? [{ type: 'is-json' }]
    : [{ type: 'javascript', value: "typeof output === 'string' && output.length > 0" }];
const config = {
  description: args.description || `Provider setup generated from ${args['operation-id']}`,
  prompts: ['{{message}}'],
  providers: [{ id: 'https', label: args.label || args['operation-id'], config: providerConfig }],
  tests: [
    {
      description: promptReachesTarget
        ? `${args['operation-id']} returns text`
        : `${args['operation-id']} responds successfully`,
      vars,
      assert: smokeAssert,
    },
  ],
};

const output = `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n${yaml.dump(config, { lineWidth: 100, noRefs: true })}`;
if (args.output) {
  fs.writeFileSync(args.output, output);
} else {
  process.stdout.write(output);
}
