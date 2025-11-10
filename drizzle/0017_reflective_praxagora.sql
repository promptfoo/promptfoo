CREATE INDEX `eval_result_eval_test_idx` ON `eval_results` (`eval_id`,`test_idx`);--> statement-breakpoint
CREATE INDEX `eval_result_eval_success_idx` ON `eval_results` (`eval_id`,`success`);--> statement-breakpoint
CREATE INDEX `eval_result_eval_failure_idx` ON `eval_results` (`eval_id`,`failure_reason`);--> statement-breakpoint
CREATE INDEX `eval_result_eval_test_success_idx` ON `eval_results` (`eval_id`,`test_idx`,`success`);