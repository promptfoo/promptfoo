-- Migration: Optimize database indexes for better performance
-- This migration removes inefficient indexes and adds optimized ones

-- Step 1: Remove inefficient JSON indexes that cause performance issues
DROP INDEX IF EXISTS eval_result_response_idx;
DROP INDEX IF EXISTS eval_result_test_case_vars_idx;
DROP INDEX IF EXISTS eval_result_test_case_metadata_idx;
DROP INDEX IF EXISTS eval_result_named_scores_idx;
DROP INDEX IF EXISTS eval_result_metadata_idx;

-- Step 2: Add efficient compound indexes for common query patterns

-- For loading all results for an evaluation (common operation)
CREATE INDEX IF NOT EXISTS eval_results_lookup_idx 
  ON eval_results(evalId, promptIdx, testIdx);

-- For time-based queries and sorting
CREATE INDEX IF NOT EXISTS eval_results_updated_idx 
  ON eval_results(updatedAt DESC);

-- For filtering by success/failure with eval context
CREATE INDEX IF NOT EXISTS eval_results_success_idx 
  ON eval_results(evalId, success);

-- For efficient scoring queries
CREATE INDEX IF NOT EXISTS eval_results_score_idx 
  ON eval_results(evalId, score);

-- Keep these JSON indexes as they're more targeted and useful
-- eval_result_grading_result_reason_idx
-- eval_result_grading_result_comment_idx  
-- eval_result_metadata_plugin_id_idx
-- eval_result_metadata_strategy_id_idx