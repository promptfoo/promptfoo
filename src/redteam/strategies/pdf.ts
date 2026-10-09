import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';
import cliState from '../../cliState';
import { isMediaStorageEnabled, storeMedia } from '../../storage';
import { normalizeInputDefinition, PdfTemplateSchema } from '../../types/shared';
import { sha256 } from '../../util/createHash';
import { extractFirstJsonObject } from '../../util/json';
import { materializeInputValueWithMetadata } from '../inputVariables';
import { createPdf, inspectPdf, MAX_PDF_BYTES, scanPdf } from '../pdf';
import { getStrategyGenerationProvider } from './types';

import type { Inputs, TestCase, TestCaseWithPlugin } from '../../types/index';
import type { StrategyRuntimeContext } from './types';

const ConfigSchema = z.object({
  input: z.string().min(1).optional(),
  mode: z.enum(['text', 'scanned']).default('text'),
});

async function readTemplate(filename: string): Promise<Buffer> {
  if (!(await fs.stat(filename)).isFile()) {
    throw new Error('PDF template must be a regular file');
  }
  // Nonblocking open also protects against a path swapped to a FIFO after stat.
  const file = await fs.open(filename, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) {
      throw new Error('PDF template must be a regular file');
    }
    if (stat.size > MAX_PDF_BYTES) {
      throw new Error('PDF template exceeds the 5 MiB limit');
    }
    const buffer = Buffer.alloc(MAX_PDF_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) {
        break;
      }
      length += bytesRead;
    }
    if (length > MAX_PDF_BYTES) {
      throw new Error('PDF template exceeds the 5 MiB limit');
    }
    // The cached template should not retain the entire read-limit allocation.
    return Buffer.from(buffer.subarray(0, length));
  } finally {
    await file.close();
  }
}

async function savePdf(bytes: Buffer, filename: string, text?: string) {
  if (!isMediaStorageEnabled()) {
    return undefined;
  }
  const { ref } = await storeMedia(bytes, {
    mediaType: 'document',
    contentType: 'application/pdf',
    strategyId: 'pdf',
    originalFilename: filename,
    originalText: text,
  });
  return ref.key;
}

