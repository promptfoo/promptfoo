import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { normalizeConfigDraft, UnifiedConfigDraftSchema } from '../../types/configDraft';
import { sanitizeConfigForOutput } from '../sanitizer';
import { loadYaml } from '../yamlLoad';
import { DEFAULT_CONFIG_EXTENSIONS } from './extensions';

/** Read the conventional eval YAML without resolving environment references. */
export async function readDefaultEvalDraft() {
  for (const extension of DEFAULT_CONFIG_EXTENSIONS) {
    if (extension !== 'yaml' && extension !== 'yml') {
      continue;
    }

    let content: string;
    try {
      content = await readFile(path.resolve(`promptfooconfig.${extension}`), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    // Keep environment references intact and sanitize before sending data to the browser.
    let parsed: unknown;
    try {
      parsed = loadYaml(content);
    } catch {
      // YAML parser errors can include source lines with credentials.
      throw new Error('Invalid default eval YAML');
    }
    const result = UnifiedConfigDraftSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error('Invalid default eval draft');
    }

    const config = normalizeConfigDraft(result.data);
    const { basePath: _basePath, ...draft } = sanitizeConfigForOutput(config, {
      preserveDraftCredentialReferences: true,
    });
    return draft;
  }

  return null;
}
