/**
 * LangChain ReAct Agent provider with OpenTelemetry tracing
 */

const path = require('path');
const { createTracedProvider, initializeTracing, wrapToolWithTracing } = require(
  path.join(__dirname, '../../shared/tracing-utils')
);
const { ChatOpenAI } = require('@langchain/openai');
const { createReactAgent } = require('@langchain/langgraph/prebuilt');
const { MemorySaver } = require('@langchain/langgraph');

// Initialize tracer
const tracer = initializeTracing('langchain-react-comparison');

// Define tools
const tools = [
  {
    name: 'calculator',
    description: 'Perform mathematical calculations',
    func: async (input) => {
      try {
        // Simple eval for demo - in production use a proper math parser
        const result = Function('"use strict"; return (' + input + ')')();
        return `Result: ${result}`;
      } catch (e) {
        return `Error calculating: ${e.message}`;
      }
    }
  },
  {
    name: 'weather',
    description: 'Get weather information for a location',
    func: async (location) => {
      // Mock weather data
      const weatherData = {
        'paris': { temp: '18°C', condition: 'Partly cloudy' },
        'tokyo': { temp: '22°C', condition: 'Sunny' },
        'new york': { temp: '15°C', condition: 'Rainy' }
      };
      
      const cityWeather = weatherData[location.toLowerCase()] || 
        { temp: '20°C', condition: 'Clear' };
      
      return `Weather in ${location}: ${cityWeather.temp}, ${cityWeather.condition}`;
    }
  }
];

// Wrap tools with tracing
const tracedTools = tools.map(tool => wrapToolWithTracing(tool, tracer));

// Create the agent
const llm = new ChatOpenAI({
  modelName: 'gpt-4-turbo-preview',
  temperature: 0
});

const agent = createReactAgent({
  llm,
  tools: tracedTools,
  checkpointSaver: new MemorySaver()
});

// Provider implementation
async function langchainProvider(prompt, options, promptfooContext) {
  const span = tracer.startSpan('langchain.react.run');
  
  try {
    span.setAttribute('agent.type', 'react');
    span.setAttribute('tools.count', tools.length);
    
    const result = await agent.invoke(
      {
        messages: [{ role: 'user', content: prompt }]
      },
      {
        configurable: {
          thread_id: promptfooContext?.testCaseId || 'default'
        }
      }
    );
    
    const lastMessage = result.messages[result.messages.length - 1];
    const output = lastMessage.content;
    
    span.setAttribute('response.length', output.length);
    span.setAttribute('messages.count', result.messages.length);
    span.setStatus({ code: 0 }); // OK
    
    return {
      output,
      metadata: {
        message_count: result.messages.length,
        tools_used: result.messages.filter(m => m.tool_calls).length
      }
    };
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message }); // ERROR
    return { error: error.message };
  } finally {
    span.end();
  }
}

// Export the traced version
module.exports = createTracedProvider(langchainProvider, {
  serviceName: 'langchain-react-comparison',
  providerType: 'langchain-react'
}); 