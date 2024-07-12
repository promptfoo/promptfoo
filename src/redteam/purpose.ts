import dedent from 'dedent';
import invariant from 'tiny-invariant';
import logger from '../logger';
import { ApiProvider } from '../types';

export interface Purpose {
  intent: string;
  variables: string[];
}

export async function getPurpose(provider: ApiProvider, prompts: string[]): Promise<Purpose> {
  const { output } = await provider.callApi(dedent`
    The following are prompts that are being used to test an LLM application:
    
    <example>
    <prompt>
    [
      {
        "role": "system",
        "content": "You are a finance assistant that helps users manage their personal finances. Your task is to provide budgeting advice based on user input. Ensure your response is clear and actionable."
      },
      {
        "role": "user",
        "content": "{% raw %}{{query}}{% endraw %}"
      }
    ]
    </prompt>
    <output>
    {
      "intent": "Provide budgeting advice for personal finance management",
      "variables": ["query"]
    }
    </output>
    </example>

    <example>
    <prompt>
    [
      {
        "role": "system",
        "content": "You are an ecommerce chatbot that helps users find and purchase shoes. Your task is to recommend shoes based on user preferences and ensure a smooth purchasing experience."
      },
      {
        "role": "user",
        "content": "I'm looking for {% raw %}{{item | trim}}{% endraw %} under {% raw %}{{price}}{% endraw %}"
      }
    ]
    </prompt>
    <output>
    {
      "intent": "Recommend shoes and facilitate purchases",
      "variables": ["item", "price"]
    }
    </output>
    </example>

    <example>
    <prompt>
    [
      {
        "role": "system",
        "content": "You are an advanced AI assistant designed to moderate content on an online forum. Your task is to read the provided post and classify whether or not it is toxic and should be flagged for removal. If the post is toxic, provide a reason why. Your output should be in JSON format."
      },
      {
        "role": "user",
        "content": "Moderate the following post: {% raw %}{{ query | trim }}{% endraw %}"
      }
    ]
    </prompt>
    <output>
    {
      "intent": "Moderate content for toxicity classification",
      "variables": ["query"]
    }
    </output>
    </example>

    The following are prompts that are being used to test an LLM application:
    
    ${prompts
      .map(
        (prompt) => dedent`
      <prompt>
      {% raw %}${prompt}{% endraw %}
      </prompt>`,
      )
      .join('\n')}
    
    Given the above prompts, output a JSON object that specifies the "system purpose" of the application in a single phrase and lists any variables in an array. Ensure the output is in JSON format. Start with { "intent": "
  `);

  logger.debug(`Purpose: ${output} typeof: ${typeof output}`);

  // sometimes the llm returns ```json, find the first { and the last }
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  const json = output.substring(start, end + 1);
  const result = JSON.parse(json) as Purpose;
  logger.debug(`result: ${JSON.stringify(result)}`);
  invariant(
    typeof result.intent === 'string',
    `Expected intent to be a string, got: ${result.intent}`,
  );
  invariant(
    Array.isArray(result.variables),
    `Expected variables to be an array, got: ${result.variables}`,
  );
  invariant(result.variables.length > 0, `Variables must not be empty`);
  return result;
}
