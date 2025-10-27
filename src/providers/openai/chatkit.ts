import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  CallApiOptionsParams,
} from '../../types';
import logger from '../../logger';
import { sanitizeObject } from '../../util/sanitizer';
import { fetchWithProxy } from '../../util/fetch';

interface ChatKitConfig {
  backendUrl?: string;
  sessionConfig?: {
    instructions?: string;
    tools?: any[];
    model?: string;
    [key: string]: any;
  };
  threadReuse?: 'none' | 'per-test' | 'per-eval';
  collectEvents?: boolean;
  streamTimeout?: number;
  apiKey?: string;
  apiBaseUrl?: string;
  domainKey?: string;
}

interface ChatKitEvent {
  type: string;
  thread?: {
    id: string;
    title?: string | null;
    created_at: string;
  };
  item?: {
    id: string;
    type: string;
    content?: any[];
    widget?: any;
    workflow?: any;
    name?: string;
    call_id?: string;
    arguments?: any;
    [key: string]: any;
  };
  item_id?: string;
  update?: {
    type: string;
    content_index?: number;
    delta?: string;
    content?: any;
    [key: string]: any;
  };
  [key: string]: any;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | any[];
}

export class OpenAIChatKitProvider implements ApiProvider {
  private workflowId: string;
  config: ChatKitConfig;
  private threadCache: Map<string, string> = new Map();
  private clientSecret: string | null = null;
  private sessionExpiry: number = 0;

  constructor(workflowId: string, config: ChatKitConfig = {}) {
    this.workflowId = workflowId;
    this.config = config;
  }

