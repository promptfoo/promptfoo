import fs from 'node:fs';

import {
  OpenApiInputError,
  PROMPT_FIELDS,
  appendCookieHeader,
  asRecord,
  authConfigs,
  authValue,
  effectiveParameters,
  findOperation,
  getJsonMediaEntry,
  getRequestMediaEntry,
  isCredentialParamName,
  isFormUrlEncodedMediaType,
  isMultipartFileSchema,
  isMultipartMediaType,
  isPlainRecord,
  isReadOnlySchema,
  isScalarSchema,
  isTextMediaType,
  objectSample,
  orderedProperties,
  parseArgs,
  resolveRef,
  responseOutputField,
  sampleValue,
  schemaArrayItems,
  schemaFromMedia,
  schemaProperties,
  schemaType,
  schemaVariant,
  stringSample,
  successResponse,
  varName,
} from './openapi-helpers.mjs';

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

function schemaSample(document, schema, name, depth = 0) {
  if (PROMPT_FIELDS.has(name)) {
    return 'Say exactly PONG.';
  }
  if (!schema || typeof schema !== 'object') {
    return sampleValue(name);
  }
  const resolved = asRecord(resolveRef(document, schema), `${name} schema`);
  if ('const' in resolved && resolved.const !== null) {
    return resolved.const;
  }
  if ('example' in resolved && resolved.example !== null) {
    return resolved.example;
  }
  if ('default' in resolved && resolved.default !== null) {
    return resolved.default;
  }
  if (
    Array.isArray(resolved.examples) &&
    resolved.examples.length > 0 &&
    resolved.examples[0] !== null
  ) {
    return resolved.examples[0];
  }
  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
    return resolved.enum[0];
  }
  const variant = schemaVariant(resolved);
  if (variant) {
    return schemaSample(document, variant, name, depth + 1);
  }
  if (depth > 4) {
    return sampleValue(name);
  }
  const type = schemaType(resolved);
  if (type === 'integer' || type === 'number') {
    return 1;
  }
  if (type === 'boolean') {
    return true;
  }
  if (type === 'array') {
    return [schemaSample(document, resolved.items, name, depth + 1)];
  }
  if (type === 'object') {
    const properties = schemaProperties(document, resolved);
    const names = orderedProperties(document, resolved).slice(0, 6);
    return Object.fromEntries(
      names.map((propertyName) => [
        propertyName,
        schemaSample(document, properties[propertyName], propertyName, depth + 1),
      ]),
    );
  }
  if (type === 'string' || typeof resolved.format === 'string') {
    return stringSample(resolved, name);
  }
  return sampleValue(name);
}

