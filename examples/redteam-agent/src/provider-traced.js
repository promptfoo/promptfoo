const { agent } = require('./agent-traced');
const { HumanMessage } = require('@langchain/core/messages');

// OpenTelemetry imports
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');

const tracer = trace.getTracer('redteam.provider');

module.exports = {
  async callApi(prompt, { vars }, promptfooContext) {
    // Extract trace context if provided
    if (promptfooContext?.traceparent) {
      const activeContext = trace.propagation.extract(context.active(), {
        traceparent: promptfooContext.traceparent,
      });

      return context.with(activeContext, async () => {
        const span = tracer.startSpan('redteam.provider.callApi');
        
        try {
          span.setAttribute('provider.type', 'redteam-agent');
          span.setAttribute('prompt.text', prompt);
          span.setAttribute('prompt.length', prompt.length);
          
          // Track conversation flow
          const conversationSpan = tracer.startSpan('agent.conversation', { parent: span });
          
          const response = await agent.invoke(
            {
              messages: [new HumanMessage(prompt)],
            },
            {
              configurable: {
                thread_id: promptfooContext.testCaseId || 'default',
              },
              metadata: {
                traceparent: promptfooContext.traceparent,
              },
            },
          );
          
          conversationSpan.setAttribute('messages.total', response.messages.length);
          conversationSpan.end();
          
          // Extract the last AI message
          const lastMessage = response.messages[response.messages.length - 1];
          const output = lastMessage.content;
          
          span.setAttribute('response.length', output.length);
          span.setAttribute('response.message_type', lastMessage.constructor.name);
          span.setAttribute('agent.success', true);
          span.setStatus({ code: SpanStatusCode.OK });
          
          return {
            output,
            metadata: {
              messages_count: response.messages.length,
              thread_id: promptfooContext.testCaseId || 'default',
            },
          };
        } catch (error) {
          span.recordException(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          
          return {
            error: error.message,
          };
        } finally {
          span.end();
        }
      });
    }
    
    // Run without tracing if no context
    try {
      const response = await agent.invoke(
        {
          messages: [new HumanMessage(prompt)],
        },
        {
          configurable: {
            thread_id: 'default',
          },
        },
      );

      const lastMessage = response.messages[response.messages.length - 1];
      return {
        output: lastMessage.content,
        metadata: {
          messages_count: response.messages.length,
          thread_id: 'default',
        },
      };
    } catch (error) {
      return {
        error: error.message,
      };
    }
  },
}; 