import cliState from '../cliState';
import { getEnvBool, getEnvString } from '../envars';
import { CloudConfig } from '../globalConfig/cloud';

export function getRemoteGenerationUrl(): string {
  // Check env var first
  const envUrl = getEnvString('PROMPTFOO_REMOTE_GENERATION_URL');
  if (envUrl) {
    return envUrl;
  }
  // If logged into cloud use that url + /task
  const cloudConfig = new CloudConfig();
  if (cloudConfig.isEnabled()) {
    return cloudConfig.getApiHost() + '/task';
  }
  // otherwise use the default
  return 'https://api.promptfoo.app/task';
}

export function neverGenerateRemote(): boolean {
  return getEnvBool('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION');
}

export function shouldGenerateRemote(): boolean {
  // Generate remotely when the user has not disabled it and does not have an OpenAI key.
  return (!neverGenerateRemote() && !getEnvString('OPENAI_API_KEY')) || (cliState.remote ?? false);
}

export function getRemoteGenerationUrlForUnaligned(): string {
  // Check env var first
  const envUrl = getEnvString('PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT');
  if (envUrl) {
    return envUrl;
  }
  // If logged into cloud use that url + /task
  const cloudConfig = new CloudConfig();
  if (cloudConfig.isEnabled()) {
    return cloudConfig.getApiHost() + '/task/harmful';
  }
  // otherwise use the default
  return 'https://api.promptfoo.app/task/harmful';
}
