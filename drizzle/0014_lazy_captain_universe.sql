DROP INDEX `eval_result_test_idx_idx`;--> statement-breakpoint
CREATE INDEX `eval_result_test_idx` ON `eval_results` (`test_idx`);