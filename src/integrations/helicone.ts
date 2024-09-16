import { getEnvString } from '../envars';

const heliconeApiKey = getEnvString('HELICONE_API_KEY');

interface PromptVersionCompiled {
  id: string;
  minor_version: number;
  major_version: number;

  prompt_v2: string;
  model: string;
  prompt_compiled: any;
}

export interface ResultError<K> {
  data: null;
  error: K;
}

export interface ResultSuccess<T> {
  data: T;
  error: null;
}

export type Result<T, K> = ResultSuccess<T> | ResultError<K>;

const buildFilter = (majorVersion?: number, minorVersion?: number): any => {
  const filter: any = {};
  if (majorVersion === undefined && minorVersion === undefined) {
    return filter;
  }

  if (majorVersion !== undefined) {
    filter.left = {
      prompts_versions: {
        major_version: {
          equals: majorVersion,
        },
      },
    };
  }
  if (minorVersion === undefined) {
    filter.operator = 'and';
    filter.right = 'all';
  } else {
    if (!filter.left) {
      filter.left = {
        prompts_versions: {
          minor_version: {
            equals: minorVersion,
          },
        },
      };
      filter.operator = 'and';
      filter.right = 'all';
      return filter;
    }
    filter.operator = 'and';
    filter.right = {
      prompts_versions: {
        minor_version: {
          equals: minorVersion,
        },
      },
    };
  }

  return filter;
};

export async function getPrompt(
  id: string,
  variables: Record<string, any>,
  majorVersion?: number,
  minorVersion?: number,
): Promise<string> {
  const getHeliconePrompt = async (
    id: string,
    majorVersion?: number,
    minorVersion?: number,
    variables?: Record<string, any>,
  ) => {
    const res = await fetch(`https://api.helicone.ai/v1/prompt/${id}/compile`, {
      headers: {
        Authorization: `Bearer ${heliconeApiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        filter: buildFilter(majorVersion, minorVersion),
        inputs: variables,
      }),
    });
    return (await res.json()) as Result<PromptVersionCompiled, any>;
  };

  const heliconePrompt = await getHeliconePrompt(id, majorVersion, minorVersion, variables);
  if (heliconePrompt.error) {
    throw new Error(heliconePrompt.error);
  }
  return heliconePrompt.data?.prompt_compiled;
}
