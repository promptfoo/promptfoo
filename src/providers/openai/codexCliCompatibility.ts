import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import semver from 'semver';

const CODEX_SDK_PACKAGE = '@openai/codex-sdk';
const CODEX_CLI_PACKAGE = '@openai/codex';
const CODEX_SDK_DOCS_URL = 'https://www.promptfoo.dev/docs/providers/openai-codex-sdk/';
const CODEX_VERSION_PATTERN =
  /\bcodex-cli(?:-exec)?\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/;
const execFileAsync = promisify(execFile);

export class CodexCliCompatibilityError extends Error {
  override name = 'CodexCliCompatibilityError';
}

interface CodexSdkManifest {
  name?: string;
  dependencies?: Record<string, string>;
}

function getSupportedCliVersion(sdkEntryPoint: string): string {
  let directory = path.dirname(sdkEntryPoint);

  while (true) {
    const manifestPath = path.join(directory, 'package.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as CodexSdkManifest;
      if (manifest.name === CODEX_SDK_PACKAGE) {
        const version = manifest.dependencies?.[CODEX_CLI_PACKAGE];
        if (!version || !semver.valid(version)) {
          throw new Error(
            `${CODEX_SDK_PACKAGE} does not declare an exact ${CODEX_CLI_PACKAGE} version`,
          );
        }
        return version;
      }
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(`Could not find ${CODEX_SDK_PACKAGE}/package.json for ${sdkEntryPoint}`);
    }
    directory = parent;
  }
}

interface CompatibilityOptions {
  sdkEntryPoint: string;
  codexPathOverride: string;
  env: Record<string, string>;
}

async function runCompatibilityCheck(options: CompatibilityOptions): Promise<void> {
  let supportedVersion: string;
  try {
    supportedVersion = getSupportedCliVersion(options.sdkEntryPoint);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CodexCliCompatibilityError(
      `Could not verify Codex CLI compatibility for ${options.codexPathOverride}: ${message}. For more information, see: ${CODEX_SDK_DOCS_URL}`,
    );
  }
  let output: string;

  try {
    const { stdout, stderr } = await execFileAsync(
      options.codexPathOverride,
      ['exec', '--experimental-json', '--version'],
      {
        encoding: 'utf8',
        env: options.env,
        timeout: 10_000,
        killSignal: 'SIGKILL',
        windowsHide: true,
      },
    );
    output = `${stdout}\n${stderr}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CodexCliCompatibilityError(
      `Could not verify Codex CLI compatibility for ${options.codexPathOverride}: ${message}. For more information, see: ${CODEX_SDK_DOCS_URL}`,
    );
  }

  const version = CODEX_VERSION_PATTERN.exec(output)?.[1];
  if (!version || !semver.valid(version) || semver.compareBuild(version, supportedVersion) !== 0) {
    throw new CodexCliCompatibilityError(
      `${CODEX_SDK_PACKAGE} supports Codex CLI/event schema ${supportedVersion}, but ${options.codexPathOverride} reports ${version ?? 'an unknown version'}. For more information, see: ${CODEX_SDK_DOCS_URL}`,
    );
  }
}

export function checkCodexCliCompatibility(options: CompatibilityOptions): Promise<void> {
  // The environment may contain arbitrary credentials. Do not derive a
  // process-lifetime cache key from it; probing each turn also detects PATH
  // replacements and wrapper changes reliably.
  return runCompatibilityCheck(options);
}
