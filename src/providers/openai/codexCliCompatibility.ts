import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import semver from 'semver';

const CODEX_SDK_PACKAGE = '@openai/codex-sdk';
const CODEX_CLI_PACKAGE = '@openai/codex';
const CODEX_SDK_DOCS_URL = 'https://www.promptfoo.dev/docs/providers/openai-codex-sdk/';
const CODEX_VERSION_PATTERN =
  /\bcodex-cli(?:-exec)?\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/;
const compatibilityChecks = new Map<string, Promise<void>>();
const execFileAsync = promisify(execFile);

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
    throw new Error(
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
    throw new Error(
      `Could not verify Codex CLI compatibility for ${options.codexPathOverride}: ${message}. For more information, see: ${CODEX_SDK_DOCS_URL}`,
    );
  }

  const version = CODEX_VERSION_PATTERN.exec(output)?.[1];
  if (!version || !semver.valid(version) || !semver.eq(version, supportedVersion)) {
    throw new Error(
      `${CODEX_SDK_PACKAGE} supports Codex CLI/event schema ${supportedVersion}, but ${options.codexPathOverride} reports ${version ?? 'an unknown version'}. For more information, see: ${CODEX_SDK_DOCS_URL}`,
    );
  }
}

function getBinaryIdentity(codexPathOverride: string): string {
  try {
    const stats = fs.statSync(codexPathOverride);
    return `${stats.size}:${stats.mtimeMs}`;
  } catch {
    // The probe below will report an actionable error if the binary is unavailable.
    return 'unavailable';
  }
}

export function checkCodexCliCompatibility(options: CompatibilityOptions): Promise<void> {
  const envIdentity = crypto
    .createHash('sha256')
    .update(
      JSON.stringify(
        Object.entries(options.env).sort(([left], [right]) => left.localeCompare(right)),
      ),
    )
    .digest('hex');
  const cacheKey = [
    options.sdkEntryPoint,
    options.codexPathOverride,
    getBinaryIdentity(options.codexPathOverride),
    envIdentity,
  ].join('\0');
  let check = compatibilityChecks.get(cacheKey);
  if (!check) {
    check = runCompatibilityCheck(options).catch((error) => {
      compatibilityChecks.delete(cacheKey);
      throw error;
    });
    compatibilityChecks.set(cacheKey, check);
  }
  return check;
}
