import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';
import cliState from './cliState';
import { importModule } from './esm';
import logger from './logger';
import { runPython } from './python/pythonUtils';
import type { ApiProvider, NunjucksFilterMap, Prompt } from './types';
import { renderVarsInObject } from './util';
import { getNunjucksEngine } from './util/templates';

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
        if (variables[varName] !== undefined) {
          variables[key] = value.replace(placeholder, variables[varName] as string);
          resolved = false; // Indicate that we've made a replacement and should check again
        } else {
          // Do nothing - final nunjucks render will fail if necessary.
          // logger.warn(`Variable "${varName}" not found for substitution.`);
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
      switch (fileExtension) {
        case 'js':
        case 'cjs':
        case 'mjs':
        case 'ts':
        case 'cts':
        case 'mts':
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
          break;
        case 'py':
          const pythonScriptOutput = (await runPython(filePath, 'get_var', [
            varName,
            basePrompt,
            vars,
          ])) as { output?: string; error?: string };
          if (pythonScriptOutput.error) {
            throw new Error(`Error running Python script ${filePath}: ${pythonScriptOutput.error}`);
          }
          if (!pythonScriptOutput.output) {
            throw new Error(`Python script ${filePath} did not return any output`);
          }
          vars[varName] = pythonScriptOutput.output.trim();
          break;
        case 'yaml':
        case 'yml':
          vars[varName] = JSON.stringify(
            yaml.load(fs.readFileSync(filePath, 'utf8')) as string | object,
          );
          break;
        case 'json':
        default:
          vars[varName] = fs.readFileSync(filePath, 'utf8').trim();
          break;
      }
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
    const { getPrompt } = await import('./integrations/portkey');
    const portKeyResult = await getPrompt(prompt.raw.slice('portkey://'.length), vars);
    return JSON.stringify(portKeyResult.messages);
  } else if (prompt.raw.startsWith('langfuse://')) {
    const { getPrompt } = await import('./integrations/langfuse');
    const langfusePrompt = prompt.raw.slice('langfuse://'.length);

    // we default to "text" type.
    const [helper, version, promptType = 'text'] = langfusePrompt.split(':');
    if (promptType !== 'text' && promptType !== 'chat') {
      throw new Error('Unknown promptfoo prompt type');
    }

    const langfuseResult = await getPrompt(
      helper,
      vars,
      promptType,
      version !== 'latest' ? Number(version) : undefined,
    );
    return langfuseResult;
  }

  // Render prompt
  try {
    if (process.env.PROMPTFOO_DISABLE_JSON_AUTOESCAPE) {
      return nunjucks.renderString(basePrompt, vars);
    }

    const parsed = JSON.parse(basePrompt);

    // The _raw_ prompt is valid JSON. That means that the user likely wants to substitute vars _within_ the JSON itself.
    // Recursively walk the JSON structure. If we find a string, render it with nunjucks.
    return JSON.stringify(renderVarsInObject(parsed, vars), null, 2);
  } catch (err) {
    return nunjucks.renderString(basePrompt, vars);
  }
}
