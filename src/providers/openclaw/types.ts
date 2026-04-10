/**
 * OpenClaw gateway configuration as stored in ~/.openclaw/openclaw.json
 */
export interface OpenClawGatewayConfig {
  gateway?: {
    mode?: string;
    port?: number;
    bind?: string;
    customBindHost?: string;
    remote?: {
      enabled?: boolean;
      password?: string;
      token?: string;
      url?: string;
    };
    tls?: {
      enabled?: boolean;
    };
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
  action?: string;
  gateway_url?: string;
  auth_password?: string;
  auth_token?: string;
  account_id?: string;
  backend_model?: string;
  device_auth_path?: string;
  device_family?: string;
  device_identity_path?: string;
  device_token?: string;
  disable_device_auth?: boolean;
  dry_run?: boolean;
  extra_system_prompt?: string;
  message_channel?: string;
  model_override?: string;
  scopes?: string[];
  session_key?: string;
  thinking_level?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  ws_headers?: Record<string, string>;
}
