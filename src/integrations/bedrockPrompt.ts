import { getEnvString } from '../envars';
import logger from '../logger';
import { getNunjucksEngine } from '../util/templates';

interface BedrockPromptConfig {
  promptId: string;
  version?: string;
  region?: string;
}

let bedrockAgentClient: any;

/**
 * Parse bedrock:// URL to extract prompt ID and version
 * Format: bedrock://PROMPT_ID[:VERSION]
 * Examples:
 *   bedrock://PROMPT12345 -> { promptId: 'PROMPT12345', version: undefined }
 *   bedrock://PROMPT12345:2 -> { promptId: 'PROMPT12345', version: '2' }
 *   bedrock://PROMPT12345:DRAFT -> { promptId: 'PROMPT12345', version: 'DRAFT' }
 */
export function parseBedrockPromptUrl(url: string): BedrockPromptConfig {
  const pattern = /^bedrock:\/\/([A-Z0-9]+)(?::(\d+|DRAFT))?$/;
  const match = url.match(pattern);

  if (!match) {
    throw new Error(
      `Invalid Bedrock prompt URL format: ${url}. Expected format: bedrock://PROMPT_ID[:VERSION]`,
    );
  }

  const [, promptId, version] = match;

  // Get region from environment variables
  const region = getEnvString('AWS_BEDROCK_REGION') || process.env.AWS_REGION || 'us-east-1';

  return {
    promptId,
    version,
    region,
  };
}

/**
 * Get Bedrock Agent client with credentials
 */
async function getBedrockAgentClient(region: string) {
  if (!bedrockAgentClient) {
    try {
      const { BedrockAgentClient } = await import('@aws-sdk/client-bedrock-agent');

      // Build client config
      const clientConfig: any = {
        region,
      };

      // Check for explicit credentials in env vars
      const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
      const sessionToken = process.env.AWS_SESSION_TOKEN;

      if (accessKeyId && secretAccessKey) {
        clientConfig.credentials = {
          accessKeyId,
          secretAccessKey,
          ...(sessionToken && { sessionToken }),
        };
      }

      bedrockAgentClient = new BedrockAgentClient(clientConfig);
      logger.debug('Created Bedrock Agent client', { region });
    } catch (_err) {
      throw new Error(
        'The @aws-sdk/client-bedrock-agent package is required for Bedrock Prompt Management. Please install it with: npm install @aws-sdk/client-bedrock-agent',
      );
    }
  }
  return bedrockAgentClient;
}

/**
 * Fetch a prompt from Bedrock Prompt Management and render it with variables
 * Returns the rendered template string (for TEXT prompts) or JSON messages (for CHAT prompts)
 */
export async function getPrompt(
  promptId: string,
  version?: string,
  region?: string,
  vars?: Record<string, string | object>,
): Promise<string> {
  const resolvedRegion =
    region || getEnvString('AWS_BEDROCK_REGION') || process.env.AWS_REGION || 'us-east-1';

  const client = await getBedrockAgentClient(resolvedRegion);

  try {
    const { GetPromptCommand } = await import('@aws-sdk/client-bedrock-agent');

    const command = new GetPromptCommand({
      promptIdentifier: promptId,
      promptVersion: version,
    });

    logger.debug('Fetching Bedrock prompt', { promptId, version, region: resolvedRegion });
    const response = await client.send(command);

    if (!response.variants || response.variants.length === 0) {
      throw new Error(`Bedrock prompt ${promptId} has no variants`);
    }

    // Use the first variant (MVP: no variant selection)
    const variant = response.variants[0];

    if (!variant.templateConfiguration) {
      throw new Error(`Bedrock prompt ${promptId} variant has no template configuration`);
    }

    // Get Nunjucks engine for variable substitution
    const nunjucks = getNunjucksEngine();

    // Handle TEXT prompts
    if (variant.templateType === 'TEXT') {
      const textConfig = variant.templateConfiguration.text;
      if (!textConfig?.text) {
        throw new Error(`Bedrock prompt ${promptId} TEXT variant has no text template`);
      }
      logger.debug('Retrieved TEXT prompt from Bedrock', {
        promptId,
        version,
        templateLength: textConfig.text.length,
      });

      // Render template with variables
      const rendered = vars ? nunjucks.renderString(textConfig.text, vars) : textConfig.text;
      return rendered;
    }

    // Handle CHAT prompts
    if (variant.templateType === 'CHAT') {
      const chatConfig = variant.templateConfiguration.chat;
      if (!chatConfig?.messages) {
        throw new Error(`Bedrock prompt ${promptId} CHAT variant has no messages`);
      }
      logger.debug('Retrieved CHAT prompt from Bedrock', {
        promptId,
        version,
        messageCount: chatConfig.messages.length,
      });

      // Render variables in each message
      if (vars) {
        const renderedMessages = chatConfig.messages.map((msg: any) => ({
          ...msg,
          content: nunjucks.renderString(msg.content, vars),
        }));
        return JSON.stringify(renderedMessages);
      }

      return JSON.stringify(chatConfig.messages);
    }

    throw new Error(
      `Unsupported Bedrock prompt template type: ${variant.templateType}. Supported types: TEXT, CHAT`,
    );
  } catch (error: any) {
    const errorMsg = error.message || String(error);

    // Provide helpful error messages for common cases
    if (errorMsg.includes('ResourceNotFoundException')) {
      if (version) {
        throw new Error(
          `Bedrock prompt "${promptId}" version ${version} not found in region ${resolvedRegion}. Check that the prompt ID and version exist.`,
        );
      }
      throw new Error(
        `Bedrock prompt "${promptId}" not found in region ${resolvedRegion}. Check that the prompt ID exists.`,
      );
    }

    if (errorMsg.includes('AccessDeniedException')) {
      throw new Error(
        `Access denied to Bedrock prompt "${promptId}". Ensure your AWS credentials have bedrock:GetPrompt permission.`,
      );
    }

    if (version) {
      throw new Error(
        `Failed to fetch Bedrock prompt "${promptId}" version ${version}: ${errorMsg}`,
      );
    }
    throw new Error(`Failed to fetch Bedrock prompt "${promptId}": ${errorMsg}`);
  }
}
