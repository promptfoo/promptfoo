import { getEnvBool } from '../envars';

export function isTemplatingDisabled(): boolean {
  return getEnvBool('PROMPTFOO_DISABLE_TEMPLATING');
}

export function shouldDisableTemplateProcessEnvVars(): boolean {
  return getEnvBool(
    'PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS',
    getEnvBool('PROMPTFOO_SELF_HOSTED', false),
  );
}
