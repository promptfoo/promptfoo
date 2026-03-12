/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL: string;
  readonly VITE_PROMPTFOO_VERSION: string;
  readonly VITE_PUBLIC_BASENAME: string;
  readonly VITE_PROMPTFOO_DISABLE_TELEMETRY: string;
  readonly VITE_POSTHOG_KEY: string;
  readonly VITE_POSTHOG_HOST: string;
  readonly VITE_PROMPTFOO_LAUNCHER?: string;
  readonly VITE_IS_HOSTED?: string;
  readonly VITE_PROMPTFOO_NO_CHAT?: string;
  readonly VITE_PROMPTFOO_WEB_VIEWER_TABLE_SETTING_PRETTIFY_JSON?: string;
  readonly VITE_PROMPTFOO_WEB_VIEWER_TABLE_SETTING_SHOW_PASS_FAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
