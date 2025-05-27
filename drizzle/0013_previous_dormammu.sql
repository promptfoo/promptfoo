DROP INDEX `eval_result_eval_id_test_idx_idx`;--> statement-breakpoint
CREATE INDEX `eval_result_test_idx_idx` ON `eval_results` (`test_idx`);--> statement-breakpoint
CREATE INDEX `eval_result_response_idx` ON `eval_results` (`response`);--> statement-breakpoint
CREATE INDEX `eval_result_grading_result_reason_idx` ON `eval_results` (json_extract(grading_result, '$.reason'));--> statement-breakpoint
CREATE INDEX `eval_result_grading_result_comment_idx` ON `eval_results` (json_extract(grading_result, '$.comment'));--> statement-breakpoint
CREATE INDEX `eval_result_test_case_vars_idx` ON `eval_results` (json_extract(test_case, '$.vars'));--> statement-breakpoint
CREATE INDEX `eval_result_test_case_metadata_idx` ON `eval_results` (json_extract(metadata, '$'));--> statement-breakpoint
CREATE INDEX `eval_result_named_scores_idx` ON `eval_results` (json_extract(named_scores, '$'));--> statement-breakpoint
CREATE INDEX `eval_result_metadata_idx` ON `eval_results` (json_extract(metadata, '$'));