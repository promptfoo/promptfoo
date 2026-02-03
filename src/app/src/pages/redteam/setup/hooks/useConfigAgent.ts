import { useCallback, useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';

/**
 * Agent message from the configuration agent
 */
export interface AgentMessage {
  id: string;
  type: 'status' | 'discovery' | 'question' | 'suggestion' | 'error' | 'success' | 'info' | 'user';
  content: string;
  timestamp: number;
  metadata?: {
    phase?: string;
    strategyId?: string;
    options?: QuickOption[];
    inputRequest?: InputRequest;
    discoveredConfig?: DiscoveredConfig;
  };
}

export interface QuickOption {
  id: string;
  label: string;
  value: unknown;
  primary?: boolean;
}

export interface InputRequest {
  type: 'api_key' | 'text' | 'choice' | 'confirmation';
  prompt: string;
  field?: string;
  placeholder?: string;
  sensitive?: boolean;
  options?: QuickOption[];
}

export interface DiscoveredConfig {
  apiType: string;
  method: 'GET' | 'POST' | 'PUT';
  path?: string;
  headers: Record<string, string>;
  body: unknown;
  transformResponse: string;
  models?: string[];
  defaultModel?: string;
  supportsStreaming?: boolean;
  session?: {
    enabled: boolean;
    idField?: string;
    idLocation?: 'header' | 'body' | 'cookie';
  };
  auth?: {
    type: 'none' | 'api_key' | 'bearer' | 'basic' | 'unknown';
    location?: 'header' | 'query';
    headerName?: string;
    queryParam?: string;
  };
}

export interface ConfigAgentSession {
  id: string;
  baseUrl: string;
  phase: 'initializing' | 'probing' | 'analyzing' | 'confirming' | 'complete' | 'error';
  verified: boolean;
  finalConfig: DiscoveredConfig | null;
}

interface UseConfigAgentReturn {
  // State
  sessionId: string | null;
  messages: AgentMessage[];
  session: ConfigAgentSession | null;
  isLoading: boolean;
  error: string | null;
  isComplete: boolean;
  finalConfig: DiscoveredConfig | null;

  // Actions
  startSession: (baseUrl: string) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  selectOption: (optionId: string) => Promise<void>;
  submitApiKey: (apiKey: string, field?: string) => Promise<void>;
  confirm: (confirmed: boolean) => Promise<void>;
  cancelSession: () => Promise<void>;
  reset: () => void;
}

/**
 * Hook for interacting with the configuration agent
 */
export function useConfigAgent(): UseConfigAgentReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [session, setSession] = useState<ConfigAgentSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track polling state to enable cleanup
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingActiveRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  // Cleanup polling on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pollingActiveRef.current = false;
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    };
  }, []);

  /**
   * Stop any active polling
   */
  const stopPolling = useCallback(() => {
    pollingActiveRef.current = false;
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, []);

  /**
   * Poll for session updates
   */
  const pollSession = useCallback(
    async (sid: string) => {
      // Stop any existing polling before starting new one
      stopPolling();
      pollingActiveRef.current = true;

      const poll = async () => {
        // Check if polling should continue
        if (!mountedRef.current || !pollingActiveRef.current) {
          return;
        }

        try {
          const response = await callApi(`/redteam/config-agent/session/${sid}`);
          if (!response.ok || !mountedRef.current || !pollingActiveRef.current) {
            return;
          }

          const data = await response.json();

          // Only update state if still mounted and polling is active
          if (!mountedRef.current || !pollingActiveRef.current) {
            return;
          }

          setMessages(data.messages || []);
          setSession(data.session || null);

          // Continue polling if not complete
          if (data.session && !['complete', 'error'].includes(data.session.phase)) {
            // Check if we're waiting for user input
            const lastMessage = data.messages?.[data.messages.length - 1];
            const waitingForInput =
              lastMessage?.metadata?.inputRequest || lastMessage?.metadata?.options;

            if (!waitingForInput && pollingActiveRef.current) {
              pollingTimeoutRef.current = setTimeout(poll, 1000);
            }
          } else {
            // Polling complete, clean up
            pollingActiveRef.current = false;
          }
        } catch {
          // Ignore polling errors, but stop if unmounted
          if (!mountedRef.current) {
            pollingActiveRef.current = false;
          }
        }
      };

      poll();
    },
    [stopPolling],
  );

  /**
   * Start a new configuration agent session
   */
  const startSession = useCallback(
    async (baseUrl: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await callApi('/redteam/config-agent/start', {
          method: 'POST',
          body: JSON.stringify({ baseUrl }),
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to start session');
        }

        const data = await response.json();
        setSessionId(data.sessionId);
        setMessages(data.messages || []);

        // Poll for updates since discovery runs async
        pollSession(data.sessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start session');
      } finally {
        setIsLoading(false);
      }
    },
    [pollSession],
  );

  /**
   * Send user input to the agent
   */
  const sendInput = useCallback(
    async (type: string, value: string | boolean, field?: string) => {
      if (!sessionId) {
        return;
      }

      setIsLoading(true);

      try {
        const response = await callApi('/redteam/config-agent/input', {
          method: 'POST',
          body: JSON.stringify({
            sessionId,
            type,
            value,
            field,
          }),
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to send input');
        }

        const data = await response.json();
        setMessages(data.messages || []);
        setSession(data.session || null);

        // Continue polling if needed
        if (data.session && !['complete', 'error'].includes(data.session.phase)) {
          const lastMessage = data.messages?.[data.messages.length - 1];
          const waitingForInput =
            lastMessage?.metadata?.inputRequest || lastMessage?.metadata?.options;

          if (!waitingForInput) {
            pollSession(sessionId);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send input');
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, pollSession],
  );

  const sendMessage = useCallback(
    async (message: string) => {
      await sendInput('message', message);
    },
    [sendInput],
  );

  const selectOption = useCallback(
    async (optionId: string) => {
      await sendInput('option', optionId);
    },
    [sendInput],
  );

  const submitApiKey = useCallback(
    async (apiKey: string, field = 'apiKey') => {
      await sendInput('api_key', apiKey, field);
    },
    [sendInput],
  );

  const confirm = useCallback(
    async (confirmed: boolean) => {
      await sendInput('confirmation', confirmed);
    },
    [sendInput],
  );

  /**
   * Cancel the current session
   */
  const cancelSession = useCallback(async () => {
    // Stop polling first
    stopPolling();

    if (!sessionId) {
      return;
    }

    try {
      await callApi(`/redteam/config-agent/session/${sessionId}`, {
        method: 'DELETE',
      });
    } catch {
      // Ignore errors
    }

    setSessionId(null);
    setMessages([]);
    setSession(null);
    setError(null);
  }, [sessionId, stopPolling]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    // Stop polling first
    stopPolling();

    setSessionId(null);
    setMessages([]);
    setSession(null);
    setError(null);
    setIsLoading(false);
  }, [stopPolling]);

  return {
    sessionId,
    messages,
    session,
    isLoading,
    error,
    isComplete: session?.phase === 'complete' && session?.verified,
    finalConfig: session?.finalConfig || null,

    startSession,
    sendMessage,
    selectOption,
    submitApiKey,
    confirm,
    cancelSession,
    reset,
  };
}
