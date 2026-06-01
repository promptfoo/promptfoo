import fs from 'fs';
import path from 'path';

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { beforeAll, describe, expect, it } from 'vitest';

describe('ModelAudit JSON Schema', () => {
  type JsonObject = Record<string, unknown>;

  const version = 'v0.2.45';
  const latest = 'latest';

  let versionedExample: JsonObject;
  let latestExample: JsonObject;
  let versionedSchema: JsonObject;
  let latestSchema: JsonObject;

  const readJsonObject = (filePath: string): JsonObject => {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Expected ${filePath} to contain a JSON object`);
    }
    return value as JsonObject;
  };

  const schemaPath = (label: string) =>
    path.join(
      __dirname,
      '..',
      'site',
      'static',
      'schemas',
      'modelaudit',
      label,
      'modelaudit-scan-result.schema.json',
    );

  const examplePath = (label: string) =>
    path.join(
      __dirname,
      '..',
      'site',
      'static',
      'examples',
      'modelaudit',
      label,
      'modelaudit-scan-result.example.json',
    );

  beforeAll(() => {
    versionedSchema = readJsonObject(schemaPath(version));
    latestSchema = readJsonObject(schemaPath(latest));
    versionedExample = readJsonObject(examplePath(version));
    latestExample = readJsonObject(examplePath(latest));
  });

  const withoutSchemaId = (schema: JsonObject): JsonObject => {
    const clone = { ...schema };
    delete clone.$id;
    return clone;
  };

  it('declares public Draft 2020-12 identifiers for latest and versioned schemas', () => {
    for (const [label, schema] of [
      [latest, latestSchema],
      [version, versionedSchema],
    ] as const) {
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schema.$id).toBe(
        `https://www.promptfoo.dev/schemas/modelaudit/${label}/modelaudit-scan-result.schema.json`,
      );
    }
  });

  it('keeps the latest alias aligned with the versioned artifacts', () => {
    expect(withoutSchemaId(latestSchema)).toEqual(withoutSchemaId(versionedSchema));
    expect(latestExample).toEqual(versionedExample);
  });

  it('describes has_errors as an operational failure signal', () => {
    for (const schema of [latestSchema, versionedSchema]) {
      const properties = schema.properties as JsonObject;
      const hasErrors = properties.has_errors as JsonObject;
      expect(hasErrors.description).toBe('Whether operational errors occurred during scanning');
    }
  });

  it('validates the published example results', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);

    for (const [schema, example] of [
      [latestSchema, latestExample],
      [versionedSchema, versionedExample],
    ] as const) {
      const validate = ajv.compile(schema);
      expect(validate(example), JSON.stringify(validate.errors, null, 2)).toBe(true);
    }
  });
});
