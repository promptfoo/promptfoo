CREATE INDEX `eval_result_response_idx` ON `eval_results` (`response`);--> statement-breakpoint
CREATE INDEX `eval_result_grading_result_search_idx` ON `eval_results` (`grading_result`);--> statement-breakpoint
CREATE INDEX `eval_result_named_scores_idx` ON `eval_results` (`named_scores`);--> statement-breakpoint
CREATE INDEX `eval_result_metric_keys_idx` ON `eval_results` (`named_scores`);--> statement-breakpoint
CREATE INDEX `eval_result_metadata_idx` ON `eval_results` (`metadata`);--> statement-breakpoint
CREATE INDEX `eval_result_vars_search_idx` ON `eval_results` (`test_case`);