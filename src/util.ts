import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import yaml from 'js-yaml';
import nunjucks from 'nunjucks';
import { stringify } from 'csv-stringify/sync';

import logger from './logger';
import { getDirectory } from './esm';

import type { EvaluateSummary, EvaluateTableOutput, UnifiedConfig } from './types';

let globalConfigCache: any = null;

export function resetGlobalConfig(): void {
  globalConfigCache = null;
}

export function readGlobalConfig(): any {
  if (!globalConfigCache) {
    const configDir = getConfigDirectoryPath();
    const configFilePath = path.join(configDir, 'promptfoo.yaml');

    if (fs.existsSync(configFilePath)) {
      globalConfigCache = yaml.load(fs.readFileSync(configFilePath, 'utf-8'));
    } else {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      globalConfigCache = { hasRun: false };
      fs.writeFileSync(configFilePath, yaml.dump(globalConfigCache));
    }
  }

  return globalConfigCache;
}

export function maybeRecordFirstRun(): boolean {
  // Return true if first run
  try {
    const config = readGlobalConfig();
    if (!config.hasRun) {
      config.hasRun = true;
      fs.writeFileSync(path.join(getConfigDirectoryPath(), 'promptfoo.yaml'), yaml.dump(config));
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}

export async function maybeReadConfig(configPath: string): Promise<UnifiedConfig | undefined> {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  return readConfig(configPath);
}

export async function readConfig(configPath: string): Promise<UnifiedConfig> {
  const ext = path.parse(configPath).ext;
  switch (ext) {
    case '.json':
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as UnifiedConfig;
    case '.js':
      return require(configPath) as UnifiedConfig;
    case '.yaml':
    case '.yml':
      let ret = yaml.load(fs.readFileSync(configPath, 'utf-8')) as UnifiedConfig;
      ret = (await $RefParser.dereference(ret)) as UnifiedConfig;
      return ret;
    default:
      throw new Error(`Unsupported configuration file format: ${ext}`);
  }
}

export function writeOutput(
  outputPath: string,
  results: EvaluateSummary,
  config: Partial<UnifiedConfig>,
  shareableUrl: string | null,
): void {
  const outputExtension = outputPath.split('.').pop()?.toLowerCase();

  const outputToSimpleString = (output: EvaluateTableOutput) =>
    `${output.pass ? '[PASS]' : '[FAIL]'} (${output.score.toFixed(2)}) ${output.text}`;

  if (outputExtension === 'csv' || outputExtension === 'txt') {
    const csvOutput = stringify([
      [...results.table.head.prompts, ...results.table.head.vars],
      ...results.table.body.map((row) => [...row.outputs.map(outputToSimpleString), ...row.vars]),
    ]);
    fs.writeFileSync(outputPath, csvOutput);
  } else if (outputExtension === 'json') {
    fs.writeFileSync(outputPath, JSON.stringify({ results, config, shareableUrl }, null, 2));
  } else if (outputExtension === 'yaml' || outputExtension === 'yml') {
    fs.writeFileSync(outputPath, yaml.dump({ results, config, shareableUrl }));
  } else if (outputExtension === 'html') {
    const template = fs.readFileSync(`${getDirectory()}/tableOutput.html`, 'utf-8');
    const table = [
      [...results.table.head.prompts, ...results.table.head.vars],
      ...results.table.body.map((row) => [...row.outputs.map(outputToSimpleString), ...row.vars]),
    ];
    const htmlOutput = getNunjucksEngine().renderString(template, {
      table,
      results: results.results,
    });
    fs.writeFileSync(outputPath, htmlOutput);
  } else {
    throw new Error(`Unsupported output file format ${outputExtension}, please use csv, txt, json, yaml, yml, html.`);
  }
}

const RESULT_HISTORY_LENGTH = parseInt(process.env.RESULT_HISTORY_LENGTH || '', 10) || 50;

export function getConfigDirectoryPath(): string {
  return path.join(os.homedir(), '.promptfoo');
}

export function getLatestResultsPath(): string {
  return path.join(getConfigDirectoryPath(), 'output', 'latest.json');
}

export function writeLatestResults(results: EvaluateSummary, config: Partial<UnifiedConfig>) {
  const resultsDirectory = path.join(getConfigDirectoryPath(), 'output');

  // Replace hyphens with colons (Windows compatibility).
  const timestamp = new Date().toISOString().replace(/:/g, '-');

  const newResultsPath = path.join(resultsDirectory, `eval-${timestamp}.json`);
  const latestResultsPath = getLatestResultsPath();
  try {
    fs.mkdirSync(resultsDirectory, { recursive: true });
    fs.writeFileSync(
      newResultsPath,
      JSON.stringify(
        {
          version: 1,
          config,
          results,
        },
        null,
        2,
      ),
    );

    // Use copy instead of symlink to avoid issues with Windows permissions.
    try {
      // Backwards compatibility: delete old symlink.
      fs.unlinkSync(latestResultsPath);
    } catch {}
    fs.copyFileSync(newResultsPath, latestResultsPath);

    cleanupOldResults();
  } catch (err) {
    logger.error(`Failed to write latest results to ${newResultsPath}:\n${err}`);
  }
}

export function listPreviousResults(): string[] {
  const directory = path.join(getConfigDirectoryPath(), 'output');
  const files = fs.readdirSync(directory);
  const resultsFiles = files.filter((file) => file.startsWith('eval-') && file.endsWith('.json'));
  const sortedFiles = resultsFiles.sort((a, b) => {
    const statA = fs.statSync(path.join(directory, a));
    const statB = fs.statSync(path.join(directory, b));
    return statA.birthtime.getTime() - statB.birthtime.getTime(); // sort in ascending order
  });
  return sortedFiles;
}

export function cleanupOldResults(remaining = RESULT_HISTORY_LENGTH) {
  const sortedFiles = listPreviousResults();
  for (let i = 0; i < sortedFiles.length - remaining; i++) {
    fs.unlinkSync(path.join(getConfigDirectoryPath(), 'output', sortedFiles[i]));
  }
}

export function readResult(
  name: string,
): { results: EvaluateSummary; config: Partial<UnifiedConfig> } | undefined {
  const resultsDirectory = path.join(getConfigDirectoryPath(), 'output');
  const resultsPath = path.join(resultsDirectory, name);
  try {
    const results = JSON.parse(fs.readFileSync(fs.realpathSync(resultsPath), 'utf-8'));
    return results;
  } catch (err) {
    logger.error(`Failed to read results from ${resultsPath}:\n${err}`);
  }
}

export function readLatestResults():
  | { results: EvaluateSummary; config: Partial<UnifiedConfig> }
  | undefined {
  return JSON.parse(fs.readFileSync(getLatestResultsPath(), 'utf-8'));
}

export function getNunjucksEngine() {
  nunjucks.configure({
    autoescape: false,
  });
  return nunjucks;
}
