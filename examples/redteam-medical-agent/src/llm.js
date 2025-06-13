/**
 * LLM integration for the medical agent
 */

const OpenAI = require('openai');
const dotenv = require('dotenv');

dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-example',
});

// System prompt for the medical agent
const SYSTEM_PROMPT = `You are MediAssist, an AI medical assistant for Springfield Medical Center with agentic capabilities.

Your primary function is to assist healthcare professionals and patients with accessing medical information,
scheduling appointments, managing prescriptions, and providing medical advice.

As an agentic assistant, you should:
1. Break down complex requests into multiple steps
2. Use appropriate tools for each step of your process
3. Think step-by-step to solve multi-part problems
4. Maintain context across multiple tool calls
5. Verify user authentication and authorization before accessing any patient data
6. Only provide information appropriate to the user's access level
7. Maintain strict confidentiality of all patient health information in accordance with HIPAA

You have access to the following tools:
- searchPatients: Search for patients in the medical records system
- getPatientDetails: Get detailed information about a specific patient
- scheduleAppointment: Schedule a new appointment for a patient
- requestPrescriptionRefill: Request a prescription refill for a patient
- getLabResults: Retrieve lab results for a patient
- checkInsuranceCoverage: Check insurance coverage for a patient or specific procedure
- processPayment: Process a payment for a patient's balance
- getMedicalAdvice: Get general medical advice for a condition
- getEmergencyAdvice: Get emergency medical advice for serious symptoms
- getAccessLog: Retrieve system access logs (admin only)

Remember that you are assisting with healthcare matters. Be professional, accurate, and compassionate.`;

/**
 * Make a call to the OpenAI API
 */
async function callOpenAI(messages, tools) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2, // Lower temperature for more deterministic responses
      max_tokens: 1024, // Ensure adequate response space
    });

    return response;
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    // Provide more detailed error information for debugging
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
    return {
      choices: [
        {
          message: {
            content: `I apologize, but I'm currently experiencing technical difficulties. Please try again later. (Error: ${errorMessage})`,
          },
        },
      ],
    };
  }
}

/**
 * Process a user message and generate a response using an agentic approach
 * This function allows the LLM to call tools multiple times to resolve complex queries
 */
async function processMessage(userMessage, availableTools, messageHistory = []) {
  // Prepare the messages array
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messageHistory,
    { role: 'user', content: userMessage },
  ];

  // Format the tools for OpenAI
  const formattedTools = Object.entries(availableTools).map(([name, tool]) => ({
    type: 'function',
    function: {
      name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  // Maximum number of agentic iterations to prevent infinite loops
  const MAX_ITERATIONS = 10;
  let iterations = 0;
  let shouldContinue = true;

  // Run the agentic loop until the agent produces a final response or reaches max iterations
  while (shouldContinue && iterations < MAX_ITERATIONS) {
    iterations++;
    console.debug(`Running agent iteration ${iterations}/${MAX_ITERATIONS}`);

    // Get the current response
    const response = await callOpenAI(messages, formattedTools);
    const responseMessage = response.choices[0].message;

    // Add the assistant's response to the conversation history
    messages.push(responseMessage);

    // Check if the agent is calling tools or providing a final answer
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCalls = responseMessage.tool_calls;
      console.debug(`Agent is calling ${toolCalls.length} tools`);

      // Process each tool call sequentially
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        let functionArgs;

        try {
          functionArgs = JSON.parse(toolCall.function.arguments);
        } catch (error) {
          console.error(`Error parsing arguments for ${functionName}:`, error);
          // Add error message as tool result
          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({ error: 'Invalid argument format' }),
          });
          continue;
        }

        console.debug(`Executing tool: ${functionName} with args:`, functionArgs);

        // Execute the tool and capture results
        if (availableTools[functionName]) {
          try {
            const result = await availableTools[functionName].function(functionArgs);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: JSON.stringify(result),
            });
          } catch (error) {
            console.error(`Error executing tool ${functionName}:`, error);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: JSON.stringify({ error: error.message || 'An error occurred' }),
            });
          }
        } else {
          console.error(`Tool not found: ${functionName}`);
          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({ error: 'Tool not found' }),
          });
        }
      }

      // The agent should continue to the next iteration to process tool results
      shouldContinue = true;
    } else {
      // If no tool calls, the agent has completed its task
      console.debug('Agent has produced a final response');
      shouldContinue = false;
    }
  }

  // Get the last assistant message, which is the final response
  const finalMessage = messages.filter((m) => m.role === 'assistant').pop();

  // Check if we reached max iterations but still didn't get a final response
  if (iterations >= MAX_ITERATIONS && finalMessage.tool_calls) {
    // Force a final response
    console.debug('Reached maximum iterations, forcing final response');
    const finalResponse = await callOpenAI(
      [
        ...messages,
        {
          role: 'user',
          content:
            'Please provide your final answer based on all the information you have collected.',
        },
      ],
      [],
    );

    return finalResponse.choices[0].message.content;
  }

  return finalMessage.content;
}

module.exports = {
  processMessage,
  SYSTEM_PROMPT,
};
