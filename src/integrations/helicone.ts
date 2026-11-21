import { getEnvString } from '../envars';
import { fetchWithProxy } from '../util/fetch/index';

const buildFilter = (majorVersion?: number, minorVersion?: number) => {
  if (majorVersion === undefined && minorVersion === undefined) {
    return {};
  }

  return {
    left: {
      prompts_versions: {
        [majorVersion === undefined ? 'minor_version' : 'major_version']: {
          equals: majorVersion === undefined ? minorVersion : majorVersion,
        },
      },
    },
    operator: 'and',
    right:
      majorVersion !== undefined && minorVersion !== undefined
        ? {
            prompts_versions: {
              minor_version: {
                equals: minorVersion,
              },
            },
          }
        : 'all',
  };
};

export async function getPrompt(
  id: string,
  variables: Record<string, unknown>,
  majorVersion?: number,
  minorVersion?: number,
): Promise<string> {
  const getHeliconePrompt = async () => {
    const res = await fetchWithProxy(`https://api.helicone.ai/v1/prompt/${id}/compile`, {
      headers: {
        // Read at call time: --env-file and the config's `env:` block are applied after this module is imported.
        Authorization: `Bearer ${getEnvString('HELICONE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        filter: buildFilter(majorVersion, minorVersion),
        inputs: variables,
      }),
    });
    return (await res.json()) as
      | { data: { prompt_compiled: string }; error: null }
      | { data: null; error: string };
  };

  const heliconePrompt = await getHeliconePrompt();
  if (heliconePrompt.error) {
    throw new Error(heliconePrompt.error);
  }
  return heliconePrompt.data?.prompt_compiled!;
}
