// This is used for fetching and sharing evals.
export const REMOTE_API_BASE_URL =
  // TODO(ian): Backwards compatibility, 2024-04-01
  process.env.NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL ||
  process.env.NEXT_PUBLIC_PROMPTFOO_BASE_URL ||
  process.env.PROMPTFOO_REMOTE_API_BASE_URL ||
  `https://api.promptfoo.dev`;

// This is used for viewing evals.
export const REMOTE_APP_BASE_URL =
  process.env.NEXT_PUBLIC_PROMPTFOO_BASE_URL ||
  process.env.PROMPTFOO_REMOTE_APP_BASE_URL ||
  `https://app.promptfoo.dev`;

// Maximum width for terminal outputs.
export const TERMINAL_MAX_WIDTH =
  process?.stdout?.columns && process?.stdout?.columns > 10 ? process?.stdout?.columns - 10 : 120;
