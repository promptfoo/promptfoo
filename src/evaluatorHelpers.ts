import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';
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
import type { ApiProvider, NunjucksFilterMap, Prompt } from './types';
import { renderVarsInObject } from './util';
import { isJavascriptFile } from './util/file';
import invariant from './util/invariant';
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

export function resolveVariables(
  variables: Record<string, string | object>,
): Record<string, string | object> {
  let resolved = true;
  const regex = /\{\{\s*(\w+)\s*\}\}/; // Matches {{variableName}}, {{ variableName }}, etc.

  let iterations = 0;
  do {
    resolved = true;
    for (const key of Object.keys(variables)) {
      if (typeof variables[key] !== 'string') {
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
          resolved = false; // Indicate that we've made a replacement and should check again
        }
      }
    }
    iterations++;
  } while (!resolved && iterations < 5);

  return variables;
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

  // Remove any trailing newlines from vars, as this tends to be a footgun for JSON prompts.
  for (const key of Object.keys(vars)) {
    if (typeof vars[key] === 'string') {
      vars[key] = (vars[key] as string).replace(/\n$/, '');
    }
  }

  // Resolve variable mappings
  resolveVariables(vars);

  // Third party integrations
  if (prompt.raw.startsWith('portkey://')) {
    const portKeyResult = await getPortkeyPrompt(prompt.raw.slice('portkey://'.length), vars);
    return JSON.stringify(portKeyResult.messages);
  } else if (prompt.raw.startsWith('langfuse://')) {
    const langfusePrompt = prompt.raw.slice('langfuse://'.length);

    // we default to "text" type.
    const [helper, version, promptType = 'text'] = langfusePrompt.split(':');
    if (promptType !== 'text' && promptType !== 'chat') {
      throw new Error('Unknown promptfoo prompt type');
    }

    const langfuseResult = await getLangfusePrompt(
      helper,
      vars,
      promptType,
      version === 'latest' ? undefined : Number(version),
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
      return nunjucks.renderString(basePrompt, vars);
    }

    const parsed = JSON.parse(basePrompt);

    // The _raw_ prompt is valid JSON. That means that the user likely wants to substitute vars _within_ the JSON itself.
    // Recursively walk the JSON structure. If we find a string, render it with nunjucks.
    return JSON.stringify(renderVarsInObject(parsed, vars), null, 2);
  } catch {
    return nunjucks.renderString(basePrompt, vars);
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