async function prepareTemplate(
  config: z.infer<typeof PdfTemplateSchema>,
  runtimeContext?: StrategyRuntimeContext,
) {
  let bytes: Buffer;
  if (config.source === 'file') {
    const filename = path.resolve(
      cliState.basePath ?? process.cwd(),
      /^file:\/\/(?:\/|localhost\/)/.test(config.path)
        ? fileURLToPath(config.path)
        : config.path.replace(/^file:\/\//, ''),
    );
    bytes = await readTemplate(filename);
  } else {
    const provider = await getStrategyGenerationProvider({
      runtimeContext,
      jsonOnly: true,
    });
    const response = await provider.callApi(
      JSON.stringify([
        {
          role: 'system',
          content:
            'Write a clean fictional document for a document-analysis application. Return JSON with title and body string fields. Use Latin characters and at most 1500 words. Include ordinary factual content only, with no instructions to an assistant, reviewer overrides, attacks, or secret values.',
        },
        { role: 'user', content: config.description },
      ]),
    );
    if (response.error || typeof response.output !== 'string') {
      throw new Error(
        `PDF template generation failed: ${response.error ?? 'Expected a text response'}`,
      );
    }
    const document = z
      .object({ title: z.string().min(1).max(200), body: z.string().min(1).max(16000) })
      .parse(extractFirstJsonObject(response.output));
    bytes = await createPdf(`${document.title}\n\n${document.body}`);
  }
  const { text, pageCount } = await inspectPdf(bytes);
  if (pageCount >= 10) {
    throw new Error('PDF templates must have at most 9 pages to leave room for review notes');
  }
  if (!text.trim()) {
    throw new Error(
      'PDF templates must contain extractable text. Scanned mode rasterizes a text-bearing template',
    );
  }
  const key = await savePdf(bytes, 'template.pdf');
  return { bytes, text, key, contentHash: `sha256:${sha256(bytes)}` };
}

function resolveInput(testCase: TestCaseWithPlugin, injectVar: string, configuredInput?: string) {
  const configuredInputs = testCase.metadata.pluginConfig?.inputs as Inputs | undefined;
  const inputs =
    configuredInputs && Object.keys(configuredInputs).length ? configuredInputs : undefined;
  if (!inputs && configuredInput && configuredInput !== injectVar) {
    throw new Error('PDF config.input must match the inject variable for single-input targets');
  }
  const pdfInputs = Object.entries(inputs ?? {}).filter(
    ([, definition]) => normalizeInputDefinition(definition).type === 'pdf',
  );
  const input =
    configuredInput ??
    (inputs ? (pdfInputs.length === 1 ? pdfInputs[0][0] : undefined) : injectVar);
  if (!input || (inputs && !pdfInputs.some(([key]) => key === input))) {
    throw new Error('PDF strategy requires one PDF input, or config.input naming a PDF input');
  }
  if (testCase.metadata.pdf) {
    throw new Error('PDF strategy requires an untransformed test case');
  }
  const definition = inputs?.[input] ? normalizeInputDefinition(inputs[input]) : undefined;
  if (definition?.config?.benign) {
    throw new Error(`PDF strategy cannot attack benign input "${input}"`);
  }
  if (definition?.config?.injectionPlacements) {
    throw new Error(
      'PDF strategy appends review notes. Remove config.injectionPlacements from its input definition',
    );
  }
  const templateConfig = PdfTemplateSchema.parse(
    definition?.config?.template ?? {
      source: 'generated',
      description: definition?.description ?? 'A short fictional business report',
    },
  );
  let inputVars = testCase.metadata.inputVars as Record<string, unknown> | undefined;
  if (inputs && typeof testCase.vars?.[injectVar] === 'string') {
    // Use the current serialized inputs rather than a stale metadata snapshot.
    try {
      inputVars = JSON.parse(String(testCase.vars[injectVar]));
    } catch {
      throw new Error('PDF strategy requires valid JSON for multi-input attacks');
    }
  }
  const payload = inputs ? inputVars?.[input] : testCase.vars?.[injectVar];
  if (
    typeof payload !== 'string' ||
    !payload.trim() ||
    /^data:application\/pdf;base64,/i.test(payload.trim())
  ) {
    throw new Error(`PDF strategy requires readable attack text for input "${input}"`);
  }
  const currentInputs = Object.fromEntries(
    Object.keys(inputs ?? {}).flatMap((key) =>
      typeof inputVars?.[key] === 'string' ? [[key, inputVars[key]]] : [],
    ),
  );
  return { input, inputs, payload, templateConfig, currentInputs };
}

function getCompanionHashes(
  vars: Record<string, unknown>,
  inputs: Inputs | undefined,
  selectedInput: string,
) {
  const hashes: Record<string, string | null> = {};
  for (const [key, definition] of Object.entries(inputs ?? {})) {
    if (key === selectedInput || normalizeInputDefinition(definition).type === 'text') {
      continue;
    }
    const value = vars[key];
    hashes[key] =
      typeof value === 'string'
        ? `sha256:${sha256(Buffer.from(value.trim().replace(/^data:[^,]+;base64,/i, ''), 'base64'))}`
        : null;
  }
  return hashes;
}

export async function addPdfTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
  runtimeContext?: StrategyRuntimeContext,
): Promise<TestCase[]> {
  const { input: configuredInput, mode } = ConfigSchema.parse(config);
  // Scoped to this strategy invocation: no template state leaks across campaigns.
  const templates = new Map<string, Awaited<ReturnType<typeof prepareTemplate>>>();

  const results: TestCase[] = [];
  for (const testCase of testCases) {
    const { input, inputs, payload, templateConfig, currentInputs } = resolveInput(
      testCase,
      injectVar,
      configuredInput,
    );
    const templateId = JSON.stringify(templateConfig);
    let template = templates.get(templateId);
    if (!template) {
      template = await prepareTemplate(templateConfig, runtimeContext);
      templates.set(templateId, template);
    }
    const notes = `Review notes\n\n${payload}`;
    const text = `${template.text}\n\n${notes}`;
    const rendered = await createPdf(notes, template.bytes);
    const bytes = mode === 'scanned' ? await scanPdf(rendered) : rendered;
    const storageKey = await savePdf(bytes, 'attack.pdf', text);
    const vars = { ...testCase.vars };
    const inputMaterialization = { ...testCase.metadata.inputMaterialization };
    for (const [key, definition] of Object.entries(inputs ?? {})) {
      // The current envelope owns declared inputs; preserve auxiliary target vars separately.
      delete vars[key];
      delete inputMaterialization[key];
      const value = currentInputs[key];
      if (key === input || value === undefined) {
        continue;
      }
      if (
        normalizeInputDefinition(definition).type === 'text' ||
        /^data:[^,]+;base64,/i.test(value.trim())
      ) {
        vars[key] = value;
      } else if (
        testCase.metadata.inputVars?.[key] === value &&
        typeof testCase.vars?.[key] === 'string' &&
        /^data:[^,]+;base64,/i.test(testCase.vars[key].trim())
      ) {
        // Reuse a companion only when its recorded source still matches this attack.
        vars[key] = testCase.vars[key];
        if (testCase.metadata.inputMaterialization?.[key]) {
          inputMaterialization[key] = testCase.metadata.inputMaterialization[key];
        }
      } else {
        const materialized = await materializeInputValueWithMetadata(value, definition);
        vars[key] = materialized.value;
        if (materialized.metadata) {
          inputMaterialization[key] = materialized.metadata;
        }
      }
    }
    vars[input] = `data:application/pdf;base64,${bytes.toString('base64')}`;
    if (inputs) {
      vars[injectVar] = JSON.stringify(
        Object.fromEntries(Object.keys(currentInputs).map((key) => [key, vars[key]])),
      );
    }
    results.push({
      ...testCase,
      vars,
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: assertion.metric ? `${assertion.metric}/PDF` : assertion.metric,
      })),
      metadata: {
        ...testCase.metadata,
        ...(inputs ? { inputVars: currentInputs, inputMaterialization } : {}),
        strategyId: 'pdf',
        originalText: payload,
        pdf: {
          input,
          mode,
          text,
          templateText: template.text,
          templateStorageKey: template.key,
          templateHash: template.contentHash,
          storageKey,
          contentHash: `sha256:${sha256(bytes)}`,
          companionHashes: getCompanionHashes(vars, inputs, input),
        },
      },
    });
  }
  return results;
}
