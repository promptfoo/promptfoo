import dedent from 'dedent';
import { z } from 'zod';
import logger from '../logger';
import { ApiProvider } from '../types';

export const PurposeSchema = z.object({
  intent: z.string().optional(),
  variables: z.array(z.string()).optional(),
});
export type Purpose = z.infer<typeof PurposeSchema>;

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

    <example>
    <prompt>
    You are a helpful assistant. Please provide a summary of the following text:
    {% raw %}{{text}}{% endraw %}
    </prompt>
    <output>
    {
      "intent": "Summarize given text",
      "variables": ["text"]
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
  // sometimes the llm returns ```json, find the first { and the last }
  try {
    const result = JSON.parse(
      output.substring(output.indexOf('{'), output.lastIndexOf('}') + 1),
    ) as Purpose;
    logger.debug(`purpose and prompt variables: ${JSON.stringify(result)}`);
    const parsedResult = PurposeSchema.parse(result);
    return parsedResult;
  } catch (e) {
    logger.error(`Failed to parse purpose: ${e}`);
  }
  return { intent: undefined, variables: undefined };
}