  id(): string {
    return `openai:chatkit:${this.workflowId}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      // Ensure we have a valid session
      await this.ensureSession();

      // Handle multi-turn conversations
      const messages = this.formatMessages(prompt, context);

      // Get or create thread
      const threadId = await this.getOrCreateThread(context);

      // Send message(s)
      const events =
        threadId && messages.length === 1
          ? await this.sendSingleMessage(threadId, messages[0], context)
          : await this.sendConversation(threadId, messages, context);

      // Extract response
      const output = this.extractAssistantMessage(events);
      const extractedThreadId = this.extractThreadId(events) || threadId;

      // Update thread cache
      if (extractedThreadId) {
        const reuseStrategy = this.config.threadReuse || 'none';
        if (reuseStrategy !== 'none') {
          const cacheKey =
            reuseStrategy === 'per-test' ? String(context?.vars?.testId || 'default') : 'global';
          this.threadCache.set(cacheKey, extractedThreadId);
        }
      }

      const metadata = {
        threadId: extractedThreadId,
        events: this.config.collectEvents ? events : undefined,
        toolCalls: this.extractToolCalls(events),
        widgets: this.extractWidgets(events),
        workflows: this.extractWorkflows(events),
      };

      return {
        output,
        metadata,
      };
    } catch (error) {
      logger.error('ChatKit provider error', sanitizeObject({ error }));
      throw error;
    }
  }

  /**
   * Create or refresh ChatKit session
   */
  private async ensureSession(): Promise<void> {
    // Skip session creation for custom backends
    if (this.config.backendUrl) {
      logger.debug('Using custom backend, skipping OpenAI session creation', {
        backendUrl: this.config.backendUrl,
      });
      return;
    }

    // Check if current session is still valid
    if (this.clientSecret && Date.now() < this.sessionExpiry) {
      return;
    }

    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for ChatKit');
    }

    const apiBase = this.config.apiBaseUrl || 'https://api.openai.com';

    logger.debug('Creating ChatKit session', { workflowId: this.workflowId });

    const response = await fetchWithProxy(`${apiBase}/v1/chatkit/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'chatkit_beta=v1',
      },
      body: JSON.stringify({
        workflow: { id: this.workflowId },
        user: this.config.domainKey || 'promptfoo-user',
        ...this.config.sessionConfig,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ChatKit session creation failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    if (!data.client_secret) {
      throw new Error('ChatKit session response missing client_secret');
    }

    this.clientSecret = data.client_secret;
    // Sessions typically expire in 1 hour, refresh before then
    this.sessionExpiry = Date.now() + (data.expires_after || 3600) * 1000 - 60000;

    logger.debug('ChatKit session created', {
      sessionId: data.id,
      expiresIn: data.expires_after,
      fullResponse: data, // Log full response to see what we get
    });
  }

  /**
   * Get or create thread based on reuse strategy
   */
  private async getOrCreateThread(context: CallApiContextParams | undefined): Promise<string> {
    const reuseStrategy = this.config.threadReuse || 'none';

    if (reuseStrategy === 'none') {
      return ''; // Will create new thread with first message
    }

    const cacheKey =
      reuseStrategy === 'per-test' ? String(context?.vars?.testId || 'default') : 'global';

    const cached = this.threadCache.get(cacheKey);
    if (cached) {
      logger.debug('Reusing thread', { threadId: cached, strategy: reuseStrategy });
      return cached;
    }

    return '';
  }

  /**
   * Format messages for single or multi-turn conversations
   */
  private formatMessages(
    prompt: string,
    context: CallApiContextParams | undefined,
  ): ConversationMessage[] {
    // Multi-turn conversation
    if (context?.vars?.conversation) {
      const conversation = context.vars.conversation;
      if (Array.isArray(conversation)) {
        return conversation.map((msg: any) => ({
          role: msg.role as 'user' | 'assistant',
          content:
            typeof msg.content === 'string'
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content.map((c: any) => c.text || c).join('')
                : String(msg.content),
        }));
      }
    }

    // Single message
    return [{ role: 'user', content: prompt }];
  }

  /**
   * Send a single message to existing thread
   */
  private async sendSingleMessage(
    threadId: string,
    message: ConversationMessage,
    context: CallApiContextParams | undefined,
  ): Promise<ChatKitEvent[]> {
    if (message.role !== 'user') {
      throw new Error('Only user messages can be sent to ChatKit');
    }

    const backendUrl = this.getBackendUrl();

    logger.debug('Sending message to thread', { threadId, backendUrl });

    const response = await fetchWithProxy(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'chatkit_beta=v1',
        ...(this.clientSecret ? { Authorization: `Bearer ${this.clientSecret}` } : {}),
      },
      body: JSON.stringify({
        type: 'threads.add_user_message',
        params: {
          thread_id: threadId,
          input: {
            content: [{ type: 'input_text', text: message.content }],
            attachments: [],
            quoted_text: null,
            inference_options: {},
          },
        },
        metadata: context?.vars || {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ChatKit message send failed: ${response.status} ${errorText}`);
    }

    return this.collectSSEStream(response);
  }

  /**
   * Send multi-turn conversation (create new thread)
   */
  private async sendConversation(
    existingThreadId: string | null,
    messages: ConversationMessage[],
    context: CallApiContextParams | undefined,
  ): Promise<ChatKitEvent[]> {
    if (existingThreadId) {
      // If thread exists and we have multi-turn, send only the last user message
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUserMessage) {
        return this.sendSingleMessage(existingThreadId, lastUserMessage, context);
      }
    }

    // Create new thread with first user message
    const firstUserMessage = messages.find((m) => m.role === 'user');
    if (!firstUserMessage) {
      throw new Error('No user message found in conversation');
    }

    const backendUrl = this.getBackendUrl();

    logger.debug('Creating new thread', { backendUrl });

    const response = await fetchWithProxy(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'chatkit_beta=v1',
        ...(this.clientSecret ? { Authorization: `Bearer ${this.clientSecret}` } : {}),
      },
      body: JSON.stringify({
        type: 'threads.create',
        params: {
          input: {
            content: [{ type: 'input_text', text: firstUserMessage.content }],
            attachments: [],
            quoted_text: null,
            inference_options: {},
          },
        },
        metadata: context?.vars || {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ChatKit thread creation failed: ${response.status} ${errorText}`);
    }

    let allEvents = await this.collectSSEStream(response);

    // Send remaining user messages
    const threadId = this.extractThreadId(allEvents);
    if (!threadId) {
      throw new Error('Failed to extract thread ID from response');
    }

    for (let i = 1; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'user') {
        const moreEvents = await this.sendSingleMessage(threadId, msg, context);
        allEvents = [...allEvents, ...moreEvents];
      }
    }

    return allEvents;
  }

  /**
   * Collect Server-Sent Events stream
   */
  private async collectSSEStream(response: Response): Promise<ChatKitEvent[]> {
    const events: ChatKitEvent[] = [];
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const timeout = this.config.streamTimeout || 30000;
    const startTime = Date.now();

    try {
      while (true) {
        if (Date.now() - startTime > timeout) {
          throw new Error(`ChatKit stream timeout after ${timeout}ms`);
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              continue;
            }

            try {
              const event = JSON.parse(data);
              events.push(event);

              // Log important events
              if (event.type === 'error') {
                logger.warn('ChatKit error event', { error: event });
              }
            } catch {
              logger.warn('Failed to parse ChatKit event', { line });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return events;
  }

  /**
   * Extract thread ID from events
   */
  private extractThreadId(events: ChatKitEvent[]): string {
    const threadEvent = events.find(
      (e) => e.type === 'thread.created' || e.type === 'thread.updated',
    );
    return threadEvent?.thread?.id || '';
  }

  /**
   * Extract assistant messages from events
   */
  private extractAssistantMessage(events: ChatKitEvent[]): string {
    // Find assistant_message items
    const assistantItems = events
      .filter((e) => e.type === 'thread.item.done' && e.item?.type === 'assistant_message')
      .map((e) => e.item);

    if (assistantItems.length === 0) {
      return '';
    }

    // Concatenate all assistant message content
    return assistantItems
      .flatMap((item) => item?.content || [])
      .map((content) => content.text || '')
      .join('\n');
  }

  /**
   * Extract tool calls from events
   */
  private extractToolCalls(events: ChatKitEvent[]): any[] {
    return events
      .filter((e) => e.type === 'thread.item.done' && e.item?.type === 'client_tool_call')
      .map((e) => ({
        id: e.item?.call_id,
        name: e.item?.name,
        arguments: e.item?.arguments,
        status: e.item?.status,
      }));
  }

  /**
   * Extract widgets from events
   */
  private extractWidgets(events: ChatKitEvent[]): any[] {
    return events
      .filter((e) => e.type === 'thread.item.done' && e.item?.type === 'widget')
      .map((e) => ({
        id: e.item?.id,
        widget: e.item?.widget,
        copy_text: e.item?.copy_text,
      }));
  }

  /**
   * Extract workflows from events
   */
  private extractWorkflows(events: ChatKitEvent[]): any[] {
    return events
      .filter((e) => e.type === 'thread.item.done' && e.item?.type === 'workflow')
      .map((e) => ({
        id: e.item?.id,
        workflow: e.item?.workflow,
      }));
  }

  /**
   * Get backend URL for requests
   */
  private getBackendUrl(): string {
    // Custom backend
    if (this.config.backendUrl) {
      return this.config.backendUrl;
    }

    // OpenAI hosted - Try the base chatkit endpoint (matching Python SDK pattern)
    const apiBase = this.config.apiBaseUrl || 'https://api.openai.com';
    return `${apiBase}/v1/chatkit`;
  }
}
