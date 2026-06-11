import fs from 'fs/promises';
import * as path from 'path';

import yaml from 'js-yaml';
import cliState from './cliState';
import { getEnvBool } from './envars';
import { importModule } from './esm';
import { getPrompt as getHeliconePrompt } from './integrations/helicone';
import { getPrompt as getLangfusePrompt } from './integrations/langfuse';
import { getPrompt as getPortkeyPrompt } from './integrations/portkey';
import logger from './logger';
import { isPackagePath, loadFromPackage } from './providers/packageParser';
import { runPython } from './python/pythonUtils';
import telemetry from './telemetry';
import {
  type ApiProvider,
  type CompletedPrompt,
  type EvaluateResult,
  type NunjucksFilterMap,
  type Prompt,
  type TestCase,
  type TestSuite,
  type UnifiedConfig,
  type VarValue,
} from './types/index';
import { isAudioFile, isImageFile, isJavascriptFile, isVideoFile } from './util/fileExtensions';
import { renderVarsInObject } from './util/index';
import invariant from './util/invariant';
import { filterFiniteScores } from './util/numeric';
import {
  extractVariablesFromTemplate,
  getNunjucksEngine,
  templateReferencesVariable,
} from './util/templates';
import { transform } from './util/transform';

type FileMetadata = Record<string, { path: string; type: string; format?: string }>;

