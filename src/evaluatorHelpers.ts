import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';
import invariant from 'tiny-invariant';
import cliState from './cliState';
import { getEnvBool } from './envars';
import { importModule } from './esm';
import logger from './logger';
import { isPackagePath, loadFromPackage } from './providers/packageParser';
import { runPython } from './python/pythonUtils';
import telemetry from './telemetry';
import type { ApiProvider, NunjucksFilterMap, Prompt } from './types';
import { renderVarsInObject } from './util';
import { isJavascriptFile } from './util/file';
import { getNunjucksEngine } from './util/templates';
import { transform } from './util/transform';

export async function extractTextFromPDF(pdfPath: string): Promise<string> {
  logger.debug(`Extracting text from PDF: ${pdfPath}`);
  try {
    const { default: PDFParser } = await import('pdf-parse');
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await PDFParser(dataBuffer);
    return data.text.trim();
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cannot find module 'pdf-parse'")) {
      throw new Error('pdf-parse is not installed. Please install it with: npm install pdf-parse');
    }
    throw new Error(
      `Failed to extract text from PDF ${pdfPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

type VariableValue = string | object | number | boolean;
type Variables = Record<string, VariableValue>;

/**
 * Helper function to remove trailing newlines from string values
 * This prevents issues with JSON prompts
 */
export function trimTrailingNewlines(variables: Variables): Variables {
  const trimmedVars: Variables = { ...variables };
  for (const [key, value] of Object.entries(trimmedVars)) {
    if (typeof value === 'string') {
      trimmedVars[key] = value.replace(/\n$/, '');
    }
  }
  return trimmedVars;
}

/**
 * Helper function that resolves variables within a single string.
 *
 * @param value - The string containing variables to resolve
 * @param variables - Object containing variable values
 * @param regex - Regular expression for matching variables
 * @returns The string with all resolvable variables replaced
 */
function resolveString(value: string, variables: Variables, regex: RegExp): string {
  let result = value;
  let match: RegExpExecArray | null;

  // Reset regex for new string
  regex.lastIndex = 0;

  // Find and replace all variables in the string
  while ((match = regex.exec(result)) !== null) {
    const [placeholder, varName] = match;

    // Skip undefined variables (will be handled by nunjucks later)
    if (variables[varName] === undefined) {
      continue;
    }

    // Only replace if the replacement is a string
    const replacement = variables[varName];
    if (typeof replacement === 'string') {
      result = result.replace(placeholder, replacement);
    }
  }

  return result;
}

/**
 * Resolves variables within string values of an object, replacing {{varName}} with
 * the corresponding value from the variables object.
 *
 * Example:
 * Input: { greeting: "Hello {{name}}!", name: "World" }
 * Output: { greeting: "Hello World!", name: "World" }
 *
 * @param variables - Object containing variable names and their values
 * @returns A new object with all variables resolved
 */
export function resolveVariables(variables: Variables): Variables {
  const regex = /\{\{\s*(\w+)\s*\}\}/g; // Matches {{variableName}}, {{ variableName }}, etc.
  const resolvedVars: Variables = trimTrailingNewlines(variables);
  const MAX_ITERATIONS = 5;

  // Iterate up to MAX_ITERATIONS times to handle nested variables
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let hasChanges = false;

    // Process each variable in the object
    for (const [key, value] of Object.entries(resolvedVars)) {
      // Skip non-string values as they can't contain variable references
      if (typeof value !== 'string') {
        continue;
      }

      // Try to resolve any variables in this string
      const newValue = resolveString(value, resolvedVars, regex);

      // Only update if the value actually changed
      if (newValue !== value) {
        resolvedVars[key] = newValue;
        hasChanges = true;
      }
    }

    // If no changes were made in this iteration, we're done
    if (!hasChanges) {
      break;
    }
  }

  return resolvedVars;
}

export async function renderPrompt(
  prompt: Prompt,
  vars: Record<string, string | object>,
  nunjucksFilters?: NunjucksFilterMap,
  provider?: ApiProvider,
): Promise<string> {
  const nunjucks = getNunjucksEngine(nunjucksFilters);

  let basePrompt = prompt.raw;

  // Load files
  for (const [varName, value] of Object.entries(vars)) {
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
        ])) as { output?: any; error?: string };
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
          yaml.load(fs.readFileSync(filePath, 'utf8')) as string | object,
        );
      } else if (fileExtension === 'pdf') {
        vars[varName] = await extractTextFromPDF(filePath);
      } else {
        vars[varName] = fs.readFileSync(filePath, 'utf8').trim();
      }
    } else if (isPackagePath(value)) {
      const basePath = cliState.basePath || '';
      const javascriptOutput = (await (
        await loadFromPackage(value, basePath)
      )(varName, basePrompt, vars, provider)) as {
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
    }
  }

  // Apply prompt functions
  if (prompt.function) {
    const result = await prompt.function({ vars, provider });
    if (typeof result === 'string') {
      basePrompt = result;
    } else if (typeof result === 'object') {
      basePrompt = JSON.stringify(result);
    } else {
      throw new Error(`Prompt function must return a string or object, got ${typeof result}`);
    }
  }

  // Resolve variable mappings
  const resolvedVars: Variables = resolveVariables(vars);

  // Third party integrations
  if (prompt.raw.startsWith('portkey://')) {
    const { getPrompt } = await import('./integrations/portkey');
    const portKeyResult = await getPrompt(prompt.raw.slice('portkey://'.length), resolvedVars);
    return JSON.stringify(portKeyResult.messages);
  }
  if (prompt.raw.startsWith('langfuse://')) {
    const { getPrompt } = await import('./integrations/langfuse');
    const langfusePrompt = prompt.raw.slice('langfuse://'.length);

    // we default to "text" type.
    const [helper, version, promptType = 'text'] = langfusePrompt.split(':');
    if (promptType !== 'text' && promptType !== 'chat') {
      throw new Error('Unknown promptfoo prompt type');
    }

    const langfuseResult = await getPrompt(
      helper,
      resolvedVars,
      promptType,
      version === 'latest' ? undefined : Number(version),
    );
    return langfuseResult;
  }
  if (prompt.raw.startsWith('helicone://')) {
    const { getPrompt } = await import('./integrations/helicone');
    const heliconePrompt = prompt.raw.slice('helicone://'.length);
    const [id, version] = heliconePrompt.split(':');
    const [majorVersion, minorVersion] = version ? version.split('.') : [undefined, undefined];
    const heliconeResult = await getPrompt(
      id,
      resolvedVars,
      majorVersion === undefined ? undefined : Number(majorVersion),
      minorVersion === undefined ? undefined : Number(minorVersion),
    );
    return heliconeResult;
  }
  if (getEnvBool('PROMPTFOO_DISABLE_JSON_AUTOESCAPE')) {
    return nunjucks.renderString(basePrompt, resolvedVars);
  }
  try {
    // base prompt is either a string or JSON object. Throws if it's a string.
    const parsed = yaml.load(basePrompt) as Record<string, any>;
    // The _raw_ prompt is valid JSON. That means that the user likely wants to substitute
    // vars _within_ the JSON itself. Recursively walk the JSON structure. If we find a
    // string, render it with nunjucks.
    return JSON.stringify(renderVarsInObject<Variables>(parsed, resolvedVars), null, 2);
  } catch {
    const rendered = nunjucks.renderString(basePrompt, resolvedVars).trim();

    const hasJsonStructure = rendered.includes('{') || rendered.includes('[');
    if (!hasJsonStructure) {
      return rendered;
    }
    try {
      // handles newlines in strings that would cause JSON.parse to fail
      const parsed = yaml.load(rendered) as Record<string, any>;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return rendered;
    }
  }
}

/**
 * Runs extension hooks for the given hook name and context.
 * @param extensions - An array of extension paths.
 * @param hookName - The name of the hook to run.
 * @param context - The context object to pass to the hook.
 * @returns A Promise that resolves when all hooks have been run.
 */
export async function runExtensionHook(
  extensions: string[] | undefined,
  hookName: string,
  context: any,
) {
  if (!extensions || !Array.isArray(extensions) || extensions.length === 0) {
    return;
  }

  telemetry.recordOnce('feature_used', {
    feature: 'extension_hook',
  });

  for (const extension of extensions) {
    invariant(typeof extension === 'string', 'extension must be a string');
    logger.debug(`Running extension hook ${hookName} with context ${JSON.stringify(context)}`);
    await transform(extension, hookName, context, false);
  }
}
