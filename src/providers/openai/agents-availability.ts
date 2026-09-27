import semverSatisfies from 'semver/functions/satisfies.js';
import { getDirectory, resolvePackageEntryPoint } from '../../esm';
import { isMissingPackageImportError } from '../../util/packageImportErrors';
import { getPackageVersion } from '../../util/packageVersion';

const installCommand = 'npm install promptfoo @openai/agents@^0.11.8';
const missingPackageMessage = `The @openai/agents package is required for OpenAI Agents providers. Install it with: ${installCommand}`;

/** Check Promptfoo's SDK before loading either the provider or its redteam tool loader. */
export async function loadOpenAiAgentsModule<T>(load: () => Promise<T>): Promise<T> {
  const entryPoint = resolvePackageEntryPoint('@openai/agents', getDirectory());
  if (!entryPoint) {
    throw new Error(missingPackageMessage);
  }

  const version = getPackageVersion('@openai/agents', entryPoint);
  if (!version || !semverSatisfies(version, '^0.11.8')) {
    throw new Error(
      `OpenAI Agents providers require @openai/agents@^0.11.8 (found ${version ?? 'unknown'}). Install it with: ${installCommand}`,
    );
  }

  try {
    return await load();
  } catch (error) {
    if (isMissingPackageImportError(error, '@openai/agents')) {
      throw new Error(missingPackageMessage);
    }
    throw error;
  }
}
