import type { OpenAiSharedOptions } from './types';

/**
 * Configuration options for the OpenAI ChatKit Provider
 */
export interface OpenAiChatKitOptions extends OpenAiSharedOptions {
  /**
   * The ChatKit workflow ID from Agent Builder (e.g., wf_xxxx)
   */
  workflowId?: string;

  /**
   * The version of the workflow to use
   */
  version?: string;

  /**
   * User identifier for the ChatKit session.
   * If not set, a unique ID with timestamp is generated.
   * @default 'promptfoo-eval-<timestamp>'
   */
  userId?: string;

  /**
   * Timeout in milliseconds for waiting for a response
   * @default 120000 (2 minutes)
   */
  timeout?: number;

  /**
   * Run the browser in headless mode
   * @default true
   */
  headless?: boolean;

  /**
   * Port for the local HTTP server serving the ChatKit HTML
   * @default 0 (random available port)
   */
  serverPort?: number;

  /**
   * Use a shared browser pool for better concurrency support.
   * When enabled, a single browser with multiple contexts is used
   * instead of spawning separate browsers per test.
   * @default true
   */
  usePool?: boolean;

  /**
   * Maximum number of concurrent browser contexts when using pool mode.
   * Only applies when usePool is true.
   * If not specified, defaults to the value of --max-concurrency (or 4).
   */
  poolSize?: number;

  /**
   * How to handle workflow approval steps.
   * - 'auto-approve': Automatically click approve button when detected
   * - 'auto-reject': Automatically click reject button when detected
   * - 'skip': Don't interact with approvals, capture the approval prompt as output
   * @default 'auto-approve'
   */
  approvalHandling?: 'auto-approve' | 'auto-reject' | 'skip';

  /**
   * Maximum number of approval steps to process per message.
   * Prevents infinite loops if workflow has chained approvals.
   * @default 5
   */
  maxApprovals?: number;

  /**
   * Enable stateful/multi-turn conversation mode.
   * When enabled:
   * - The browser page is kept alive between calls
   * - First message uses newThread: true, subsequent messages use newThread: false
   * - Requires --max-concurrency 1 for reliable behavior
   * - Useful for workflows that ask follow-up questions
   * @default false
   */
  stateful?: boolean;
}
