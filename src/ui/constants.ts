/**
 * Centralized constants for the Ink CLI UI.
 *
 * This file contains all magic numbers and configuration values used
 * throughout the UI components. Centralizing these values:
 * - Makes it easy to tune UI behavior
 * - Ensures consistency across components
 * - Documents the purpose of each value
 *
 * @module ui/constants
 */

// ============================================================================
// Timing Constants
// ============================================================================

/**
 * Timing-related constants for UI updates and batching.
 */
export const TIMING = {
  /**
   * Activity threshold for provider highlighting (ms).
   * Providers with activity within this window are highlighted.
   */
  ACTIVITY_THRESHOLD_MS: 500,

  /**
   * Interval for elapsed time tick updates (ms).
   * Controls how often the elapsed time display refreshes.
   */
  TICK_INTERVAL_MS: 250,

  /**
   * Debounce interval for token metric updates (ms).
   * Batches rapid token updates to reduce re-renders.
   */
  TOKEN_DEBOUNCE_MS: 100,

  /**
   * Batch interval for progress updates (ms).
   * Groups rapid progress updates for better performance.
   */
  BATCH_INTERVAL_MS: 50,

  /**
   * Threshold for slow render warning (ms).
   * Logs a warning if Ink render takes longer than this.
   */
  SLOW_RENDER_MS: 200,

  /**
   * Notification auto-dismiss delay (ms).
   * How long success/error notifications stay visible.
   */
  NOTIFICATION_TIMEOUT_MS: 3000,
} as const;

// ============================================================================
// Display Limits
// ============================================================================

/**
 * Limits for display elements to prevent UI overflow.
 */
export const LIMITS = {
  /**
   * Maximum visible rows in the results table.
   * Uses virtual scrolling for rows beyond this.
   */
  MAX_VISIBLE_ROWS: 25,

  /**
   * Buffer size for lazy row processing.
   * Pre-processes this many rows above/below visible area.
   */
  ROW_BUFFER_SIZE: 10,

  /**
   * Maximum processed rows to keep in cache.
   * Prevents unbounded memory growth.
   */
  MAX_CACHE_SIZE: 200,

  /**
   * Batch size for filtering operations.
   * Processes rows in batches to avoid blocking.
   */
  FILTER_BATCH_SIZE: 100,

  /**
   * Maximum label length for provider names.
   * Truncates longer names with ellipsis.
   */
  MAX_LABEL_LENGTH: 30,

  /**
   * Maximum error message length in summary.
   * Truncates longer messages with ellipsis.
   */
  MAX_ERROR_MESSAGE_LENGTH: 80,

  /**
   * Maximum prompt preview length in errors.
   * Truncates longer prompts with ellipsis.
   */
  MAX_PROMPT_PREVIEW_LENGTH: 30,

  /**
   * Reserved lines for UI chrome (header, footer, etc.).
   * Subtracted from terminal height for content area.
   */
  RESERVED_UI_LINES: 7,

  /**
   * Terminal width threshold for wide layout.
   * Below this width, uses compact layout.
   */
  WIDE_LAYOUT_MIN_WIDTH: 70,

  /**
   * Maximum errors to show in the ring buffer.
   */
  MAX_ERRORS_SHOWN: 5,

  /**
   * Maximum log entries in the ring buffer.
   */
  MAX_LOG_ENTRIES: 100,

  /**
   * Maximum rows before table performance warning.
   */
  MAX_TABLE_ROWS: 10_000,

  /**
   * Maximum cell content length before truncation.
   */
  MAX_CELL_LENGTH: 250,
} as const;

// ============================================================================
// Column Widths for Eval Screen
// ============================================================================

/**
 * Column widths for the evaluation progress display.
 * These control the layout of provider rows during evaluation.
 */
export const EVAL_COL_WIDTH = {
  /** Status indicator column (spinner/checkmark) */
  status: 2,
  /** Provider name column */
  provider: 20,
  /** Progress bar column */
  progress: 18,
  /** Pass/fail/error counts column */
  results: 14,
  /** Token count column */
  tokens: 8,
  /** Cost column */
  cost: 8,
  /** Latency column */
  latency: 6,
} as const;

// ============================================================================
// Table Layout Configuration
// ============================================================================

/**
 * Layout configuration for the results table.
 * Controls minimum/maximum widths for table columns.
 */
export const TABLE_LAYOUT = {
  /** Minimum table width before compact mode */
  MIN_TABLE_WIDTH: 60,
  /** Index column width */
  INDEX_WIDTH: 5,
  /** Minimum variable column width */
  MIN_VAR_WIDTH: 8,
  /** Maximum variable column width */
  MAX_VAR_WIDTH: 30,
  /** Minimum output column width */
  MIN_OUTPUT_WIDTH: 15,
  /** Status badge width including padding */
  BADGE_WIDTH: 8, // '[PASS] ' = 7 + 1
} as const;

// ============================================================================
// Exit Codes
// ============================================================================

/**
 * Process exit codes for signal handling.
 */
export const EXIT_CODES = {
  /** Exit code for SIGINT (Ctrl+C) - 128 + 2 */
  SIGINT: 130,
  /** Exit code for SIGTERM - 128 + 15 */
  SIGTERM: 143,
} as const;

// ============================================================================
// Terminal Escape Sequences
// ============================================================================

/**
 * ANSI escape sequences for terminal control.
 */
export const ANSI = {
  /** Set terminal title */
  SET_TITLE: (title: string) => `\x1b]0;${title}\x07`,
  /** Clear terminal title */
  CLEAR_TITLE: '\x1b]0;\x07',
} as const;

// ============================================================================
// Keyboard Keys
// ============================================================================

/**
 * Key codes for keyboard navigation.
 */
export const KEYS = {
  /** Escape key name */
  ESCAPE: 'escape',
  /** Enter key name */
  ENTER: 'return',
  /** Up arrow alternatives */
  UP: ['up', 'k'],
  /** Down arrow alternatives */
  DOWN: ['down', 'j'],
  /** Left arrow alternatives */
  LEFT: ['left', 'h'],
  /** Right arrow alternatives */
  RIGHT: ['right', 'l'],
  /** Page up key */
  PAGE_UP: 'pageup',
  /** Page down key */
  PAGE_DOWN: 'pagedown',
  /** Home key */
  HOME: 'home',
  /** End key */
  END: 'end',
} as const;

// ============================================================================
// Color Themes (Future Use)
// ============================================================================

/**
 * Default color scheme for UI elements.
 * Can be overridden by theme settings in the future.
 */
export const COLORS = {
  /** Color for passing tests/success states */
  success: 'green' as const,
  /** Color for failing tests */
  failure: 'red' as const,
  /** Color for errors */
  error: 'red' as const,
  /** Color for warnings */
  warning: 'yellow' as const,
  /** Color for informational text */
  info: 'cyan' as const,
  /** Color for running/in-progress states */
  running: 'cyan' as const,
  /** Color for pending states */
  pending: 'gray' as const,
} as const;