function parameterSample(document, parameter) {
  if (PROMPT_FIELDS.has(parameter.name)) {
    return 'Say exactly PONG.';
  }
  const example = objectSample(document, parameter, `${parameter.name} parameter`);
  return example === undefined
    ? schemaSample(
        document,
        parameter.schema,
        parameter.in === 'header' ? varName(parameter.name) : parameter.name,
      )
    : example;
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

try {
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
  const parameters = effectiveParameters(document, pathItem, operation);
  const parameterSamples = Object.fromEntries(
    parameters
      .filter((parameter) => typeof parameter.name === 'string')
      .map((parameter) => [varName(parameter.name), parameterSample(document, parameter)]),
  );
  const queryFields = parameters
    .filter((parameter) => parameter.in === 'query')
    .map((parameter) => parameter.name)
    .filter((name) => typeof name === 'string');
  const headerFields = parameters
    .filter((parameter) => parameter.in === 'header')
    .map((parameter) => parameter.name)
    .filter((name) => typeof name === 'string');
  const cookieFields = parameters
    .filter((parameter) => parameter.in === 'cookie')
    .map((parameter) => parameter.name)
    .filter((name) => typeof name === 'string');
  const requestBody = asRecord(resolveRef(document, operation.requestBody || {}), 'requestBody');
  const requestMediaEntry = getRequestMediaEntry(
    document,
    asRecord(requestBody.content || {}, 'requestBody.content'),
  );
  const requestMedia = requestMediaEntry?.media;
  const requestExample = objectSample(document, requestMedia, 'requestBody application/json');
  const requestExampleIsArray = Array.isArray(requestExample);
  const requestExampleArrayItemIsObject = requestExampleIsArray && isPlainRecord(requestExample[0]);
  const requestExampleIsScalar =
    requestExample !== undefined && !requestExampleIsArray && !isPlainRecord(requestExample);
  const requestSchema = schemaFromMedia(document, requestMedia);
  const requestIsFormUrlEncoded = isFormUrlEncodedMediaType(requestMediaEntry?.mediaType || '');
  const requestIsMultipart = isMultipartMediaType(requestMediaEntry?.mediaType || '');
  const requestIsText = isTextMediaType(requestMediaEntry?.mediaType || '');
  const requestArrayItemSchema =
    requestSchema && !requestIsFormUrlEncoded && !requestIsMultipart && !requestIsText
      ? schemaArrayItems(document, requestSchema)
      : undefined;
  const requestArrayItemProperties = requestArrayItemSchema
    ? schemaProperties(document, requestArrayItemSchema)
    : {};
  const requestArrayItemIsObject = Object.keys(requestArrayItemProperties).length > 0;
  const requestBodyIsArray = Boolean(
    !requestIsFormUrlEncoded &&
      !requestIsMultipart &&
      !requestIsText &&
      (requestArrayItemSchema || requestExampleIsArray),
  );
  const requestBodyArrayItemIsObject = requestArrayItemSchema
    ? requestArrayItemIsObject
    : requestExampleArrayItemIsObject;
  const effectiveRequestSchema = requestArrayItemSchema || requestSchema;
  const requestBodyIsScalar =
    (!effectiveRequestSchema && requestExampleIsScalar) ||
    Boolean(
      effectiveRequestSchema &&
        !requestBodyIsArray &&
        !requestIsFormUrlEncoded &&
        !requestIsMultipart &&
        isScalarSchema(document, effectiveRequestSchema),
    );
  const requestProperties =
    requestArrayItemSchema && !requestArrayItemIsObject
      ? { message: requestArrayItemSchema }
      : requestBodyIsScalar && effectiveRequestSchema
        ? { message: effectiveRequestSchema }
        : effectiveRequestSchema
          ? schemaProperties(document, effectiveRequestSchema)
          : {};
  const requestExampleFields = isPlainRecord(requestExample)
    ? requestExample
    : Array.isArray(requestExample) && isPlainRecord(requestExample[0])
      ? requestExample[0]
      : Array.isArray(requestExample) && requestExample.length > 0
        ? { message: requestExample[0] }
        : requestExampleIsScalar
          ? { message: requestExample }
          : {};
  const bodyFields = effectiveRequestSchema
    ? (requestIsText || requestBodyIsScalar || (requestArrayItemSchema && !requestArrayItemIsObject)
        ? ['message']
        : orderedProperties(document, effectiveRequestSchema)
      ).filter(
        (name) =>
          !pathVars.includes(name) &&
          !queryFields.includes(name) &&
          !isReadOnlySchema(document, requestProperties[name]),
      )
    : Object.keys(requestExampleFields).filter(
        (name) => !pathVars.includes(name) && !queryFields.includes(name),
      );
  const { status: responseStatus, response } = successResponse(document, operation);
  const responseContent = asRecord(
    response.content || {},
    `responses.${responseStatus ?? 'success'}.content`,
  );
  const responseMediaEntry = getJsonMediaEntry(document, responseContent);
  const responseMedia = responseMediaEntry?.media;
  const responseExample = objectSample(document, responseMedia, 'response application/json');
  const responseExampleIsArray = Array.isArray(responseExample);
  const responseExampleFields = isPlainRecord(responseExample)
    ? responseExample
    : responseExampleIsArray && isPlainRecord(responseExample[0])
      ? responseExample[0]
      : {};
  const responseSchema = schemaFromMedia(document, responseMedia);
  const responseArrayItemSchema = responseSchema
    ? schemaArrayItems(document, responseSchema)
    : undefined;
  const responseIsArray = Boolean(responseArrayItemSchema || responseExampleIsArray);
  const responseProperties = responseArrayItemSchema
    ? schemaProperties(document, responseArrayItemSchema)
    : responseSchema
      ? schemaProperties(document, responseSchema)
      : responseExampleFields;
  const responseField = responseOutputField(document, responseProperties);

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
} catch (error) {
  if (error instanceof OpenApiInputError) {
    usage(error.message);
  }
  throw error;
}