export async function extractTextFromPDF(pdfPath: string): Promise<string> {
  logger.debug(`Extracting text from PDF: ${pdfPath}`);
  try {
    const { PDFParse } = await import('pdf-parse');
    const dataBuffer = await fs.readFile(pdfPath);
    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text.trim();
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cannot find module 'pdf-parse'")) {
      throw new Error('pdf-parse is not installed. Please install it with: npm install pdf-parse');
    }
    throw new Error(
      `Failed to extract text from PDF ${pdfPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function resolveVariables(
  variables: Record<string, VarValue>,
  skipResolveVars?: string[],
  varsResolvedFromSkipped?: Set<string>,
): Record<string, VarValue> {
  let resolved: boolean;
  const regex = /\{\{\s*(\w+)\s*\}\}/; // Matches {{variableName}}, {{ variableName }}, etc.

  let iterations = 0;
  do {
    resolved = true;
    for (const key of Object.keys(variables)) {
      if (
        skipResolveVars?.includes(key) ||
        varsResolvedFromSkipped?.has(key) ||
        typeof variables[key] !== 'string'
      ) {
        continue;
      }
      const value = variables[key] as string;
      const match = regex.exec(value);
      if (match) {
        const [placeholder, varName] = match;
        if (variables[varName] === undefined) {
          // Do nothing - final nunjucks render will fail if necessary.
          // logger.warn(`Variable "${varName}" not found for substitution.`);
        } else {
          variables[key] = value.replace(placeholder, variables[varName] as string);
          if (skipResolveVars?.includes(varName) || varsResolvedFromSkipped?.has(varName)) {
            varsResolvedFromSkipped?.add(key);
          }
          resolved = false; // Indicate that we've made a replacement and should check again
        }
      }
    }
    iterations++;
  } while (!resolved && iterations < 5);

  return variables;
}

// Utility: Detect partial/unclosed Nunjucks tags and wrap in {% raw %} if needed
function autoWrapRawIfPartialNunjucks(prompt: string): string {
  // Detects any occurrence of an opening Nunjucks tag without a matching close
  // e.g. "{%" or "{{" not followed by a closing "%}" or "}}"
  const hasPartialTag = /({%[^%]*$|{{[^}]*$|{#[^#]*$)/m.test(prompt);
  const alreadyWrapped = /{\%\s*raw\s*\%}/.test(prompt) && /{\%\s*endraw\s*\%}/.test(prompt);
  if (hasPartialTag && !alreadyWrapped) {
    return `{% raw %}${prompt}{% endraw %}`;
  }
  return prompt;
}

function referencesUndefinedVariables(template: string, vars: Record<string, VarValue>): boolean {
  return extractVariablesFromTemplate(template).some((variableName) => {
    const rootVariableName = /^([A-Za-z_]\w*)/.exec(variableName)?.[1];
    return Boolean(
      rootVariableName && rootVariableName !== 'env' && vars[rootVariableName] === undefined,
    );
  });
}

/**
 * True if `template` references any variable that is skipped from rendering
 * (`skipRenderVars`) or was itself resolved from a skipped variable.
 *
 * This is the skip boundary for red team injection vars, so it must catch *every*
 * way a Nunjucks template can reference a symbol — filter (`{{ x | safe }}`),
 * attribute (`{{ x.y }}`), index (`{{ a[x] }}`), whitespace-control (`{{- x -}}`),
 * inline conditional (`{{ x if y }}`), operator (`{{ a ~ x }}`), filter argument
 * (`{{ a | default(x) }}`), block tags, etc. A regex extractor misses several of
 * these, so we use the AST-backed {@link templateReferencesVariable}, which also
 * conservatively reports a reference when the template fails to parse.
 */
function referencesSkippedVariables(
  template: string,
  skipRenderVars: string[] | undefined,
  varsResolvedFromSkipped: Set<string>,
): boolean {
  if (!skipRenderVars?.length && varsResolvedFromSkipped.size === 0) {
    return false;
  }
  const skippedNames = new Set<string>(varsResolvedFromSkipped);
  for (const name of skipRenderVars ?? []) {
    skippedNames.add(name);
  }
  for (const name of skippedNames) {
    if (templateReferencesVariable(template, name)) {
      return true;
    }
  }
  return false;
}

/**
 * Reads the string value of a writable own data property, or undefined if the
 * property is missing, an accessor (getter/setter), non-writable, or not a string.
 * Reading via the descriptor avoids invoking getters while walking nested vars.
 */
function getWritableStringProp(container: object, key: string): string | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(container, key);
  if (
    descriptor &&
    'value' in descriptor &&
    descriptor.writable === true &&
    typeof descriptor.value === 'string'
  ) {
    return descriptor.value;
  }
  return undefined;
}

/**
 * Writes a string value to a writable own data property, preserving the existing
 * descriptor flags (enumerable/configurable) and never touching the prototype
 * chain (e.g. an own `__proto__` data property on a null-prototype object).
 */
function setNestedStringValue(container: object, key: string, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(container, key);
  if (descriptor && 'value' in descriptor && descriptor.writable === true) {
    Object.defineProperty(container, key, { ...descriptor, value });
  }
}

/**
 * Collects metadata about file variables in the vars object.
 * @param vars The variables object containing potential file references
 * @returns An object mapping variable names to their file metadata
 */
export function collectFileMetadata(vars: Record<string, VarValue>): FileMetadata {
  const fileMetadata: FileMetadata = {};

  for (const [varName, value] of Object.entries(vars)) {
    if (typeof value === 'string' && value.startsWith('file://')) {
      const filePath = path.resolve(cliState.basePath || '', value.slice('file://'.length));
      const fileExtension = filePath.split('.').pop() || '';

      if (isImageFile(filePath)) {
        fileMetadata[varName] = {
          path: value, // Keep the original file:// notation
          type: 'image',
          format: fileExtension,
        };
      } else if (isVideoFile(filePath)) {
        fileMetadata[varName] = {
          path: value,
          type: 'video',
          format: fileExtension,
        };
      } else if (isAudioFile(filePath)) {
        fileMetadata[varName] = {
          path: value,
          type: 'audio',
          format: fileExtension,
        };
      }
    }
  }

  return fileMetadata;
}

/** True only for plain objects ({} or Object.create(null)). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const REMOVED_UNSAFE_REFERENCE = '[PROMPTFOO_UNSAFE_REFERENCE_REMOVED]';

function sanitizeFileReferenceValue(value: VarValue, visited: WeakMap<object, VarValue>): VarValue {
  if (typeof value === 'string') {
    return value.startsWith('file://') || isPackagePath(value) ? REMOVED_UNSAFE_REFERENCE : value;
  }
  if (Array.isArray(value)) {
    const existing = visited.get(value);
    if (existing !== undefined) {
      return existing;
    }
    const sanitized: VarValue[] = [];
    visited.set(value, sanitized as unknown as VarValue);
    for (const item of value) {
      sanitized.push(sanitizeFileReferenceValue(item as VarValue, visited));
    }
    return sanitized as unknown as VarValue;
  }
  if (isPlainObject(value)) {
    const existing = visited.get(value);
    if (existing !== undefined) {
      return existing;
    }
    const sanitized: Record<string, VarValue> = {};
    visited.set(value, sanitized);
    for (const [key, nestedValue] of Object.entries(value)) {
      sanitized[key] = sanitizeFileReferenceValue(nestedValue as VarValue, visited);
    }
    return sanitized;
  }
  return value;
}

/**
 * Returns a deep copy of runtime register values (captured via `storeOutputAs`,
 * i.e. provider output) with every `file://` / `package:` string replaced by an
 * inert sentinel, at the top level and nested inside objects and arrays.
 *
 * Provider output is untrusted, so it must never be dereferenced as a file or
 * package when reused as a var in a later test — otherwise a model could be
 * steered to emit `file:///etc/passwd` (or a `package:` path) and have it loaded
 * or executed. Nested `file://` resolution makes this matter at any depth, not
 * just the top level. Cycle-safe.
 */
export function sanitizeFileReferences(
  registers: Record<string, VarValue>,
): Record<string, VarValue> {
  const visited = new WeakMap<object, VarValue>();
  const sanitized: Record<string, VarValue> = {};
  for (const [key, value] of Object.entries(registers)) {
    sanitized[key] = sanitizeFileReferenceValue(value, visited);
  }
  return sanitized;
}

function isSupportedNestedFileRef(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return !(
    isJavascriptFile(filePath) ||
    extension === '.py' ||
    extension === '.pdf' ||
    isImageFile(filePath) ||
    isVideoFile(filePath) ||
    isAudioFile(filePath)
  );
}

/**
 * A nested string slot (`container[key]`) that may contain a Nunjucks template to
 * render once top-level vars are loaded: either text loaded from a nested
 * `file://` reference, or a nested string that references other vars such as
 * `report: "{{ file_content }}"` (issue #1613 form 2).
 */
type NestedRenderTarget = {
  container: object;
  key: string;
};

type NestedFileRefLoadResult =
  | { loaded: false }
  | {
      loaded: true;
      value: string | undefined;
    };

async function loadNestedFileRef(
  value: string,
  basePath: string,
  varName: string,
): Promise<NestedFileRefLoadResult> {
  const filePath = path.resolve(process.cwd(), basePath, value.slice('file://'.length));
  if (!isSupportedNestedFileRef(filePath)) {
    // Unlike top-level vars, JavaScript/Python/PDF/media references are intentionally
    // not loaded or executed when nested (they require execution or binary handling).
    // Leave the reference as a literal string and tell anyone debugging why.
    logger.debug(
      `Leaving nested file reference for var "${varName}" as a literal string: ${value}. Only text and YAML files are resolved when nested; JS/Python/PDF/media must be referenced by a top-level variable.`,
    );
    return { loaded: false };
  }

  logger.debug(`Resolving nested file reference for var "${varName}": ${value} -> ${filePath}`);
  try {
    const contents = await fs.readFile(filePath, 'utf8');
    const extension = path.extname(filePath).toLowerCase();
    return {
      loaded: true,
      value:
        extension === '.yaml' || extension === '.yml'
          ? JSON.stringify(yaml.load(contents) as string | object | undefined)
          : contents.trim(),
    };
  } catch (error) {
    throw new Error(
      `Failed to load nested file reference for var "${varName}" (${filePath}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function collectNestedContainers(value: object, containers: WeakSet<object>): void {
  const pending: object[] = [value];
  const addNestedContainer = (nestedValue: unknown): void => {
    if (typeof nestedValue === 'object' && nestedValue !== null) {
      pending.push(nestedValue);
    }
  };

  while (pending.length > 0) {
    const container = pending.pop()!;
    if (containers.has(container)) {
      continue;
    }
    containers.add(container);

    if (container instanceof Map) {
      for (const [key, nestedValue] of container.entries()) {
        addNestedContainer(key);
        addNestedContainer(nestedValue);
      }
    } else if (container instanceof Set) {
      for (const nestedValue of container.values()) {
        addNestedContainer(nestedValue);
      }
    }

    for (const key of Reflect.ownKeys(container)) {
      const descriptor = Object.getOwnPropertyDescriptor(container, key);
      if (
        descriptor &&
        'value' in descriptor &&
        typeof descriptor.value === 'object' &&
        descriptor.value !== null
      ) {
        addNestedContainer(descriptor.value);
      }
    }
  }
}

/**
 * Loads a nested `file://` leaf in place. Returns true when the slot now holds a
 * loaded string (a render target), false when the ref was unsupported, the slot
 * was not writable, or the loaded value was not a string.
 */
async function loadNestedFileLeaf(
  container: object,
  key: string,
  descriptor: PropertyDescriptor,
  basePath: string,
  varName: string,
): Promise<boolean> {
  if (descriptor.writable !== true) {
    return false;
  }
  const result = await loadNestedFileRef(descriptor.value as string, basePath, varName);
  if (!result.loaded) {
    return false;
  }
  Object.defineProperty(container, key, { ...descriptor, value: result.value });
  // Loaded text may itself contain templates (e.g. "Hello {{ name }}").
  return typeof result.value === 'string';
}

/**
 * Walks nested plain objects and arrays, resolving textual `file://` values in
 * place and collecting every nested string slot that may need template rendering.
 * In-place mutation preserves cyclic graphs, aliases, and container prototypes
 * while matching renderPrompt's existing mutation of top-level file-backed vars.
 *
 * @param value The root container to walk.
 * @param basePath Base directory used to resolve relative file paths.
 * @param varName Name of the top-level var being resolved (used in error messages).
 * @param protectedContainers Object graphs (skipRenderVars/_conversation) to skip.
 * @returns Nested string slots to render after top-level vars are resolved.
 */
async function resolveNestedFileRefs(
  value: object,
  basePath: string,
  varName: string,
  protectedContainers: WeakSet<object>,
): Promise<NestedRenderTarget[]> {
  const pending: object[] = [value];
  const visited = new WeakSet<object>();
  const renderTargets: NestedRenderTarget[] = [];

  while (pending.length > 0) {
    const container = pending.pop()!;
    if (visited.has(container) || protectedContainers.has(container)) {
      continue;
    }
    visited.add(container);

    for (const key of Object.keys(container)) {
      const descriptor = Object.getOwnPropertyDescriptor(container, key);
      if (!descriptor || !('value' in descriptor)) {
        continue;
      }

      const nestedValue = descriptor.value;
      const isString = typeof nestedValue === 'string';
      if (isString && nestedValue.startsWith('file://')) {
        if (await loadNestedFileLeaf(container, key, descriptor, basePath, varName)) {
          renderTargets.push({ container, key });
        }
      } else if (isString && descriptor.writable === true && nestedValue.includes('{{')) {
        // A nested string that references other vars, e.g. report: "{{ file_content }}"
        // (issue #1613 form 2). Rendered after vars resolve, with the same skipped-var
        // protection as file-loaded content.
        renderTargets.push({ container, key });
      } else if (Array.isArray(nestedValue) || isPlainObject(nestedValue)) {
        pending.push(nestedValue);
      }
    }
  }

  return renderTargets;
}

function renderNestedFileRefTemplates(
  renderTargets: NestedRenderTarget[],
  vars: Record<string, VarValue>,
  nunjucks: ReturnType<typeof getNunjucksEngine>,
  skipRenderVars: string[] | undefined,
  varsResolvedFromSkipped: Set<string>,
): void {
  if (getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return;
  }

  const templates = renderTargets.flatMap((target) => {
    const template = getWritableStringProp(target.container, target.key);
    return template === undefined ? [] : [{ target, template }];
  });

  // Render each pass from the original template, never from prior rendered output.
  // This lets dependency chains settle without re-evaluating already-inserted content.
  for (let iteration = 0; iteration <= templates.length; iteration++) {
    let changed = false;
    for (const { target, template } of templates) {
      const current = getWritableStringProp(target.container, target.key);
      if (
        current === undefined ||
        referencesUndefinedVariables(template, vars) ||
        // Never render a template that pulls in a skipped (red team injection) var,
        // at any nesting depth or through any Nunjucks reference syntax.
        referencesSkippedVariables(template, skipRenderVars, varsResolvedFromSkipped)
      ) {
        continue;
      }

      // A nested string can contain "{{" without being a valid template (code
      // samples, JSON, prose). Leave such values raw rather than failing the whole
      // render, matching how unrendered objects stringify elsewhere.
      let rendered: string;
      try {
        rendered = nunjucks.renderString(autoWrapRawIfPartialNunjucks(template), vars);
      } catch (error) {
        logger.debug(
          `Leaving nested var "${target.key}" raw; it contains "{{" but is not a valid template: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }
      if (rendered === current) {
        continue;
      }
      setNestedStringValue(target.container, target.key, rendered);
      changed = true;
    }
    if (!changed) {
      return;
    }
  }
}

/**
 * Gets MIME type from file extension
 *
 * Supported formats:
 * - JPEG/JPG (image/jpeg)
 * - PNG (image/png)
 * - GIF (image/gif)
 * - WebP (image/webp)
 * - BMP (image/bmp)
 * - SVG (image/svg+xml)
 * - TIFF (image/tiff)
 * - ICO (image/x-icon)
 * - AVIF (image/avif)
 * - HEIC/HEIF (image/heic)
 *
 * @param extension File extension (with or without dot)
 * @returns MIME type string (defaults to image/jpeg for unknown formats)
 */
function getMimeTypeFromExtension(extension: string): string {
  const normalizedExt = extension.toLowerCase().replace(/^\./, '');
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    ico: 'image/x-icon',
    avif: 'image/avif',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return mimeTypes[normalizedExt] || 'image/jpeg';
}

/**
 * Detects MIME type from base64 magic numbers for additional accuracy
 *
 * Magic numbers (base64-encoded file signatures):
 * - JPEG: /9j/ (0xFFD8FF)
 * - PNG: iVBORw0KGgo (0x89504E47)
 * - GIF: R0lGODlh or R0lGODdh (GIF87a/GIF89a)
 * - WebP: UklGR (RIFF)
 * - BMP: Qk0 or Qk1 (BM)
 * - TIFF: SUkq or TU0A (II* or MM*)
 * - ICO: AAABAA (0x00000100)
 *
 * @param base64Data Base64 encoded image data
 * @returns MIME type string or null if format cannot be detected
 */
function detectMimeFromBase64(base64Data: string): string | null {
  // Check magic numbers at the start of base64 data
  if (base64Data.startsWith('/9j/')) {
    return 'image/jpeg';
  } else if (base64Data.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  } else if (base64Data.startsWith('R0lGODlh') || base64Data.startsWith('R0lGODdh')) {
    return 'image/gif';
  } else if (base64Data.startsWith('UklGR')) {
    return 'image/webp';
  } else if (base64Data.startsWith('Qk0') || base64Data.startsWith('Qk1')) {
    return 'image/bmp';
  } else if (base64Data.startsWith('SUkq') || base64Data.startsWith('TU0A')) {
    return 'image/tiff';
  } else if (base64Data.startsWith('AAABAA')) {
    return 'image/x-icon';
  }
  // Return null if format cannot be detected - caller will log warning
  return null;
}

/**
 * Renders a prompt template with variable substitution using Nunjucks.
 *
 * @param prompt - The prompt template to render
 * @param vars - Variables to substitute into the template
 * @param nunjucksFilters - Optional custom Nunjucks filters
 * @param provider - Optional API provider for context
 * @param skipRenderVars - Optional array of variable names to skip special loading and template
 *                         rendering for. This is critical for red team testing where injection
 *                         variables contain attack payloads (e.g., SSTI, XSS) that should NOT be
 *                         evaluated by Promptfoo before reaching the target.
 * @returns The rendered prompt string
 */
export async function renderPrompt(
  prompt: Prompt,
  vars: Record<string, VarValue>,
  nunjucksFilters?: NunjucksFilterMap,
  provider?: ApiProvider,
  skipRenderVars?: string[],
): Promise<string> {
  const nunjucks = getNunjucksEngine(nunjucksFilters);
  const nestedRenderTargets: NestedRenderTarget[] = [];
  const protectedNestedContainers = new WeakSet<object>();

  let basePrompt = prompt.raw;

  for (const [varName, value] of Object.entries(vars)) {
    if (
      (varName === '_conversation' || skipRenderVars?.includes(varName)) &&
      typeof value === 'object' &&
      value !== null
    ) {
      collectNestedContainers(value, protectedNestedContainers);
    }
  }

  // Load files
  for (const [varName, value] of Object.entries(vars)) {
    if (varName === '_conversation' || skipRenderVars?.includes(varName)) {
      continue;
    }

    if (typeof value === 'string' && value.startsWith('file://')) {
      const basePath = cliState.basePath || '';
      const filePath = path.resolve(process.cwd(), basePath, value.slice('file://'.length));
      const fileExtension = filePath.split('.').pop();

      logger.debug(`Loading var ${varName} from file: ${filePath}`);
      if (isJavascriptFile(filePath)) {
        const javascriptOutput = (await (
          await importModule(filePath)
        )(varName, basePrompt, vars, provider)) as {
          output?: string;
          error?: string;
        };
        if (javascriptOutput.error) {
          throw new Error(`Error running ${filePath}: ${javascriptOutput.error}`);
        }
        if (!javascriptOutput.output) {
          throw new Error(
            `Expected ${filePath} to return { output: string } but got ${javascriptOutput}`,
          );
        }
        vars[varName] = javascriptOutput.output;
      } else if (fileExtension === 'py') {
        const pythonScriptOutput = (await runPython(filePath, 'get_var', [
          varName,
          basePrompt,
          vars,
        ])) as { output?: unknown; error?: string };
        if (pythonScriptOutput.error) {
          throw new Error(`Error running Python script ${filePath}: ${pythonScriptOutput.error}`);
        }
        if (!pythonScriptOutput.output) {
          throw new Error(`Python script ${filePath} did not return any output`);
        }
        invariant(
          typeof pythonScriptOutput.output === 'string',
          `pythonScriptOutput.output must be a string. Received: ${typeof pythonScriptOutput.output}`,
        );
        vars[varName] = pythonScriptOutput.output.trim();
      } else if (fileExtension === 'yaml' || fileExtension === 'yml') {
        vars[varName] = JSON.stringify(
          yaml.load(await fs.readFile(filePath, 'utf8')) as string | object,
        );
      } else if (fileExtension === 'pdf' && !getEnvBool('PROMPTFOO_DISABLE_PDF_AS_TEXT')) {
        telemetry.record('feature_used', {
          feature: 'extract_text_from_pdf',
        });
        vars[varName] = await extractTextFromPDF(filePath);
      } else if (
        (isImageFile(filePath) || isVideoFile(filePath) || isAudioFile(filePath)) &&
        !getEnvBool('PROMPTFOO_DISABLE_MULTIMEDIA_AS_BASE64')
      ) {
        const fileType = isImageFile(filePath)
          ? 'image'
          : isVideoFile(filePath)
            ? 'video'
            : 'audio';

        telemetry.record('feature_used', {
          feature: `load_${fileType}_as_base64`,
        });

        logger.debug(`Loading ${fileType} as base64: ${filePath}`);
        try {
          const fileBuffer = await fs.readFile(filePath);
          const base64Data = fileBuffer.toString('base64');

          if (fileType === 'image') {
            // For images, generate data URL with proper MIME type
            // Use extension first, then magic number detection for accuracy
            let mimeType = getMimeTypeFromExtension(path.extname(filePath));
            const extension = path.extname(filePath);
            const extensionWasUnknown = !extension || mimeType === 'image/jpeg';

            // For better accuracy, use magic number detection
            const detectedType = detectMimeFromBase64(base64Data);
            if (detectedType) {
              // Use detected type if available and different from extension-based guess
              if (detectedType !== mimeType) {
                logger.debug(
                  `Magic number detection overriding extension-based MIME type: ${detectedType} (was ${mimeType}) for ${filePath}`,
                );
                mimeType = detectedType;
              }
            } else if (extensionWasUnknown) {
              // Could not detect format and extension was unknown/ambiguous
              logger.warn(
                `Could not detect image format for ${filePath}, defaulting to image/jpeg. Supported formats: JPEG, PNG, GIF, WebP, BMP, TIFF, ICO, AVIF, HEIC, SVG`,
              );
            }

            vars[varName] = `data:${mimeType};base64,${base64Data}`;
          } else {
            // Keep existing behavior for video/audio files (raw base64)
            vars[varName] = base64Data;
          }
        } catch (error) {
          throw new Error(
            `Failed to load ${fileType} ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        vars[varName] = (await fs.readFile(filePath, 'utf8')).trim();
      }
    } else if (isPackagePath(value)) {
      const basePath = cliState.basePath || '';
      const requiredModule = await loadFromPackage(value, basePath);
      if (typeof requiredModule !== 'function') {
        throw new Error(
          `Variable source malformed: ${value} must export a function. Received: ${typeof requiredModule}`,
        );
      }

      const javascriptOutput = (await requiredModule(varName, basePrompt, vars, provider)) as {
        output?: string;
        error?: string;
      };
      if (javascriptOutput.error) {
        throw new Error(`Error running ${value}: ${javascriptOutput.error}`);
      }
      if (!javascriptOutput.output) {
        throw new Error(
          `Expected ${value} to return { output: string } but got ${javascriptOutput}`,
        );
      }
      vars[varName] = javascriptOutput.output;
    } else if (Array.isArray(value) || isPlainObject(value)) {
      const basePath = cliState.basePath || '';
      nestedRenderTargets.push(
        ...(await resolveNestedFileRefs(value, basePath, varName, protectedNestedContainers)),
      );
    }
  }

  // Apply prompt functions
  if (prompt.function) {
    const result = await prompt.function({ vars, provider });
    if (typeof result === 'string') {
      basePrompt = result;
    } else if (typeof result === 'object') {
      // Check if it's using the structured PromptFunctionResult format
      if ('prompt' in result) {
        basePrompt =
          typeof result.prompt === 'string' ? result.prompt : JSON.stringify(result.prompt);

        // Merge config if provided
        if (result.config) {
          prompt.config = {
            ...(prompt.config || {}),
            ...result.config,
          };
        }
      } else {
        // Direct object/array format
        basePrompt = JSON.stringify(result);
      }
    } else {
      throw new Error(`Prompt function must return a string or object, got ${typeof result}`);
    }
  }

  // Remove any trailing newlines from vars, as this tends to be a footgun for JSON prompts.
  for (const key of Object.keys(vars)) {
    if (typeof vars[key] === 'string' && !skipRenderVars?.includes(key)) {
      vars[key] = (vars[key] as string).replace(/\n$/, '');
    }
  }
  // Resolve variable mappings
  const varsResolvedFromSkipped = new Set<string>();
  resolveVariables(vars, skipRenderVars, varsResolvedFromSkipped);
  renderNestedFileRefTemplates(
    nestedRenderTargets,
    vars,
    nunjucks,
    skipRenderVars,
    varsResolvedFromSkipped,
  );
  // Third party integrations
  if (prompt.raw.startsWith('portkey://')) {
    const portKeyResult = await getPortkeyPrompt(prompt.raw.slice('portkey://'.length), vars);
    return JSON.stringify(portKeyResult.messages);
  } else if (prompt.raw.startsWith('langfuse://')) {
    const langfusePrompt = prompt.raw.slice('langfuse://'.length);

    let helper: string;
    let version: string | undefined;
    let label: string | undefined;
    let promptType: 'text' | 'chat' | undefined = 'text';

    // More robust parsing that handles @ in prompt IDs
    // Look for the last @ that's followed by a label pattern
    const labelMatch = langfusePrompt.match(/^(.+)@([^:@]+)(?::(.+))?$/);
    const versionMatch = langfusePrompt.match(/^([^:]+):([^:]+)(?::(.+))?$/);

    if (labelMatch) {
      // Label-based syntax: prompt-id@label or prompt-id@label:type
      helper = labelMatch[1];
      label = labelMatch[2];
      if (labelMatch[3]) {
        promptType = labelMatch[3] as 'text' | 'chat';
      }
    } else if (versionMatch) {
      // Version/label syntax: prompt-id:version-or-label or prompt-id:version-or-label:type
      helper = versionMatch[1];
      const versionOrLabel = versionMatch[2];

      // Auto-detect if it's a version (numeric) or label (string)
      if (/^\d+$/.test(versionOrLabel)) {
        // It's a numeric version
        version = versionOrLabel;
      } else {
        // It's a string, treat as label
        label = versionOrLabel;
        if (label === 'latest') {
          // 'latest' is always treated as a label, even though it could be ambiguous
          version = undefined;
        }
      }

      if (versionMatch[3]) {
        promptType = versionMatch[3] as 'text' | 'chat';
      }
    } else {
      // Simple prompt-id only
      helper = langfusePrompt;
    }

    if (promptType !== 'text' && promptType !== 'chat') {
      throw new Error(`Invalid Langfuse prompt type: ${promptType}. Must be 'text' or 'chat'.`);
    }

    const langfuseResult = await getLangfusePrompt(
      helper,
      vars,
      promptType,
      version === undefined || version === 'latest' ? undefined : Number(version),
      label,
    );
    return langfuseResult;
  } else if (prompt.raw.startsWith('helicone://')) {
    const heliconePrompt = prompt.raw.slice('helicone://'.length);
    const [id, version] = heliconePrompt.split(':');
    const [majorVersion, minorVersion] = version ? version.split('.') : [undefined, undefined];
    const heliconeResult = await getHeliconePrompt(
      id,
      vars,
      majorVersion === undefined ? undefined : Number(majorVersion),
      minorVersion === undefined ? undefined : Number(minorVersion),
    );
    return heliconeResult;
  }
  // Render prompt
  try {
    if (getEnvBool('PROMPTFOO_DISABLE_JSON_AUTOESCAPE')) {
      // Pre-process: auto-wrap in {% raw %} if partial Nunjucks tags detected
      basePrompt = autoWrapRawIfPartialNunjucks(basePrompt);
      return nunjucks.renderString(basePrompt, vars);
    }

    const parsed = JSON.parse(basePrompt);
    // The _raw_ prompt is valid JSON. That means that the user likely wants to substitute vars _within_ the JSON itself.
    // Recursively walk the JSON structure. If we find a string, render it with nunjucks.
    return JSON.stringify(renderVarsInObject(parsed, vars), null, 2);
  } catch {
    // Vars values can be template strings, so we need to render them first:
    const renderedVars = Object.fromEntries(
      Object.entries(vars).map(([key, value]) => {
        if (
          typeof value !== 'string' ||
          skipRenderVars?.includes(key) ||
          varsResolvedFromSkipped.has(key)
        ) {
          return [key, value];
        }

        if (referencesUndefinedVariables(value, vars)) {
          return [key, value];
        }

        return [key, nunjucks.renderString(autoWrapRawIfPartialNunjucks(value), vars)];
      }),
    );

    // Pre-process: auto-wrap in {% raw %} if partial Nunjucks tags detected
    basePrompt = autoWrapRawIfPartialNunjucks(basePrompt);
    // Note: Explicitly not using `renderVarsInObject` as it will re-call `renderString`; each call will
    // strip Nunjucks Tags, which breaks using raw (https://mozilla.github.io/nunjucks/templating.html#raw) e.g.
    // {% raw %}{{some_string}}{% endraw %} -> {{some_string}} -> ''
    return nunjucks.renderString(basePrompt, renderedVars);
  }
}

// ================================
// Extension Hooks
// ================================

/**
 * Context passed to beforeAll extension hooks.
 * Called once before the evaluation starts.
 */
export type BeforeAllExtensionHookContext = {
  /** The test suite configuration (mutable) */
  suite: TestSuite;
};

/**
 * Context passed to beforeEach extension hooks.
 * Called before each test case is evaluated.
 */
export type BeforeEachExtensionHookContext = {
  /** The test case about to be evaluated (mutable) */
  test: TestCase;
};

/**
 * Context passed to afterEach extension hooks.
 * Called after each test case is evaluated.
 *
 * When the hook returns the modified context, `result.namedScores`,
 * `result.metadata`, and `result.response.metadata` will be shallow-merged
 * into the evaluation result and persisted.
 */
export type AfterEachExtensionHookContext = {
  /** The test case that was evaluated */
  test: TestCase;
  /** The result of the evaluation (namedScores, metadata, and response.metadata are mutable) */
  result: EvaluateResult;
};

/**
 * Context passed to afterAll extension hooks.
 * Called once after all evaluations complete.
 *
 * @example
 * ```javascript
 * // extension.js
 * module.exports = {
 *   afterAll: async (context) => {
 *     console.log(`Eval ${context.evalId} completed`);
 *     console.log(`Results: ${context.results.length} tests`);
 *     // Send to monitoring, database, etc.
 *   }
 * };
 * ```
 */
export type AfterAllExtensionHookContext = {
  /** The test suite configuration */
  suite: TestSuite;
  /** All evaluation results as plain data objects */
  results: EvaluateResult[];
  /** Completed prompts with metrics */
  prompts: CompletedPrompt[];
  /** Unique identifier for this evaluation run */
  evalId: string;
  /** The full evaluation configuration */
  config: Partial<UnifiedConfig>;
};

/**
 * Maps hook names to their context types.
 * Used for type-safe extension hook invocation.
 */
export type ExtensionHookContextMap = {
  beforeAll: BeforeAllExtensionHookContext;
  beforeEach: BeforeEachExtensionHookContext;
  afterEach: AfterEachExtensionHookContext;
  afterAll: AfterAllExtensionHookContext;
};

/**
 * Runs extension hooks for the given hook name and context. The hook will be called with the context object,
 * and can update the context object to persist data into provider calls.
 * @param extensions - An array of extension paths, or null.
 * @param hookName - The name of the hook to run.
 * @param context - The context object to pass to the hook. T depends on the type of the hook.
 * @returns A Promise that resolves with one of the following:
 *  - The original context object, if no extensions are provided OR if the returned context is not valid.
 *  - The updated context object, if the extension hook returns a valid context object. The updated context,
 *    if defined, must conform to the type T; otherwise, a validation error is thrown.
 */
/**
 * Valid hook names that can be used to filter which hooks an extension runs for.
 * If an extension specifies one of these as its function name (e.g., file://path:beforeAll),
 * it will only run for that specific hook and use the NEW calling convention: (context, { hookName }).
 * If an extension specifies a custom function name (e.g., file://path:myHandler),
 * it will run for ALL hooks and use the LEGACY calling convention: (hookName, context).
 */
const EXTENSION_HOOK_NAMES = new Set(['beforeAll', 'beforeEach', 'afterEach', 'afterAll']);

/**
 * Extracts the hook name from an extension path.
 * Format: file://path/to/file.js:hookName or file://path/to/file.py:hook_name
 * @returns The hook name or undefined if not specified
 */
export function getExtensionHookName(extension: string): string | undefined {
  if (!extension.startsWith('file://')) {
    return undefined;
  }
  const lastColonIndex = extension.lastIndexOf(':');
  // Check if colon is part of Windows drive letter (position 8 after file://) or not present
  if (lastColonIndex > 8) {
    const functionName = extension.slice(lastColonIndex + 1);
    // Return undefined for empty strings (e.g., "file://hooks.js:")
    return functionName || undefined;
  }
  return undefined;
}

/**
 * Re-attaches the non-serializable `function` callable to prompts returned from a
 * `beforeAll` extension hook.
 *
 * Python extension hooks run in a subprocess, so the context is serialized with
 * `JSON.stringify` on the way in and parsed on the way out. (JavaScript hooks run
 * in-process and keep live references, so they are unaffected unless they clone the
 * suite themselves.) JSON cannot represent the `function` property that
 * `file://...:fn` prompts carry, so it is dropped on the round-trip. Without
 * restoring it, the evaluator falls back to sending the prompt's raw source as text
 * instead of executing the function
 * (https://github.com/promptfoo/promptfoo/issues/9653).
 *
 * A returned prompt is matched to an original by `label` (the stable identifier for
 * file-based prompts) and the function is only restored when the original carried one
 * and the `raw` source is unchanged — so a hook that intentionally rewrites a prompt
 * keeps its new behavior. Labels shared by more than one function-carrying original
 * are treated as ambiguous and skipped to avoid restoring the wrong function.
 */
function restorePromptFunctions(returnedPrompts: Prompt[], originalPrompts: Prompt[]): Prompt[] {
  if (!Array.isArray(returnedPrompts) || !Array.isArray(originalPrompts)) {
    return returnedPrompts;
  }

  const originalsByLabel = new Map<string, Prompt | null>();
  for (const original of originalPrompts) {
    if (!original || typeof original.function !== 'function' || original.label == null) {
      continue;
    }
    // A null entry marks an ambiguous (duplicated) label that must not be restored.
    originalsByLabel.set(original.label, originalsByLabel.has(original.label) ? null : original);
  }
  if (originalsByLabel.size === 0) {
    return returnedPrompts;
  }

  const restored = returnedPrompts.map((returned) => {
    if (!returned || typeof returned.function === 'function' || returned.label == null) {
      return returned;
    }
    const original = originalsByLabel.get(returned.label);
    if (original && original.raw === returned.raw) {
      return { ...returned, function: original.function };
    }
    return returned;
  });

  // A prompt function that was neither restored nor returned by the hook means the
  // prompt will render its raw source as text — the original #9653 symptom. Surface
  // why, so users get a breadcrumb instead of a silent behavior change.
  const labelsWithFunction = new Set<string>();
  const returnedLabels = new Set<string>();
  for (const prompt of restored) {
    if (prompt?.label != null) {
      returnedLabels.add(prompt.label);
      if (typeof prompt.function === 'function') {
        labelsWithFunction.add(prompt.label);
      }
    }
  }
  for (const [label, original] of originalsByLabel) {
    if (labelsWithFunction.has(label)) {
      continue;
    }
    if (original === null) {
      if (returnedLabels.has(label)) {
        logger.warn(
          `beforeAll extension hook: multiple prompts share the label "${label}", so their prompt functions cannot be safely restored after the hook's serialized round-trip. These prompts will render their raw source as text. Give each prompt a unique label to fix this.`,
        );
      }
    } else if (returnedLabels.has(label)) {
      logger.debug(
        `beforeAll extension hook rewrote prompt "${label}"; its original prompt function was not re-attached.`,
      );
    } else if (
      restored.some(
        (prompt) => prompt && typeof prompt.function !== 'function' && prompt.raw === original.raw,
      )
    ) {
      logger.warn(
        `beforeAll extension hook: prompt "${label}" carried a prompt function, but the hook returned its content under a different label. The function cannot be restored, so the prompt will render its raw source as text. Keep prompt labels unchanged to preserve prompt functions.`,
      );
    } else {
      logger.debug(
        `beforeAll extension hook removed prompt "${label}"; its prompt function no longer applies.`,
      );
    }
  }

  return restored;
}

export async function runExtensionHook<HookName extends keyof ExtensionHookContextMap>(
  extensions: string[] | null | undefined,
  hookName: HookName,
  context: ExtensionHookContextMap[HookName],
): Promise<ExtensionHookContextMap[HookName]> {
  if (!extensions || !Array.isArray(extensions) || extensions.length === 0) {
    return context;
  }

  telemetry.record('feature_used', {
    feature: 'extension_hook',
  });

  logger.debug(`Running ${hookName} hook with ${extensions.length} extension(s)`);

  let updatedContext: ExtensionHookContextMap[HookName] = { ...context };

  for (const extension of extensions) {
    invariant(typeof extension === 'string', 'extension must be a string');

    // Only run extensions that match the current hook name.
    // Extension format: file://path/to/file.js:functionName
    //
    // Behavior:
    // - If functionName is a known hook name (beforeAll, beforeEach, afterEach, afterAll),
    //   only run for that specific hook.
    // - If functionName is a custom name (e.g., myHandler, extension_hook),
    //   run for ALL hooks (generic handler pattern).
    // - If no functionName is specified, run for ALL hooks.
    const extensionHookName = getExtensionHookName(extension);
    if (
      extensionHookName &&
      EXTENSION_HOOK_NAMES.has(extensionHookName) &&
      extensionHookName !== hookName
    ) {
      logger.debug(
        `Skipping extension ${extension} for hook ${hookName} (extension targets ${extensionHookName} only)`,
      );
      continue;
    }

    // Determine calling convention based on function name:
    // - Known hook names (beforeAll, etc.) use NEW convention: (context, { hookName })
    //   These are hook-specific handlers that don't need hookName passed explicitly.
    // - Custom names or no function name use LEGACY convention: (hookName, context)
    //   These are generic handlers that need hookName to determine which hook is running.
    const useNewCallingConvention =
      extensionHookName && EXTENSION_HOOK_NAMES.has(extensionHookName);

    logger.debug(
      `Running extension ${extension} for hook ${hookName} (${useNewCallingConvention ? 'new' : 'legacy'} convention)`,
    );

    let extensionReturnValue;
    try {
      if (useNewCallingConvention) {
        // NEW convention: fn(context, { hookName })
        // Use updatedContext so each extension sees changes from previous extensions
        extensionReturnValue = await transform(extension, updatedContext, { hookName }, false);
      } else {
        // LEGACY convention: fn(hookName, context) - backwards compatible with pre-v0.102 hooks
        extensionReturnValue = await transform(extension, hookName, updatedContext, false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const wrappedError = new Error(
        `Extension hook "${hookName}" failed for ${extension}: ${errorMessage}`,
      );
      (wrappedError as Error & { cause?: unknown }).cause = error;
      throw wrappedError;
    }

    // If the extension hook returns a value, update the context with the value's mutable fields.
    // This also provides backwards compatibility for extension hooks that do not return a value.
    if (extensionReturnValue) {
      switch (hookName) {
        case 'beforeAll': {
          (updatedContext as BeforeAllExtensionHookContext) = {
            suite: {
              ...(updatedContext as BeforeAllExtensionHookContext).suite,
              // Mutable properties:
              prompts: restorePromptFunctions(
                extensionReturnValue.suite.prompts,
                (updatedContext as BeforeAllExtensionHookContext).suite.prompts,
              ),
              providerPromptMap: extensionReturnValue.suite.providerPromptMap,
              tests: extensionReturnValue.suite.tests,
              scenarios: extensionReturnValue.suite.scenarios,
              defaultTest: extensionReturnValue.suite.defaultTest,
              nunjucksFilters: extensionReturnValue.suite.nunjucksFilters,
              derivedMetrics: extensionReturnValue.suite.derivedMetrics,
              redteam: extensionReturnValue.suite.redteam,
            },
          };
          break;
        }
        case 'beforeEach': {
          (updatedContext as BeforeEachExtensionHookContext) = {
            test: extensionReturnValue.test,
          };
          break;
        }
        case 'afterEach': {
          if (extensionReturnValue.result) {
            const currentResult = (updatedContext as AfterEachExtensionHookContext).result;
            const mergedResponse =
              currentResult.response && extensionReturnValue.result.response?.metadata
                ? {
                    ...currentResult.response,
                    metadata: {
                      ...currentResult.response.metadata,
                      ...extensionReturnValue.result.response.metadata,
                    },
                  }
                : currentResult.response;
            const validScores = filterFiniteScores(extensionReturnValue.result.namedScores || {});
            (updatedContext as AfterEachExtensionHookContext) = {
              test: (updatedContext as AfterEachExtensionHookContext).test,
              result: {
                ...currentResult,
                namedScores: {
                  ...currentResult.namedScores,
                  ...validScores,
                },
                metadata: {
                  ...currentResult.metadata,
                  ...(extensionReturnValue.result.metadata || {}),
                },
                response: mergedResponse,
              },
            };
          }
          break;
        }
        // No case for 'afterAll': it runs after results are persisted and is
        // intended for side effects (monitoring, cleanup). Return values are
        // intentionally ignored since there is no downstream consumer.
      }
    }
  }

  return updatedContext;
}
