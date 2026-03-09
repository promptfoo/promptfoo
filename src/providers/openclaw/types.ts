/**
 * OpenClaw gateway configuration as stored in ~/.openclaw/openclaw.json
 */
export interface OpenClawGatewayConfig {
  gateway?: {
    mode?: string;
    port?: number;
    bind?: string;
    customBindHost?: string;
    auth?: {
      mode?: string;
      password?: string;
      token?: string;
    };
    http?: {
      endpoints?: {
        chatCompletions?: {
          enabled?: boolean;
        };
        responses?: {
          enabled?: boolean;
        };
      };
    };
  };
}

/**
 * Shared config options available to all OpenClaw providers.
 */
export interface OpenClawConfig {
  gateway_url?: string;
  auth_password?: string;
  auth_token?: string;
  session_key?: string;
  thinking_level?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}
