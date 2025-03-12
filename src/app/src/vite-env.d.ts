/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_PROMPTFOO_SHARE_API_URL: string;
  readonly VITE_PUBLIC_PROMPTFOO_APP_SHARE_URL: string;
  readonly VITE_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL: string;
  readonly VITE_PROMPTFOO_VERSION: string;
  readonly VITE_PUBLIC_BASENAME: string;
  readonly VITE_PROMPTFOO_DISABLE_TELEMETRY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
