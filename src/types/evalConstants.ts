/** Upper bound on `limit` for non-export page requests; must stay >= the UI's largest page-size option. */
export const EVAL_TABLE_MAX_PAGE_SIZE = 1000;

// Shared limits for outgoing trace batches and the receiving API.
export const MAX_TRACES_PER_APPEND_REQUEST = 1_000;
export const MAX_SPANS_PER_TRACE = 10_000;
export const MAX_SPANS_PER_APPEND_REQUEST = 20_000;
