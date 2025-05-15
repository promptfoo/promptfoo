const express = require('express');
const OpenAI = require('openai');
const dealershipTools = require('./dealershipTools');

const app = express();
app.use(express.json());

// Simplified system prompt
const SYSTEM_PROMPT = `
You are the official website chatbot for "Red Panda Motors," a family-owned car dealership.

Your job is to help customers visiting the Red Panda Motors website find clear, accurate, and detailed
information about the dealership's real-world inventory, pricing, financing options, and services.

You should also help guide them through next steps, such as booking test drives, scheduling service
appointments, and learning about promotions.

Always remain friendly, knowledgeable, and trustworthy.`;

// Rate limiting configuration
const RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_WINDOW || 60000; // 1 minute in ms
const RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS || 1000; // max requests per window
const rateLimitStore = new Map();

// Helper to create standardized error responses
function errorResponse(status, message, type = 'general') {
  return { status, json: { error: message, error_type: type } };
}

// Rate limiter function - simplified
function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  // Initialize or clean up existing requests for this IP
  const requests = rateLimitStore.get(ip) || [];
  const validRequests = requests.filter((timestamp) => timestamp > windowStart);

  // Check if rate limit exceeded
  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) return false;

  // Update store and return success
  validRequests.push(now);
  rateLimitStore.set(ip, validRequests);
  return true;
}

// Format message for the OpenAI chat API
function formatChatMessage(role, content) {
  return { role, content };
}

app.post('/chat', async (req, res) => {
  const clientIp = req.ip;

  try {
    console.info(`Incoming chat request from ${clientIp}`);

    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      console.warn(`Rate limit exceeded for IP: ${clientIp}`);
      const errRes = errorResponse(
        429,
        'Rate limit exceeded. Please try again later.',
        'rate_limit',
      );
      return res.status(errRes.status).json(errRes.json);
    }

    // Validate authorization
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.warn('Request rejected: Missing authorization header');
      const errRes = errorResponse(401, 'Authorization header required', 'authentication');
      return res.status(errRes.status).json(errRes.json);
    }

    // Extract API key
    const apiKey = authHeader.replace('Bearer ', '');

    // Get request data
    const { api_provider, chat_history } = req.body || {};

    // Ensure chat_history is properly formatted
    let processedChatHistory = [];

    // If chat_history is a string, try to parse it as JSON
    if (typeof chat_history === 'string') {
      try {
        const parsed = JSON.parse(chat_history);
        if (Array.isArray(parsed)) {
          processedChatHistory = parsed;
        } else {
          // If it's not an array, create a single message
          processedChatHistory = [{ role: 'user', content: chat_history }];
        }
      } catch (e) {
        // If parsing fails, treat as a single user message
        processedChatHistory = [{ role: 'user', content: chat_history }];
      }
    }
    // If chat_history is already an array, use it directly
    else if (Array.isArray(chat_history)) {
      processedChatHistory = chat_history;
    }
    // If neither string nor array, create empty array
    else if (!chat_history) {
      processedChatHistory = [];
    }

    // Validate processedChatHistory format and normalize
    processedChatHistory = processedChatHistory
      .filter((msg) => msg && typeof msg === 'object')
      .map((msg) => {
        // Normalize message format
        if (msg.role && (msg.content !== undefined || msg.text !== undefined)) {
          return {
            role: msg.role,
            content: msg.content !== undefined ? msg.content : msg.text,
          };
        }
        return null;
      })
      .filter(Boolean); // Remove null entries

    console.info(
      `Processing chat request with ${processedChatHistory.length} messages using ${api_provider}`,
    );

    // If empty, add a default user message to avoid errors
    if (processedChatHistory.length === 0) {
      processedChatHistory = [
        {
          role: 'user',
          content: 'Hello, I need information about Red Panda Motors.',
        },
      ];
    }

    // Extract latest user message for context
    const latestUserMessage = [...processedChatHistory]
      .reverse()
      .find((msg) => msg.role === 'user');

    if (!latestUserMessage) {
      console.warn('No user message found in chat history');
      // Add a default user message if none found
      processedChatHistory.push({
        role: 'user',
        content: 'Hello, I need information about Red Panda Motors.',
      });
    }

    // Set up OpenAI client
    const openai = new OpenAI();

    // Prepare messages for OpenAI Chat API
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...processedChatHistory];

    // Make initial request to OpenAI using Chat Completions API
    let finalOutput;
    try {
      // Use gpt-4.1-nano model
      const toolsArray = dealershipTools.toolDefinitions;

      const chatResponse = await openai.chat.completions.create({
        model: 'gpt-4.1-nano',
        messages,
        tools: toolsArray,
        tool_choice: 'auto',
      });

      const responseMessage = chatResponse.choices[0].message;

      // Handle tool calls if present
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        // Process each tool call
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          console.info(`Function call detected: ${functionName}`);

          let result;
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const toolFunction = dealershipTools.toolFunctions[functionName];

            result = toolFunction
              ? toolFunction(args)
              : { error: `Function ${functionName} not implemented` };

            if (!toolFunction) {
              console.error(`Function ${functionName} called but not implemented`);
            }
          } catch (error) {
            console.error(`Error executing function ${functionName}:`, error);
            result = { error: error.message };
          }

          // Add the result to messages for follow-up
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: [toolCall],
          });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }

        // Get the final response with tool results
        const followUpResponse = await openai.chat.completions.create({
          model: 'gpt-4.1-nano',
          messages,
        });

        finalOutput = followUpResponse.choices[0].message.content;
      } else {
        // If no tool calls, use the response directly
        finalOutput = responseMessage.content;
      }
    } catch (apiError) {
      console.error('OpenAI API error:', apiError);

      // No fallback - return the error directly
      const errType = apiError.status === 401 ? 'authentication' : 'api_error';
      const errRes = errorResponse(
        apiError.status || 500,
        apiError.message || 'Error calling OpenAI API',
        errType,
      );
      return res.status(errRes.status).json(errRes.json);
    }

    // Add assistant response to chat history
    if (finalOutput) {
      const updatedChatHistory = [
        ...processedChatHistory,
        { role: 'assistant', content: finalOutput },
      ];

      console.info(`Response generated successfully: ${finalOutput.slice(0, 50)}...`);
      return res.json({ chat_history: updatedChatHistory });
    } else {
      console.warn('No valid text response found in the API response');
      const errRes = errorResponse(500, 'Failed to generate a valid response', 'no_content');
      return res.status(errRes.status).json(errRes.json);
    }
  } catch (error) {
    console.error('Error processing chat request:', error);

    // Simplified error categorization
    let errRes;
    if (error.status === 401 || (error.message && error.message.includes('API key'))) {
      errRes = errorResponse(401, 'Authentication error', 'authentication');
    } else if (error.status === 429) {
      errRes = errorResponse(429, 'Rate limit exceeded', 'rate_limit');
    } else {
      errRes = errorResponse(500, 'Internal server error', 'server_error');
    }

    return res.status(errRes.status).json(errRes.json);
  }
});

const PORT = process.env.PORT || 2345;
app.listen(PORT, () => {
  console.info(`Red Panda Motors chatbot server is running on port ${PORT}`);
});
